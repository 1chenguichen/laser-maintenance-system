import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ServiceChat } from '../database/entities/service-chat.entity.js';
import { WorkOrder } from '../database/entities/work-order.entity.js';
import { Customer } from '../database/entities/customer.entity.js';
import { ChatDirection } from '../database/entities/enums.js';
import { CsPollingService } from './cs-polling.service.js';
import { sendToCustomer } from '../websocket/socketio-handler.js';

@Injectable()
export class AiService {
  private readonly apiKey = process.env.DASHSCOPE_API_KEY;
  private readonly apiUrl = 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';

  // 激光设备维修相关的系统提示词
  private readonly systemPrompt = `你是激光设备售后维修的智能客服助手。请根据以下知识库回答客户的问题。

知识库：
1. 设备不开机：检查电源连接是否正常，急停开关是否按下，保险丝是否熔断，控制面板有无报警代码
2. 激光功率不足：检查激光管是否老化，水冷系统是否正常，镜片是否污染或损坏，光路是否对准
3. 切割精度差：检查导轨润滑情况，电机是否过热，皮带张紧度，激光头是否对准
4. 报警代码E01：通常是水温过高，检查冷却水循环是否正常，水箱是否缺水，水泵是否工作
5. 报警代码E02：通常是气压异常，检查气源压力，电磁阀是否正常工作，气路是否有泄漏
6. 报警代码E03：激光管温度过高，检查水冷系统，室温是否过高，激光管是否老化
7. 设备日常保养：定期清理镜片，检查水冷系统，保持设备清洁，润滑导轨
8. 报修流程：提交报修 → 客服接单 → 工程师抢单/派单 → 工程师上门检测 → 报价确认 → 支付定金 → 开始维修 → 支付尾款 → 评价

如果客户的问题不在知识库范围内，请回复："您好，您的问题已记录，客服人员将尽快与您联系。"

如果客户要求转人工、报修、或提问超出知识库，请引导客户使用一键报修功能。`;

  constructor(
    @InjectRepository(ServiceChat)
    private serviceChatRepo: Repository<ServiceChat>,
    @InjectRepository(WorkOrder)
    private workOrderRepo: Repository<WorkOrder>,
    @InjectRepository(Customer)
    private customerRepo: Repository<Customer>,
    private csPollingService: CsPollingService,
  ) {}

  /**
   * 处理客户消息，调用AI进行回复
   */
  async processCustomerMessage(
    customerId: string,
    message: string,
    workOrderId?: string,
  ): Promise<{ reply: string; needHuman: boolean }> {
    console.log('[AI] ====== processCustomerMessage 被调用 ======');
    console.log('[AI] customerId:', customerId);
    console.log('[AI] message:', message);
    console.log('[AI] workOrderId:', workOrderId);

    // 保存客户消息
    await this.saveChatMessage(customerId, workOrderId, message, ChatDirection.INBOUND);

    // 如果客户正在和客服会话中，不再走 AI
    if (this.csPollingService.isInSession(customerId)) {
      console.log('[AI] 客户正在会话中，跳过AI，消息已保存供客服查看');
      // 消息已通过 saveChatMessage 保存，客服通过轮询获取
      return { reply: '', needHuman: false };
    }

    // 检查是否需要转人工 - 关键词匹配优先于AI判断
    const humanKeywords = ['转人工', '人工客服', '真人', '活人', '帮我报修', '我要报修', '申请报修'];
    console.log('[AI] 检查关键词数组:', humanKeywords);
    console.log('[AI] 消息是否包含"转人工":', message.includes('转人工'));
    console.log('[AI] 消息是否包含"人工":', message.includes('人工'));

    const needHuman = humanKeywords.some(keyword => {
      const found = message.includes(keyword);
      console.log('[AI] 检查关键词:', keyword, '=> 匹配:', found);
      return found;
    });
    console.log('[AI] 最终 needHuman 结果:', needHuman);

    // DEBUG: 如果消息是"转人工"，直接返回转人工
    console.log('[AI] DEBUG: message的值:', JSON.stringify(message), '长度:', message.length);
    if (message === '转人工') {
      console.log('[AI] DEBUG: 消息匹配"转人工"，强制返回 needHuman=true');
      const customer = await this.customerRepo.findOne({ where: { id: customerId } });
      const customerName = customer?.name || '客户';
      this.csPollingService.addWaitingCustomer({
        customerId,
        customerName,
        lastMessage: message,
        waitingTime: 0,
        timestamp: Date.now(),
      });
      console.log(`[AI] 客户 ${customerName} 已添加到等待队列`);
      return {
        reply: '好的，我将为您转接人工客服，请稍候...',
        needHuman: true,
      };
    } else {
      console.log('[AI] DEBUG: 消息不匹配"转人工"，继续检查needHuman');
    }

    if (needHuman) {
      // 保存AI回复
      const reply = '好的，我将为您转接人工客服，请稍候...';
      await this.saveChatMessage(customerId, workOrderId, reply, ChatDirection.OUTBOUND);

      // 获取客户名称并添加到等待队列
      const customer = await this.customerRepo.findOne({ where: { id: customerId } });
      const customerName = customer?.name || '客户';

      // 通过轮询服务通知客服有新客户需要人工服务
      this.csPollingService.addWaitingCustomer({
        customerId,
        customerName,
        lastMessage: message,
        waitingTime: 0,
        timestamp: Date.now(),
      });
      console.log(`[AI] 客户 ${customerName} 已添加到等待队列`);

      return {
        reply,
        needHuman: true,
      };
    }

    // 调用阿里云百炼API
    try {
      const reply = await this.callDashScope(message);
      // 保存AI回复
      await this.saveChatMessage(customerId, workOrderId, reply, ChatDirection.OUTBOUND);
      return { reply, needHuman: false };
    } catch (error) {
      console.error('AI API error:', error);
      // API调用失败时返回默认回复
      const fallbackReply = '抱歉，我现在无法回答您的问题，请稍后再试或选择转人工客服。';
      await this.saveChatMessage(customerId, workOrderId, fallbackReply, ChatDirection.OUTBOUND);
      return { reply: fallbackReply, needHuman: false };
    }
  }

  /**
   * 调用阿里云百炼 API
   */
  private async callDashScope(userMessage: string): Promise<string> {
    const response = await fetch(this.apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: 'qwen-plus',
        messages: [
          { role: 'system', content: this.systemPrompt },
          { role: 'user', content: userMessage },
        ],
        max_tokens: 500,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`DashScope API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || '抱歉，我没有理解您的问题。';
  }

  /**
   * 保存聊天记录
   */
  private async saveChatMessage(
    customerId: string,
    workOrderId: string | undefined,
    content: string,
    direction: ChatDirection,
  ): Promise<ServiceChat> {
    const chat = this.serviceChatRepo.create({
      customerId,
      workOrderId,
      content,
      direction,
    });
    return this.serviceChatRepo.save(chat);
  }

  /**
   * 获取客户的聊天记录
   */
  async getCustomerChats(customerId: string, workOrderId?: string): Promise<ServiceChat[]> {
    const where: any = { customerId };
    if (workOrderId) {
      where.workOrderId = workOrderId;
    }
    return this.serviceChatRepo.find({
      where,
      order: { createdAt: 'ASC' },
    });
  }

  /**
   * 客服发送消息给客户
   */
  async sendCsMessage(
    csOperatorId: string,
    customerId: string,
    message: string,
    workOrderId?: string,
  ): Promise<ServiceChat> {
    const chat = this.serviceChatRepo.create({
      customerId,
      csOperatorId,
      workOrderId,
      content: message,
      direction: ChatDirection.OUTBOUND,
    });
    const saved = await this.serviceChatRepo.save(chat);
    // 通过 WebSocket 实时推送给客户
    sendToCustomer(customerId, 'cs_message', {
      message,
      from: 'cs',
      timestamp: Date.now(),
    });
    return saved;
  }
}
