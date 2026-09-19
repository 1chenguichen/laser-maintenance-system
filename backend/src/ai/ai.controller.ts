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
    private readonly csPollingService: CsPollingService,
  ) {}

  /**
   * 工程师AI助手 - 流式代理到Dify
   */
  @Post('engineer/chat')
  async engineerChat(
    @Body() body: { query: string; conversation_id?: string },
    @Res() res: Response,
  ) {
    const difyApiKey = process.env.DIFY_API_KEY || 'app-vDGe9PBzWhaUim4CLe75qDYy';
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
          user: 'engineer-web',
          inputs: {},
          response_mode: 'streaming',
          conversation_id: body.conversation_id || '',
        }),
      });

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

      const streamRead = () => {
        reader.read().then(({ done, value }) => {
          if (done) {
            res.end();
            return;
          }
          res.write(decoder.decode(value, { stream: true }));
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
  async getChats(@Request() req: AuthenticatedRequest, @Query('workOrderId') workOrderId?: string) {
    const customerId = req.user.sub;
    return this.aiService.getCustomerChats(customerId, workOrderId);
  }

  /**
   * 客服发送消息给客户（供客服后台调用）
   */
  @Post('cs/send')
  @UseGuards(JwtAuthGuard)
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
  async getWaitingCustomers() {
    return this.csPollingService.getWaitingCustomers();
  }

  /**
   * 客服接入客户（从等待队列移除，进入活跃会话）
   */
  @Post('cs/accept')
  @UseGuards(JwtAuthGuard)
  async acceptCustomer(@Body() body: { customerId: string; csOperatorId: string }) {
    this.csPollingService.startSession(body.customerId, body.csOperatorId);
    // 通过 WebSocket 通知客户
    sendToCustomer(body.customerId, 'cs_accepted', { csOperatorId: body.csOperatorId });
    return { success: true };
  }

  /**
   * 提交满意度评价（客服发起评价邀请）
   */
  @Post('cs/rating')
  @UseGuards(JwtAuthGuard)
  async submitRating(@Body() body: { customerId: string; rating: number; tags: string[]; remark?: string }) {
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
