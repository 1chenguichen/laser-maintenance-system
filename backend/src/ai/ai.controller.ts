import { currentTenant, tenantContext } from '../tenancy/context.js';
import { RedisService } from '../redis/redis.service.js';
import { Roles } from '../auth/roles.decorator.js';
import { Controller, Post, Get, Body, Param, Query, Request, UseGuards, Res } from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { AiService } from './ai.service.js';
import { CsPollingService } from './cs-polling.service.js';
import { sendToCustomer } from '../websocket/socketio-handler.js';

interface AuthenticatedRequest {
  user: { sub: string };
}

interface SendMessageDto {
  message: string;
  workOrderId?: string;
}

interface CsSendMessageDto {
  customerId: string;
  message: string;
  workOrderId?: string;
}

@Controller('ai')
export class AiController {
  constructor(
    private readonly aiService: AiService,
    private readonly redis: RedisService,
    private readonly csPollingService: CsPollingService,
  ) {}

  /**
   * 工程师AI助手 - 流式代理到Dify
   */
  @Post('engineer/chat')
  @UseGuards(JwtAuthGuard)
  @Roles('engineer')
  async engineerChat(
    @Body() body: { query: string; conversation_id?: string },
    @Res() res: Response,
  ) {
    const identity = tenantContext.getStore()!.user;
    if (body.conversation_id && await this.redis.get('dify:' + body.conversation_id) !== identity.sub) { res.status(403).json({message:'该会话不属于当前账号'}); return; }
    const difyApiKey = process.env.DIFY_API_KEY;
    if (!difyApiKey) { res.status(503).json({ message: '工程师AI服务尚未配置 DIFY_API_KEY' }); return; }
    const difyApiUrl = 'https://api.dify.ai/v1/chat-messages';

    try {
      const response = await fetch(difyApiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + difyApiKey,
        },
        body: JSON.stringify({
          query: body.query,
          user: currentTenant().id + ':engineer:' + identity.sub,
          inputs: {},
          response_mode: 'streaming',
          conversation_id: body.conversation_id || '',
        }),
      });

      if (!response.ok) { res.status(502).json({ message: 'AI服务请求失败，请检查服务配置' }); return; }

      // 透传 Dify 的响应头
      const contentType = response.headers.get('content-type') || 'text/plain';
      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('X-Request-Id', 'engineer-' + Date.now());

      if (!response.body) {
        res.status(500).send('No response body');
        return;
      }

      // 手动流式转发
      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      let sseBuffer = "";
      const streamRead = () => {
        reader.read().then(async ({ done, value }) => {
          if (done) {
            res.end();
            return;
          }
          const chunk = decoder.decode(value, { stream: true });
          sseBuffer += chunk;
          const lines = sseBuffer.split('\n'); sseBuffer = lines.pop() || '';
          for (const line of lines) { if (line.startsWith('data:')) { let event: any; try {event=JSON.parse(line.slice(5));} catch {} if(event?.conversation_id) await this.redis.set('dify:'+event.conversation_id,identity.sub,604800); } }
          res.write(chunk);
          streamRead();
        }).catch((err) => {
          console.error('[AI] Stream error:', err);
          res.end();
        });
      };

      streamRead();
    } catch (error) {
      console.error('[AI] Dify proxy error:', error);
      res.status(500).json({ error: 'AI service unavailable' });
    }
  }

  /**
   * 客户发送消息，AI自动回复
   */
  @Post('chat')
  @UseGuards(JwtAuthGuard)
  @Roles('customer')
  async customerChat(@Request() req: AuthenticatedRequest, @Body() dto: SendMessageDto) {
    const customerId = req.user.sub;
    const result = await this.aiService.processCustomerMessage(
      customerId,
      dto.message,
      dto.workOrderId,
    );
    return result;
  }

  /**
   * 获取客户聊天记录
   */
  @Get('chats')
  @UseGuards(JwtAuthGuard)
  @Roles('customer')
  async getChats(@Request() req: AuthenticatedRequest, @Query('workOrderId') workOrderId?: string) {
    const customerId = req.user.sub;
    return this.aiService.getCustomerChats(customerId, workOrderId);
  }

  /**
   * 客服发送消息给客户（供客服后台调用）
   */
  @Post('cs/send')
  @UseGuards(JwtAuthGuard)
  @Roles('cs_operator')
  async csSendMessage(@Request() req: AuthenticatedRequest, @Body() dto: CsSendMessageDto) {
    const csOperatorId = req.user.sub;
    const chat = await this.aiService.sendCsMessage(
      csOperatorId,
      dto.customerId,
      dto.message,
      dto.workOrderId,
    );
    return chat;
  }

  /**
   * 获取指定客户的聊天记录（供客服后台调用）
   */
  @Get('cs/chats/:customerId')
  @UseGuards(JwtAuthGuard)
  @Roles('cs_operator')
  async getCustomerChatsByCs(
    @Param('customerId') customerId: string,
    @Query('workOrderId') workOrderId?: string,
  ) {
    return this.aiService.getCustomerChats(customerId, workOrderId);
  }

  /**
   * 获取等待中的客户列表（供客服后台轮询）
   */
  @Get('cs/waiting')
  @UseGuards(JwtAuthGuard)
  @Roles('cs_operator')
  async getWaitingCustomers() {
    return this.csPollingService.getWaitingCustomers();
  }

  /**
   * 客服接入客户（从等待队列移除，进入活跃会话）
   */
  @Post('cs/accept')
  @UseGuards(JwtAuthGuard)
  @Roles('cs_operator')
  async acceptCustomer(@Body() body: { customerId: string; csOperatorId?: string }, @Request() req: AuthenticatedRequest) {
    await this.aiService.assertCustomer(body.customerId);
    const csOperatorId = req.user.sub;
    this.csPollingService.startSession(body.customerId, csOperatorId);
    // 通过 WebSocket 通知客户
    sendToCustomer(body.customerId, 'cs_accepted', { csOperatorId });
    return { success: true };
  }

  @Post('cs/end')
  @UseGuards(JwtAuthGuard)
  @Roles('cs_operator')
  async endCustomerSession(@Body() body: { customerId: string }) {
    await this.aiService.assertCustomer(body.customerId);
    this.csPollingService.removeCustomer(body.customerId);
    this.csPollingService.endSession(body.customerId);
    sendToCustomer(body.customerId, 'cs_ended', {});
    return { success: true };
  }

  /**
   * 提交满意度评价（客服发起评价邀请）
   */
  @Post('cs/rating')
  @UseGuards(JwtAuthGuard)
  @Roles('cs_operator')
  async submitRating(@Body() body: { customerId: string; rating: number; tags: string[]; remark?: string }) {
    await this.aiService.assertCustomer(body.customerId);
    // 结束会话
    this.csPollingService.endSession(body.customerId);
    // 发送评价邀请给客户
    sendToCustomer(body.customerId, 'cs_rating_request', {
      rating: body.rating,
      tags: body.tags,
      remark: body.remark,
    });
    return { success: true };
  }
}
