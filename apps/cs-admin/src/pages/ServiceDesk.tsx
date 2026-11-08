import {CompanyBrand} from '../components/CompanyBrand';
import './service-workbench.css';
import {ThemeSwitcher} from '../components/AdminAppearance';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { API_BASE, getToken, tenantStorageKey } from '../api';

interface WaitingCustomer {
  customerId: string;
  customerName: string;
  lastMessage: string;
  waitingTime: number;
  timestamp: number;
}

interface ChatMessage {
  id: string;
  customerId: string;
  content: string;
  direction: 'INBOUND' | 'OUTBOUND';
  createdAt: string;
  contentType?: 'text' | 'image' | 'card';
  status?: 'sending' | 'sent' | 'delivered' | 'read' | 'error';
  quotedContent?: string;
}

interface CustomerWorkOrder {
  id: string;
  orderNo: string;
  status: string;
  faultType: string;
  createdAt: string;
  finalAmount?: string | number;
  estimatedAmount?: string | number;
  prepayAmount?: string | number;
  finalPaymentAmount?: string | number;
  device?: { model: string };
}

interface ActiveChat {
  customerId: string;
  customerName: string;
  messages: ChatMessage[];
  unreadCount: number;
  isTyping?: boolean;
  isVip?: boolean;
  device?: string;
  location?: string;
  sessionDuration?: number;
  customerSince?: string;
  totalOrders?: number;
  lastOrderNo?: string;
  lastOrderStatus?: string;
  tags?: string[];
  note?: string;
  company?: string;
  customerCode?: string;
  phone?: string;
  email?: string;
  totalSpend?: string;
  workOrders?: CustomerWorkOrder[];
}

// Material Symbols component
const Icon = ({ name, className = '' }: { name: string; className?: string }) => (
  <span className={`material-symbols-outlined ${className}`}>{name}</span>
);



// Helper function for GET requests
async function getApi(endpoint: string) {
  const token = getToken();
  const response = await fetch(`${API_BASE}${endpoint}`, {
    headers: { 'Authorization': `Bearer ${token}` },
  });
  if (!response.ok) throw new Error('API error');
  return response.json();
}

// Helper function for POST requests
async function postApi(endpoint: string, data: any) {
  const token = getToken();
  const response = await fetch(`${API_BASE}${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify(data),
  });
  if (!response.ok) throw new Error('API error');
  return response.json();
}

export default function ServiceDesk() {
  const [detailsOpen,setDetailsOpen]=useState(false);
  const [waitingList, setWaitingList] = useState<WaitingCustomer[]>([]);
  const [activeChats, setActiveChats] = useState<ActiveChat[]>(() => {
    try {
      const saved = localStorage.getItem(tenantStorageKey('cs_active_chats'));
      return saved ? JSON.parse(saved).map((chat: ActiveChat) => ({ customerId: chat.customerId, customerName: chat.customerName, messages: chat.messages || [], unreadCount: chat.unreadCount || 0 })) : [];
    } catch { return []; }
  });
  const [currentChat, setCurrentChat] = useState<ActiveChat | null>(null);
  const [messageInput, setMessageInput] = useState('');
  const [newMessageCount, setNewMessageCount] = useState(0);
  const [showRating, setShowRating] = useState(false);
  const [rating, setRating] = useState(5);
  const [ratingTags, setRatingTags] = useState<string[]>(['响应迅速']);
  const [sessionEnded, setSessionEnded] = useState(false);
  const [leftTab, setLeftTab] = useState<'current' | 'waiting' | 'ended'>('current');
  const [rightTab, setRightTab] = useState<'orders' | 'tickets' | 'track'>('orders');
  const [searchQuery, setSearchQuery] = useState('');
  const [leftPanel, setLeftPanel] = useState(true);
  const [customerError, setCustomerError] = useState('');

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const chatPollingRef = useRef<NodeJS.Timeout | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 轮询等待客户列表
  const pollWaitingCustomers = useCallback(async () => {
    try {
      const customers = await getApi('/ai/cs/waiting');
      if (Array.isArray(customers)) {
        setWaitingList(customers);
      }
    } catch (error) {
      // silent fail
    }
  }, []);

  // 轮询当前聊天的新消息
  const pollChatMessages = useCallback(async () => {
    if (!currentChat) return;
    try {
      const messages = await getApi(`/ai/cs/chats/${currentChat.customerId}`);
      if (Array.isArray(messages)) {
        const messagesWithStatus = messages.map((m: ChatMessage, index: number) => {
          const status: ChatMessage['status'] = m.direction === 'OUTBOUND' ? 'sent' : undefined;
          return { ...m, status };
        });

        const localMsgIds = new Set(currentChat.messages.map(m => m.id));
        const newMessages = messagesWithStatus.filter((m: ChatMessage) => !localMsgIds.has(m.id));

        if (newMessages.length > 0 || messagesWithStatus.length !== currentChat.messages.length) {
          setCurrentChat(prev => prev?.customerId === currentChat.customerId ? { ...prev, messages: messagesWithStatus } : prev);
          setActiveChats(prev => prev.map(c =>
            c.customerId === currentChat.customerId ? { ...c, messages: messagesWithStatus } : c
          ));
        }

        if (document.hidden && newMessages.some((m: ChatMessage) => m.direction === 'INBOUND')) {
          setNewMessageCount(prev => prev + newMessages.filter((m: ChatMessage) => m.direction === 'INBOUND').length);
        }
      }
    } catch (error) {
      console.error('Poll chat error:', error);
    }
  }, [currentChat]);

  // 启动轮询
  useEffect(() => {
    const token = getToken();
    if (!token) return;

    pollWaitingCustomers();
    pollingIntervalRef.current = setInterval(pollWaitingCustomers, 3000);

    return () => {
      if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);
    };
  }, [pollWaitingCustomers]);

  // 持久化活跃聊天到 localStorage
  useEffect(() => {
    try {
      localStorage.setItem(tenantStorageKey('cs_active_chats'), JSON.stringify(activeChats));
    } catch {}
  }, [activeChats]);

  // 页面加载时恢复 currentChat
  useEffect(() => {
    if (currentChat === null && activeChats.length > 0) {
      setCurrentChat(activeChats[0]);
    }
  }, [activeChats, currentChat]);

  // 当前聊天消息轮询
  useEffect(() => {
    if (!currentChat) {
      if (chatPollingRef.current) clearInterval(chatPollingRef.current);
      return;
    }

    pollChatMessages();
    chatPollingRef.current = setInterval(pollChatMessages, 2000);

    return () => {
      if (chatPollingRef.current) clearInterval(chatPollingRef.current);
    };
  }, [currentChat, pollChatMessages]);

  useEffect(() => {
    if (!currentChat?.customerId) return;
    let cancelled = false;
    const id = currentChat.customerId;
    setCustomerError('');
    getApi(`/admin/customers/${id}`).then(data => {
      if (cancelled) return;
      const orders: CustomerWorkOrder[] = data.workOrders || [];
      const paid = orders.filter(o => ['REPAIRING', 'PENDING_FINAL_PAYMENT', 'COMPLETED'].includes(o.status)).reduce((sum, o) => sum + Number(o.prepayAmount || 0) + Number(o.finalPaymentAmount || 0), 0);
      const address = data.addresses?.find((a: { isDefault: boolean }) => a.isDefault) || data.addresses?.[0];
      const actual = {
        customerName: data.name, phone: data.phone, customerCode: data.id,
        customerSince: data.createdAt ? data.createdAt.slice(0, 10) : undefined,
        totalOrders: orders.length, totalSpend: '¥' + paid.toFixed(2), workOrders: orders,
        location: address ? [address.province, address.city, address.district].filter(Boolean).join(' · ') : undefined,
        device: data.devices?.[0]?.model, isVip: false, company: undefined, email: undefined, tags: [], note: undefined,
      };
      setCurrentChat(prev => prev?.customerId === id ? { ...prev, ...actual } : prev);
      setActiveChats(prev => prev.map(chat => chat.customerId === id ? { ...chat, ...actual } : chat));
    }).catch(() => { if (!cancelled) setCustomerError('客户资料加载失败，请重新选择会话重试'); });
    return () => { cancelled = true; };
  }, [currentChat?.customerId]);

  // 自动滚动
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [currentChat?.messages]);

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    if (diff < 60000) return '刚刚';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`;
    if (date.toDateString() === now.toDateString()) {
      return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    }
    return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' }) + ' ' +
           date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  };

  const formatMessageTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  const formatWaitTime = (seconds: number) => {
    if (seconds < 60) return `${seconds}秒`;
    const mins = Math.floor(seconds / 60);
    if (mins < 60) return `${mins}分钟`;
    return `${Math.floor(mins / 60)}小时${mins % 60}分钟`;
  };

  const formatSessionDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (mins < 60) return `${mins}分${secs}秒`;
    const hours = Math.floor(mins / 60);
    return `${hours}小时${mins % 60}分`;
  };

  const shouldGroupWithPrev = (msg: ChatMessage, index: number) => {
    if (index === 0) return false;
    const prevMsg = currentChat?.messages[index - 1];
    if (!prevMsg) return false;
    if (prevMsg.direction !== msg.direction) return false;
    const timeDiff = new Date(msg.createdAt).getTime() - new Date(prevMsg.createdAt).getTime();
    return timeDiff < 5 * 60 * 1000;
  };

  const getStatusIcon = (status?: string) => {
    switch (status) {
      case 'sending': return <Icon name="schedule" className="text-[14px]" />;
      case 'sent': return <Icon name="check" className="text-[14px]" />;
      case 'delivered': return <Icon name="done_all" className="text-[14px] text-[#4edea3]" />;
      case 'read': return <Icon name="done_all" className="text-[14px] text-[#4edea3]" />;
      case 'error': return <span className="text-red-400">⚠</span>;
      default: return <Icon name="done_all" className="text-[14px] text-[#4edea3]" />;
    }
  };

  const acceptCustomer = async (customer: WaitingCustomer) => {
    try {
      await postApi('/ai/cs/accept', {
        customerId: customer.customerId,
        csOperatorId: 'cs-admin-001',
      });

      const existingChat = activeChats.find(c => c.customerId === customer.customerId);
      if (existingChat) {
        setCurrentChat(existingChat);
      } else {
        const newChat: ActiveChat = {
          customerId: customer.customerId,
          customerName: customer.customerName,
          messages: [],
          unreadCount: 0,
          isVip: false, sessionDuration: 0, totalOrders: 0, workOrders: [], tags: [],
        };
        setActiveChats(prev => [...prev, newChat]);
        setCurrentChat(newChat);
        setSessionEnded(false);
        setShowRating(false);
      }

      setSessionEnded(false);
      setShowRating(false);
      setWaitingList(prev => prev.filter(c => c.customerId !== customer.customerId));
    } catch (error) {
      console.error('Accept customer error:', error);
    }
  };

  const selectChat = (chat: ActiveChat) => {
    setSessionEnded(false);
    setShowRating(false);
    setCurrentChat(chat);
    setActiveChats(prev => prev.map(c =>
      c.customerId === chat.customerId ? { ...c, unreadCount: 0 } : c
    ));
  };

  const sendMessage = async () => {
    if (!messageInput.trim() || !currentChat || sessionEnded) return;

    const message = messageInput.trim();
    setMessageInput('');

    try {
      const result = await postApi('/ai/cs/send', {
        customerId: currentChat.customerId,
        message,
      });

      const newMessage: ChatMessage = {
        id: result.id || `msg-${Date.now()}`,
        customerId: currentChat.customerId,
        content: message,
        direction: 'OUTBOUND',
        createdAt: new Date().toISOString(),
        status: 'sent',
      };

      setCurrentChat(prev => prev?.customerId === newMessage.customerId ? { ...prev, messages: [...prev.messages, newMessage] } : prev);
      setActiveChats(prev => prev.map(c => {
        if (c.customerId === currentChat.customerId) {
          return { ...c, messages: [...c.messages, newMessage] };
        }
        return c;
      }));


    } catch (error) {
      console.error('Send message error:', error);
      setMessageInput(prev => prev || message);
      alert('消息未发送成功，请重试');
    }
  };

  const endSession = async () => {
    if (!currentChat) return;
    try {
      await postApi('/ai/cs/end', { customerId: currentChat.customerId });
      setSessionEnded(true);
      setShowRating(true);
    } catch (error) {
      console.error('End session error:', error);
      alert('结束服务失败，请重试');
    }
  };

  const submitRating = async () => {
    if (!currentChat) return;
    try {
      await postApi('/ai/cs/rating', {
        customerId: currentChat.customerId,
        rating: rating,
        tags: ratingTags,
      });
      // 从活跃列表移除已结束的会话
      setActiveChats(prev => prev.filter(c => c.customerId !== currentChat.customerId));
      setCurrentChat(null);
    } catch (error) {
      console.error('Submit rating error:', error);
    }
    setShowRating(false);
  };

  const insertTemplate = (text: string) => {
    if (textareaRef.current) {
      textareaRef.current.value = text;
      setMessageInput(text);
      textareaRef.current.focus();
    }
  };

  const quickReplies = [
    { label: '维修进度说明', text: '您好，我们正在核对您的维修工单，确认后将为您同步最新进度。' },
    { label: '标准问候', text: '[问候] 您好，很高兴为您服务，请问有什么可以帮您？' },
    { label: '订单号查询', text: '[核对信息] 请提供您的下单手机号或订单后6位方便快速查询。' },
  ];



  return (
    <div className={`service-workbench ${detailsOpen?'details-open':''} flex h-screen bg-[var(--skin-ground)] overflow-hidden`}>
      {/* 左侧导航栏 */}
      <aside className="w-14 bg-[var(--desk-panel)] flex flex-col items-center py-3 shadow-[0_1px_8px_rgba(0,0,0,0.04)] z-50 flex-shrink-0">
        <div className="w-9 h-9 rounded-xl bg-[var(--skin-accent)] flex items-center justify-center mb-4 shadow-[0_1px_3px_rgba(15,23,42,0.08)]">
          <Icon name="support_agent" className="text-white text-xl" />
        </div>
        <nav className="flex-1 flex flex-col items-center gap-2 w-full px-1">
          {[
            { icon: 'forum', label: '实时工作台', path:'/service-desk', active: true },
            { icon: 'confirmation_number', label: '工单队列',path:'/orders' },
            { icon: 'badge', label: '客户中心',path:'/customers' },
          ].map((item, idx) => (
            <a
              key={item.label}
              href={item.path}
              aria-label={item.label}
              aria-current={item.active?'page':undefined}
              title={item.label}
              className={`w-10 h-10 flex items-center justify-center rounded-lg transition-colors ${
                item.active
                  ? 'bg-[var(--skin-accent)] text-white'
                  : 'text-[var(--skin-muted)] hover:bg-[var(--skin-hover)] hover:text-[var(--skin-ink)]'
              }`}
            >
              <Icon name={item.icon} className="text-xl" />
            </a>
          ))}
        </nav>
        <div className="mt-auto">
          <a href="/" aria-label="返回企业后台" title="返回企业后台" className="w-10 h-10 flex items-center justify-center rounded-lg text-[var(--skin-muted)] hover:bg-[var(--skin-hover)] hover:text-[var(--skin-ink)] transition-colors">
            <Icon name="home" className="text-xl" />
          </a>
        </div>
      </aside>

      {/* 顶部Header */}
      <header className="fixed top-0 left-14 right-0 h-14 bg-[var(--desk-panel)] z-40 px-4 flex items-center justify-between shadow-[0_1px_8px_rgba(0,0,0,0.04)]">
        <div className="flex items-center gap-4">
          <CompanyBrand compact />
          <div className="flex items-center gap-1">
            <span className="text-[15px] font-semibold text-[var(--skin-ink)] tracking-tight">客服工作台</span>
            <span className="text-[11px] px-1 py-0.5 rounded-lg bg-[var(--skin-active)] text-[var(--skin-accent)] font-semibold">企业服务</span>
          </div>
          <div className="flex items-center gap-1 bg-[var(--skin-soft)] px-2 py-1 rounded-lg">
            <span className="w-2 h-2 rounded-full bg-[#4edea3]"></span>
            <span className="text-[11px] text-[var(--skin-ink)] font-medium">在线</span>
            <Icon name="expand_more" className="text-[16px] text-[var(--skin-muted)]" />
          </div>
          <div className="hidden xl:flex items-center gap-4 pl-4">
            <div className="flex items-center gap-1 text-[var(--skin-muted)] text-[11px]">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--skin-accent)]"></span>
              <span>接待中</span>
              <span className="font-bold text-[var(--skin-ink)] ml-0.5">{activeChats.length}</span>
            </div>
            <div className="w-px h-3 bg-[var(--skin-border)]"></div>
            <div className="flex items-center gap-1 text-[var(--skin-muted)] text-[11px]">
              <span className="w-1.5 h-1.5 rounded-full bg-[#ba1a1a]"></span>
              <span>待接入</span>
              <span className="font-bold text-[#ba1a1a] ml-0.5">{waitingList.length}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <ThemeSwitcher />
          <button className="desk-details-toggle" aria-expanded={detailsOpen} onClick={()=>setDetailsOpen(!detailsOpen)}>{detailsOpen?'关闭资料':'客户资料'}</button>
          <div className="relative flex items-center">
            <Icon name="search" className="absolute left-2.5 text-[16px] text-[var(--skin-muted)]" />
            <input
              className="w-56 lg:w-64 h-8 pl-8 pr-3 rounded-lg bg-[var(--skin-soft)] text-[12px] text-[var(--skin-ink)] placeholder:text-[var(--skin-muted)] focus:outline-none focus:bg-[var(--desk-panel)] focus:ring-1 focus:ring-[var(--skin-accent)]"
              aria-label="搜索会话或客户" placeholder="搜索会话/客户..."
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2 pl-2">
            <div className="w-8 h-8 rounded-full bg-[var(--skin-accent)] flex items-center justify-center shadow-sm">
              <Icon name="person" className="text-white text-[18px]" />
            </div>
            <div className="flex flex-col text-left">
              <span className="text-[12px] text-[var(--skin-ink)] font-semibold leading-tight">客服管理员</span>
              <span className="text-[11px] text-[var(--skin-muted)] leading-tight">在线</span>
            </div>
          </div>
        </div>
      </header>

      <div className="desk-columns flex w-full pt-14">
      {/* 左侧会话队列 */}
      <section className="desk-queue w-80 bg-[var(--desk-panel)] flex flex-col shadow-sm z-10 flex-shrink-0">
        {/* Panel Header */}
        <div className="p-3 pb-2 bg-[var(--desk-panel)]">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1">
              <span className="text-[15px] font-semibold text-[var(--skin-ink)]">会话队列</span>
              <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-[var(--skin-hover)] text-[var(--skin-accent)] font-medium">{activeChats.length} 在线</span>
            </div>
          </div>

          {/* Tab切换 */}
          <div className="grid grid-cols-3 gap-0.5 p-0.5 bg-[var(--skin-hover)] rounded-lg text-center">
            <button
              onClick={() => setLeftTab('current')}
              className={`py-1 px-2 rounded-md text-[11px] font-semibold transition-all flex items-center justify-center gap-1 ${
                leftTab === 'current'
                  ? 'bg-[var(--desk-panel)] text-[var(--skin-accent)] shadow-sm'
                  : 'text-[var(--skin-muted)]'
              }`}
            >
              <span>当前接待</span>
              <span className={`w-4 h-4 rounded-full text-[10px] flex items-center justify-center font-bold ${
                leftTab === 'current' ? 'bg-[var(--skin-accent)] text-white' : 'bg-[var(--skin-hover)] text-[var(--skin-muted)]'
              }`}>
                {activeChats.length}
              </span>
            </button>
            <button
              onClick={() => setLeftTab('waiting')}
              className={`py-1 px-2 rounded-md text-[11px] font-medium transition-all flex items-center justify-center gap-1 ${
                leftTab === 'waiting'
                  ? 'bg-[var(--desk-panel)] text-[var(--skin-accent)] shadow-sm'
                  : 'text-[var(--skin-muted)]'
              }`}
            >
              <span>待接入</span>
              <span className={`w-4 h-4 rounded-full text-[10px] flex items-center justify-center font-bold ${
                waitingList.length > 0 ? 'bg-[#ba1a1a] text-white' : 'bg-[var(--skin-hover)] text-[var(--skin-muted)]'
              }`}>
                {waitingList.length}
              </span>
            </button>
            <button
              onClick={() => setLeftTab('ended')}
              className={`py-1 px-2 rounded-md text-[11px] font-medium transition-all ${
                leftTab === 'ended'
                  ? 'bg-[var(--desk-panel)] text-[var(--skin-accent)] shadow-sm'
                  : 'text-[var(--skin-muted)]'
              }`}
            >
              已完结
            </button>
          </div>

          {/* 搜索框 */}
          <div className="relative flex items-center mt-1">
            <Icon name="search" className="absolute left-2.5 text-[15px] text-[var(--skin-muted)]" />
            <input
              type="text"
              placeholder="筛选客户、手机尾号、未读..."
              className="w-full h-7 pl-7 pr-7 rounded bg-[var(--skin-soft)] text-[12px] text-[var(--skin-ink)] placeholder:text-[var(--skin-muted)] focus:outline-none focus:bg-[var(--desk-panel)]"
            />
            <button className="absolute right-2 text-[var(--skin-muted)] hover:text-[var(--skin-ink)]">
              <Icon name="tune" className="text-[15px]" />
            </button>
          </div>
        </div>

        {/* 列表区域 */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {leftTab === 'current' && (
            activeChats.length === 0 ? (
              <div className="text-center text-[var(--skin-muted)] py-8">
                <div className="text-3xl mb-2"><Icon name="forum" /></div>
                <p className="text-xs">暂无活跃会话</p>
              </div>
            ) : (
              activeChats.map((chat, idx) => (
                <div
                  key={chat.customerId}
                  onClick={() => selectChat(chat)}
                  className={`relative p-2 rounded-lg cursor-pointer transition-all ${
                    currentChat?.customerId === chat.customerId
                      ? 'bg-[var(--skin-hover)] shadow-sm'
                      : 'hover:bg-[var(--skin-soft)]'
                  }`}
                >
                  {idx === 0 && (
                    <div className="absolute left-0 top-2 bottom-2 w-1 bg-[var(--skin-accent)] rounded-r" />
                  )}
                  <div className="flex items-start gap-2 pl-1.5">
                    <div className="relative flex-shrink-0">
                      <div className="w-9 h-9 rounded-full bg-[#0058be] text-white flex items-center justify-center font-medium text-[13px]">
                        {chat.customerName.charAt(0)}
                      </div>
                      <span className="absolute bottom-0 right-0 w-2 h-2 rounded-full bg-[#4edea3] ring-2 ring-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="text-[12px] font-semibold text-[var(--skin-ink)] truncate">{chat.customerName}</span>
                        {chat.messages.length > 0 && (
                          <span className="text-[11px] text-[var(--skin-muted)]">
                            {formatTime(chat.messages[chat.messages.length - 1].createdAt)}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-[12px] text-[var(--skin-muted)] truncate">
                          {chat.messages.length > 0
                            ? chat.messages[chat.messages.length - 1].content
                            : '开始对话'}
                        </p>
                        {chat.unreadCount > 0 && (
                          <span className="w-4 h-4 rounded-full bg-[var(--skin-accent)] text-white text-[10px] font-bold flex items-center justify-center">
                            {chat.unreadCount}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )
          )}

          {leftTab === 'waiting' && (
            <>
              <div className="px-2 py-1 flex items-center justify-between text-[11px] text-[var(--skin-muted)]">
                <span className="font-semibold text-[var(--skin-muted)]">待接入排队队列</span>
                <span className="text-[#ba1a1a] font-medium">{waitingList.length} 人等候</span>
              </div>
              {waitingList.length === 0 ? (
                <div className="text-center text-[var(--skin-muted)] py-4">
                  <p className="text-xs">暂无等待客户</p>
                </div>
              ) : (
                waitingList.map(customer => (
                  <div
                    key={customer.customerId}
                    onClick={() => acceptCustomer(customer)}
                    className="relative p-2 rounded-lg bg-[var(--skin-soft)]/70 hover:bg-[var(--skin-soft)] cursor-pointer transition-all opacity-90"
                  >
                    <div className="flex items-start gap-2">
                      <div className="relative flex-shrink-0">
                        <div className="w-9 h-9 rounded-full bg-[#d2d9f4] text-[var(--skin-ink)] flex items-center justify-center font-semibold text-[13px]">
                          {customer.customerName.charAt(0)}
                        </div>
                        <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-[#2170e4] ring-2 ring-white animate-pulse" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-0.5">
                          <div className="flex items-center gap-1 min-w-0">
                            <span className="text-[12px] font-semibold text-[var(--skin-ink)] truncate">
                              {customer.customerName}
                            </span>
                            <span className="px-1.5 py-0.2 rounded bg-[#ffdad6] text-[#ba1a1a] text-[10px] font-medium">
                              排队中 {formatWaitTime(Math.floor((Date.now() - customer.timestamp) / 1000))}
                            </span>
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              acceptCustomer(customer);
                            }}
                            className="btn btn-primary btn-small"
                          >
                            接入
                          </button>
                        </div>
                        <p className="text-[12px] text-[var(--skin-muted)] truncate">
                          "{customer.lastMessage || '发起求助'}"
                        </p>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </>
          )}

          {leftTab === 'ended' && (
            <div className="text-center text-[var(--skin-muted)] py-8">
              <p className="text-xs">已完成会话记录</p>
            </div>
          )}
        </div>

        {/* 底部状态 */}
        <div className="p-2 bg-[var(--skin-soft)] flex items-center justify-between text-[11px] text-[var(--skin-muted)]">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-[#4edea3]" />
            <span>自动分流已开启 ({activeChats.length}/6)</span>
          </div>
        </div>
      </section>

      {/* 中间聊天区域 */}
      <main className="flex-1 flex flex-col min-w-0 bg-[var(--skin-ground)] shadow-[0_0_12px_rgba(0,0,0,0.02)]">
        {currentChat ? (
          <>
            {/* 聊天头部 */}
            <header className="h-14 px-4 bg-[var(--desk-panel)] flex items-center justify-between flex-shrink-0 shadow-sm z-10">
              <div className="flex items-center gap-3 min-w-0">
                <div className="relative flex-shrink-0">
                  <div className="w-9 h-9 rounded-full bg-[#0058be] text-white flex items-center justify-center font-bold text-[18px]">
                    {currentChat.customerName.charAt(0)}
                  </div>
                  <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-[#4edea3] ring-2 ring-white" />
                </div>
                <div className="flex flex-col min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-[15px] text-[var(--skin-ink)] truncate">{currentChat.customerName}</span>
                    {currentChat.isVip && (
                      <span className="px-1.5 py-0.5 rounded bg-[#d8e2ff] text-[#004395] text-[11px] font-bold flex items-center gap-0.5">
                        <Icon name="workspace_premium" className="text-[13px] text-[#0058be]" />
                        企业专享VIP
                      </span>
                    )}
                    <span className="text-[11px] px-1.5 py-0.5 rounded bg-[var(--skin-hover)] text-[var(--skin-muted)]">
                      ID: {currentChat.customerId.slice(0, 7)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-[12px] text-[var(--skin-muted)] truncate">
                    {currentChat.device && (
                      <span className="flex items-center gap-1">
                        <Icon name="phone_iphone" className="text-[14px]" />
                        {currentChat.device}
                      </span>
                    )}
                    {currentChat.location && (
                      <>
                        <span>•</span>
                        <span className="flex items-center gap-1">
                          <Icon name="location_on" className="text-[14px]" />
                          {currentChat.location}
                        </span>
                      </>
                    )}
                    {currentChat.sessionDuration !== undefined && (
                      <>
                        <span>•</span>
                        <span className="text-[#005338] font-medium">会话耗时: {formatSessionDuration(currentChat.sessionDuration)}</span>
                      </>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <button className="h-8 px-2.5 rounded bg-[var(--skin-hover)] hover:bg-[var(--skin-hover)] text-[var(--skin-ink)] text-[12px] font-medium inline-flex items-center gap-1 transition-colors" title="转交其他客服或组">
                  <Icon name="forward" className="text-[16px]" />
                  <span>转接工单</span>
                </button>
                <button className="h-8 px-2.5 rounded bg-[var(--skin-hover)] hover:bg-[var(--skin-hover)] text-[var(--skin-ink)] text-[12px] font-medium inline-flex items-center gap-1 transition-colors" title="邀请质检员/二线协助">
                  <Icon name="person_add" className="text-[16px]" />
                  <span>协作邀请</span>
                </button>
                <button className="h-8 px-2.5 rounded bg-[var(--skin-hover)] hover:bg-[var(--skin-hover)] text-[var(--skin-ink)] text-[12px] font-medium inline-flex items-center gap-1 transition-colors" title="查看历史往来咨询记录">
                  <Icon name="history" className="text-[16px]" />
                  <span>历史记录</span>
                </button>
                <div className="w-px h-5 bg-[var(--skin-border)] mx-1" />
                <button
                  onClick={endSession}
                  className="h-8 px-3 rounded bg-[#ba1a1a] text-white hover:bg-[#93000a] text-[12px] font-semibold inline-flex items-center gap-1 transition-all shadow-sm"
                >
                  <Icon name="power_settings_new" className="text-[16px]" />
                  <span>结束服务</span>
                </button>
              </div>
            </header>

            {/* 消息列表 */}
            <div
              ref={messagesContainerRef}
              className="flex-1 overflow-y-auto p-4 space-y-4"
            >
              <div className="max-w-3xl mx-auto">
                {/* 时间分割线 */}
                <div className="flex items-center justify-center my-2">
                  <div className="px-3 py-1 rounded-full bg-[var(--skin-hover)] text-[var(--skin-muted)] text-[11px] flex items-center gap-1 shadow-sm">
                    <Icon name="schedule" className="text-[13px] text-[var(--skin-muted)]" />
                    <span>今天 {new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })} · 系统自动分配客服【客服管理员】接待</span>
                  </div>
                </div>

                {currentChat.messages.length === 0 ? (
                  <div className="text-center text-[var(--skin-muted)] py-12">
                    <div className="w-16 h-16 mx-auto mb-3 rounded-full bg-[var(--skin-hover)] flex items-center justify-center">
                      <Icon name="chat" className="text-3xl text-[var(--skin-accent)]" />
                    </div>
                    <p className="font-medium text-[var(--skin-muted)]">开始对话</p>
                    <p className="text-xs text-[var(--skin-muted)] mt-1">发送消息或使用快捷回复</p>
                  </div>
                ) : (
                  currentChat.messages.map((msg, index) => {
                    const isOutbound = msg.direction === 'OUTBOUND';
                    const grouped = shouldGroupWithPrev(msg, index);
                    const showAvatar = !grouped;

                    return (
                      <React.Fragment key={msg.id}>
                        <div className={`flex gap-2 max-w-[85%] ${isOutbound ? 'ml-auto flex-row-reverse' : ''}`}>
                          {/* 头像 */}
                          {!isOutbound ? (
                            showAvatar ? (
                              <div className="w-8 h-8 rounded-full bg-[#0058be] text-white flex items-center justify-center text-[13px] font-semibold shadow-sm flex-shrink-0">
                                {currentChat.customerName.charAt(0)}
                              </div>
                            ) : (
                              <div className="w-8 flex-shrink-0" />
                            )
                          ) : null}

                          <div className="flex flex-col items-start min-w-0">
                            {/* 用户名和时间 */}
                            {!isOutbound && showAvatar && (
                              <div className="flex items-center gap-2 mb-1 pl-0.5">
                                <span className="text-[11px] text-[var(--skin-muted)] font-semibold">{currentChat.customerName}</span>
                                <span className="text-[11px] text-[var(--skin-muted)]">{formatMessageTime(msg.createdAt)}</span>
                              </div>
                            )}
                            {isOutbound && showAvatar && (
                              <div className="flex items-center gap-2 mb-1 pr-0.5">
                                <span className="text-[11px] text-[var(--skin-muted)]">{formatMessageTime(msg.createdAt)}</span>
                                <span className="text-[11px] text-[var(--skin-accent)] font-semibold">客服管理员 (您)</span>
                              </div>
                            )}

                            {/* 消息气泡 */}
                            <div className={`relative px-3.5 py-2.5 rounded-xl shadow-sm group ${
                              isOutbound
                                ? 'bg-[var(--skin-accent)] text-white rounded-tr-sm'
                                : grouped
                                  ? 'bg-[var(--desk-panel)] text-[var(--skin-ink)] rounded-bl-sm rounded-br-sm border border-[var(--skin-border)]'
                                  : 'bg-[var(--desk-panel)] text-[var(--skin-ink)] rounded-bl-sm rounded-tr-lg border border-[var(--skin-border)]'
                            }`}>
                              {/* 引用内容 */}
                              {msg.quotedContent && (
                                <div className={`p-2 rounded mb-2 ${
                                  isOutbound ? 'bg-[var(--skin-accent)] text-white/80' : 'bg-[var(--skin-soft)] text-[var(--skin-muted)]'
                                }`}>
                                  <div className="flex items-center gap-1 text-[11px] font-semibold">
                                    <Icon name="format_quote" className="text-[13px]" />
                                    <span>引用 {currentChat.customerName}:</span>
                                  </div>
                                  <p className="text-[12px] italic line-clamp-2">"{msg.quotedContent}"</p>
                                </div>
                              )}

                              <p className="text-[13px] leading-relaxed whitespace-pre-wrap">{msg.content}</p>

                              {/* 悬停操作菜单 */}
                              {!isOutbound && (
                                <div className="absolute -bottom-3 right-2 hidden group-hover:flex items-center gap-0.5 px-1 py-0.5 rounded bg-[var(--desk-panel)] shadow-md text-[var(--skin-muted)]">
                                  <button className="p-1 hover:text-[var(--skin-accent)] hover:bg-[var(--skin-hover)] rounded" title="引用回复">
                                    <Icon name="format_quote" className="text-[14px]" />
                                  </button>
                                  <button className="p-1 hover:text-[var(--skin-accent)] hover:bg-[var(--skin-hover)] rounded" title="复制文本">
                                    <Icon name="content_copy" className="text-[14px]" />
                                  </button>
                                  <button className="p-1 hover:text-[var(--skin-accent)] hover:bg-[var(--skin-hover)] rounded" title="转建工单">
                                    <Icon name="add_task" className="text-[14px]" />
                                  </button>
                                </div>
                              )}

                              {/* 发送状态 */}
                              {isOutbound && showAvatar && (
                                <div className="flex items-center justify-end gap-1 mt-1 text-[11px] text-white/70">
                                  <span>{formatMessageTime(msg.createdAt)}</span>
                                  {getStatusIcon(msg.status)}
                                  {msg.status === 'delivered' && <span className="text-[10px]">已送达</span>}
                                  {msg.status === 'sent' && <span className="text-[10px]">已发送</span>}
                                </div>
                              )}
                            </div>
                          </div>

                          {/* 右侧头像 */}
                          {isOutbound ? (
                            showAvatar ? (
                              <div className="w-8 h-8 rounded-full bg-[var(--skin-accent)] text-white flex items-center justify-center text-[13px] font-semibold shadow-sm flex-shrink-0">
                                婷
                              </div>
                            ) : (
                              <div className="w-8 flex-shrink-0" />
                            )
                          ) : null}
                        </div>
                      </React.Fragment>
                    );
                  })
                )}

                {/* 正在输入 */}
                {currentChat.isTyping && (
                  <div className="flex items-center gap-2 mt-4">
                    <div className="w-8 h-8 rounded-full bg-[#0058be] text-white flex items-center justify-center text-[13px] font-semibold shadow-sm opacity-80">
                      {currentChat.customerName.charAt(0)}
                    </div>
                    <div className="flex items-center gap-2 px-3 py-2 rounded-full bg-[var(--desk-panel)] shadow-sm text-[12px] text-[var(--skin-muted)]">
                      <span className="flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-[var(--skin-accent)] animate-bounce" style={{ animationDelay: '0ms' }} />
                        <span className="w-1.5 h-1.5 rounded-full bg-[var(--skin-accent)] animate-bounce" style={{ animationDelay: '150ms' }} />
                        <span className="w-1.5 h-1.5 rounded-full bg-[var(--skin-accent)] animate-bounce" style={{ animationDelay: '300ms' }} />
                      </span>
                      <span className="italic">{currentChat.customerName} 正在输入...</span>
                    </div>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>
            </div>

            {/* 快捷回复 */}
            <div className="px-4 pt-2 bg-[var(--desk-panel)]">
              <div className="flex items-center justify-between pb-1">
                <div className="flex items-center gap-1.5 overflow-x-auto py-0.5">
                  {quickReplies.map((reply, index) => (
                    <button
                      key={index}
                      onClick={() => !sessionEnded && insertTemplate(reply.text)}
                      disabled={sessionEnded}
                      className="px-2.5 py-0.5 rounded-full bg-[var(--skin-hover)] hover:bg-[var(--skin-hover)] text-[var(--skin-muted)] hover:text-[var(--skin-accent)] transition-all text-[11px] whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {reply.label}
                    </button>
                  ))}
                </div>
                <button className="text-[var(--skin-muted)] hover:text-[var(--skin-accent)] text-[11px] font-medium flex items-center flex-shrink-0 ml-2">
                  <span>话术库</span>
                  <Icon name="chevron_right" className="text-[13px]" />
                </button>
              </div>
            </div>

            {/* 消息输入 */}
            <div className="p-4 pt-1 bg-[var(--desk-panel)] flex flex-col gap-1.5">
              {/* 输入框工具栏 */}
              <div className="flex items-center justify-between text-[var(--skin-muted)] py-1">
                <div className="flex items-center gap-1">
                  <button className="w-7 h-7 flex items-center justify-center rounded hover:bg-[var(--skin-hover)] hover:text-[var(--skin-ink)] transition-colors" title="发送图片">
                    <Icon name="image" className="text-[18px]" />
                  </button>
                  <button className="w-7 h-7 flex items-center justify-center rounded hover:bg-[var(--skin-hover)] hover:text-[var(--skin-ink)] transition-colors" title="上传附件">
                    <Icon name="attach_file" className="text-[18px]" />
                  </button>
                  <button className="w-7 h-7 flex items-center justify-center rounded hover:bg-[var(--skin-hover)] hover:text-[var(--skin-ink)] transition-colors" title="转内部便签">
                    <Icon name="sticky_note_2" className="text-[18px]" />
                  </button>
                </div>
                <div className="flex items-center gap-1 text-[11px]">
                  <span>快捷联想 (/)</span>
                </div>
              </div>

              {/* 文本输入框 */}
              <div className="relative rounded-lg bg-[var(--skin-soft)] p-2 focus-within:bg-[var(--desk-panel)] focus-within:shadow-sm transition-all">
                <textarea
                  aria-label="回复客户消息"
                  ref={textareaRef}
                  className="w-full bg-transparent resize-none text-[13px] text-[var(--skin-ink)] placeholder:text-[var(--skin-muted)] focus:outline-none"
                  value={messageInput}
                  onChange={(e) => setMessageInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      sendMessage();
                    }
                  }}
                  placeholder={sessionEnded ? '会话已结束' : "输入消息，Enter 发送，Shift+Enter 换行，输入 '/' 调出预设短语库..."}
                  disabled={sessionEnded}
                  rows={3}
                />
                <div className="flex items-center justify-between pt-1">
                  <div className="flex items-center gap-2 text-[11px] text-[var(--skin-muted)]">
                    <span>{messageInput.length}/500</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="hidden sm:flex items-center gap-1 text-[11px] text-[var(--skin-muted)]">
                      <kbd className="px-1.5 py-0.5 rounded bg-[var(--skin-hover)] text-[var(--skin-muted)]">Enter</kbd>
                      <span>发送</span>
                    </div>
                    <button
                      onClick={sendMessage}
                      disabled={!messageInput.trim() || sessionEnded}
                      className="btn btn-primary btn-small"
                    >
                      <span>发送</span>
                      <Icon name="send" className="text-[15px]" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center bg-[var(--skin-ground)]">
            <div className="text-center">
              <div className="w-24 h-24 mx-auto mb-4 rounded-full bg-[var(--skin-hover)] flex items-center justify-center">
                <Icon name="forum" className="text-5xl text-[var(--skin-accent)]" />
              </div>
              <h3 className="text-lg font-semibold text-[var(--skin-muted)] mb-2">选择会话开始对话</h3>
              <p className="text-sm text-[var(--skin-muted)]">从左侧列表选择客户或等待新请求</p>
              {newMessageCount > 0 && (
                <div className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-red-50 text-red-500 rounded-full">
                  <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                  <span className="text-sm font-medium">{newMessageCount} 条新消息</span>
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* 右侧客户信息 */}
      <aside className="desk-customer w-80 bg-[var(--desk-panel)] flex flex-col shadow-sm overflow-hidden z-10 flex-shrink-0">
        {currentChat ? (
          <>
            {/* 客户档案 */}
            <div className="p-3 bg-[var(--desk-panel)]">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-10 h-10 rounded-xl bg-[#0058be] text-white flex items-center justify-center font-bold text-[18px] shadow-sm">
                    {currentChat.customerName.charAt(0)}
                  </div>
                  <div className="flex flex-col min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold text-[15px] text-[var(--skin-ink)] truncate">{currentChat.customerName}</span>
                      {currentChat.isVip && (
                        <span className="px-1.5 py-0.2 rounded bg-[#d8e2ff] text-[#004395] text-[10px] font-bold">VIP 5</span>
                      )}
                    </div>
                    <span className="text-[11px] text-[var(--skin-muted)] truncate">{currentChat.company || '未登记公司信息'}</span>
                    <span className="text-[11px] text-[var(--skin-muted)]">编号: {currentChat.customerCode || currentChat.customerId}</span>
                  </div>
                </div>
                <button className="w-7 h-7 flex items-center justify-center rounded hover:bg-[var(--skin-hover)] text-[var(--skin-muted)] hover:text-[var(--skin-ink)] transition-colors flex-shrink-0">
                  <Icon name="edit" className="text-[16px]" />
                </button>
              </div>

              {/* 标签 */}
              <div className="flex flex-wrap gap-1 mt-2">
                {(currentChat.tags || []).map((tag, i) => (
                  <span
                    key={i}
                    className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                      i < 3
                        ? 'bg-[var(--skin-hover)] text-[var(--skin-accent)]'
                        : 'bg-[var(--skin-hover)] text-[var(--skin-muted)]'
                    }`}
                  >
                    {tag}
                  </span>
                ))}
              </div>

              {/* 联系信息 */}
              <div className="grid grid-cols-2 gap-2 mt-2 pt-2 bg-[var(--skin-soft)] p-2 rounded-lg text-[12px]">
                <div className="flex flex-col">
                  <span className="text-[11px] text-[var(--skin-muted)]">联系电话</span>
                  <span className="text-[var(--skin-ink)] font-semibold">{currentChat.phone || '未登记'}</span>
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="text-[11px] text-[var(--skin-muted)]">企业邮箱</span>
                  <span className="text-[var(--skin-ink)] font-semibold truncate">{currentChat.email || '未登记'}</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-[11px] text-[var(--skin-muted)]">注册时间</span>
                  <span className="text-[var(--skin-ink)]">{currentChat.customerSince || '—'}</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-[11px] text-[var(--skin-muted)]">累计付款</span>
                  <span className="text-[var(--skin-accent)] font-bold">{currentChat.totalSpend || '¥0.00'}</span>
                </div>
              </div>

              {/* 客服便签 */}
              {currentChat.note && (
                <div className="mt-2 p-2 rounded-lg bg-[var(--skin-hover)] text-[12px]">
                  <div className="flex items-center justify-between text-[var(--skin-ink)] font-semibold mb-1">
                    <div className="flex items-center gap-1">
                      <Icon name="edit_note" className="text-[14px] text-[#005338]" />
                      <span className="text-[11px]">客服专员便签</span>
                    </div>
                    <span className="text-[10px] text-[var(--skin-muted)]">05-12</span>
                  </div>
                  <p className="text-[var(--skin-muted)] leading-tight text-[12px]">"{currentChat.note}"</p>
                </div>
              )}
            </div>

            {/* Tab切换 */}
            <div className="flex items-center bg-[var(--skin-soft)] px-3">
              <button
                onClick={() => setRightTab('orders')}
                className={`py-2 px-3 text-[12px] font-semibold flex items-center gap-1 transition-colors ${
                  rightTab === 'orders'
                    ? 'text-[var(--skin-accent)] shadow-sm bg-[var(--desk-panel)] rounded-t-md'
                    : 'text-[var(--skin-muted)]'
                }`}
              >
                <span>历史订单</span>
                <span className={`px-1 rounded-full text-[10px] ${
                  rightTab === 'orders' ? 'bg-[var(--skin-hover)] text-[var(--skin-accent)]' : 'bg-[var(--skin-hover)] text-[var(--skin-muted)]'
                }`}>
                  {currentChat.totalOrders ?? 0}
                </span>
              </button>
              <button
                onClick={() => setRightTab('tickets')}
                className={`py-2 px-3 text-[12px] font-medium flex items-center gap-1 transition-colors ${
                  rightTab === 'tickets'
                    ? 'text-[var(--skin-accent)] shadow-sm bg-[var(--desk-panel)] rounded-t-md'
                    : 'text-[var(--skin-muted)]'
                }`}
              >
                <span>服务工单</span>
                <span className="px-1 rounded-full bg-[var(--skin-hover)] text-[var(--skin-muted)] text-[10px]">{(currentChat.workOrders || []).filter(o => !['COMPLETED', 'CANCELLED', 'REFUSED'].includes(o.status)).length}</span>
              </button>
              <button
                onClick={() => setRightTab('track')}
                className={`py-2 px-3 text-[12px] font-medium transition-colors ${
                  rightTab === 'track'
                    ? 'text-[var(--skin-accent)] shadow-sm bg-[var(--desk-panel)] rounded-t-md'
                    : 'text-[var(--skin-muted)]'
                }`}
              >
                轨迹足迹
              </button>
            </div>

            {/* 订单列表 */}
            <div className="flex-1 overflow-y-auto p-3 space-y-3 bg-[var(--desk-panel)]">
              {customerError && <p className="text-xs text-red-600">{customerError}</p>}
              {['orders', 'tickets'].includes(rightTab) && (() => {
                const rows = (currentChat.workOrders || []).filter(o => rightTab === 'orders' || !['COMPLETED', 'CANCELLED', 'REFUSED'].includes(o.status));
                const statusText: Record<string, string> = { PENDING: '待派单', DISPATCHED: '已派单', ACCEPTED: '已上门', PENDING_PAYMENT: '待确认报价/定金', REPAIRING: '维修中', PENDING_FINAL_PAYMENT: '待尾款', COMPLETED: '已完成', CANCELLED: '已取消', REFUSED: '已拒绝' };
                if (!rows.length) return <p className="text-center text-xs text-[var(--skin-muted)] py-8">暂无{rightTab === 'orders' ? '历史工单' : '进行中的服务工单'}</p>;
                return rows.map(order => <a data-testid="customer-order" key={order.id} href={`/orders/${order.id}`} className="block p-3 rounded-lg bg-[var(--skin-soft)] text-[var(--skin-ink)]">
                  <div className="flex justify-between text-xs gap-2"><strong>{order.orderNo}</strong><span>{statusText[order.status] || order.status}</span></div>
                  <p className="text-sm mt-2">{order.faultType}</p>
                  <p className="text-xs text-[var(--skin-muted)] mt-1">{order.device?.model || '设备未登记'}</p>
                  <div className="flex justify-between text-xs mt-2"><span>¥{(Number(order.finalAmount) || Number(order.estimatedAmount) || 0).toFixed(2)}</span><span>{order.createdAt?.slice(0, 10)}</span></div>
                </a>);
              })()}

              {rightTab === 'track' && (
                <div className="text-center text-[var(--skin-muted)] py-8">
                  <p className="text-xs">暂无轨迹足迹</p>
                </div>
              )}
            </div>

            {/* AI助手 */}
            <div className="p-2 bg-[var(--skin-soft)] flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-[12px] text-[var(--skin-muted)]">
                <Icon name="auto_awesome" className="text-[16px] text-[var(--skin-accent)]" />
                <span>AI 质检与知识助手</span>
              </div>
              <button disabled title="推荐话术功能尚未开通" className="px-2 py-1 rounded bg-[var(--desk-panel)] text-[var(--skin-muted)] text-[11px]">
                推荐话术 · 待开通
              </button>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center text-[var(--skin-muted)]">
              <Icon name="person" className="text-5xl mb-2" />
              <p className="text-sm">选择客户查看详情</p>
            </div>
          </div>
        )}
      </aside>
      </div>

      {/* 满意度评价弹窗 */}
      {showRating && (
        <div className="fixed inset-0 z-50 bg-[#283044]/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-[var(--desk-panel)] rounded-2xl shadow-xl overflow-hidden">
            <div className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-[var(--skin-active)] text-[var(--skin-accent)] flex items-center justify-center">
                  <Icon name="thumb_up" className="text-xl" />
                </div>
                <div>
                  <h3 className="font-semibold text-[15px] text-[var(--skin-ink)]">结束服务并发送满意度评价</h3>
                  <p className="text-[12px] text-[var(--skin-muted)]">邀请客户【{currentChat?.customerName}】对本次接待进行评分</p>
                </div>
              </div>
              <button onClick={() => setShowRating(false)} className="w-8 h-8 rounded-full hover:bg-[var(--skin-hover)] text-[var(--skin-muted)] hover:text-[var(--skin-ink)] flex items-center justify-center">
                <Icon name="close" className="text-xl" />
              </button>
            </div>

            <div className="p-4 space-y-3">
              <div className="text-center py-3 bg-[var(--skin-soft)] rounded-xl">
                <p className="text-[12px] text-[var(--skin-muted)] mb-2 font-medium">请预选服务满意度档位</p>
                <div className="flex items-center justify-center gap-2 text-[var(--skin-accent)]">
                  {[1,2,3,4,5].map(star => (
                    <button
                      key={star}
                      onClick={() => setRating(star)}
                      className="text-[28px] hover:scale-125 transition-transform"
                      style={{ fontVariationSettings: rating >= star ? "'FILL' 1" : "'FILL' 0" }}
                    >
                      ★
                    </button>
                  ))}
                </div>
                <span className="font-semibold text-[15px] text-[var(--skin-accent)] mt-1 block">
                  {rating}星 · {rating === 5 ? '非常满意' : rating === 4 ? '满意' : rating === 3 ? '一般' : '不满意'}
                </span>
              </div>

              <div>
                <label className="block text-[12px] font-semibold text-[var(--skin-ink)] mb-1.5">预选服务标签 (多选)</label>
                <div className="flex flex-wrap gap-1.5">
                  {['响应迅速', '解决彻底', '服务周到热情', '业务熟练', '主动关怀'].map(tag => (
                    <span
                      key={tag}
                      onClick={() => setRatingTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag])}
                      className={`px-2.5 py-1 rounded-full text-[11px] font-semibold cursor-pointer transition-colors ${
                        ratingTags.includes(tag)
                          ? 'bg-[var(--skin-hover)] text-[var(--skin-accent)]'
                          : 'bg-[var(--skin-hover)] text-[var(--skin-muted)] hover:text-[var(--skin-ink)]'
                      }`}
                    >
                      {ratingTags.includes(tag) ? '✓ ' : '+ '}{tag}
                    </span>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-[12px] font-semibold text-[var(--skin-ink)] mb-1">结案备注</label>
                <textarea
                  className="w-full p-2 rounded-lg bg-[var(--skin-soft)] text-[12px] text-[var(--skin-ink)] placeholder:text-[var(--skin-muted)] focus:outline-none focus:bg-[var(--desk-panel)]"
                  placeholder="已为企业VIP客户升级顺丰特快并同步单号，客户诉求已全面解决。"
                  rows={2}
                />
              </div>
            </div>

            <div className="p-4 bg-[var(--skin-soft)] flex items-center justify-between">
              <button
                onClick={() => setShowRating(false)}
                className="px-4 py-2 rounded bg-[var(--desk-panel)] text-[var(--skin-ink)] hover:bg-[var(--skin-hover)] text-[12px] font-medium transition-colors"
              >
                暂不结束
              </button>
              <button
                onClick={submitRating}
                className="px-4 py-2 rounded bg-[var(--skin-accent)] text-white hover:bg-[var(--skin-accent)] text-[12px] font-semibold transition-colors shadow-sm flex items-center gap-1"
              >
                <Icon name="send" className="text-[16px]" />
                <span>发送评价并关闭会话</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
