import React, { useState, useEffect, useRef, useCallback } from 'react';
import { getToken } from '../api';

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
}

// Material Symbols component
const Icon = ({ name, className = '' }: { name: string; className?: string }) => (
  <span className={`material-symbols-outlined ${className}`}>{name}</span>
);

const API_BASE = `${window.location.protocol}//${window.location.hostname}:8080`;

// Helper function for GET requests
async function getApi(endpoint: string) {
  const token = localStorage.getItem('cs_admin_token');
  const response = await fetch(`${API_BASE}${endpoint}`, {
    headers: { 'Authorization': `Bearer ${token}` },
  });
  if (!response.ok) throw new Error('API error');
  return response.json();
}

// Helper function for POST requests
async function postApi(endpoint: string, data: any) {
  const token = localStorage.getItem('cs_admin_token');
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
  const [waitingList, setWaitingList] = useState<WaitingCustomer[]>([]);
  const [activeChats, setActiveChats] = useState<ActiveChat[]>(() => {
    try {
      const saved = localStorage.getItem('cs_active_chats');
      return saved ? JSON.parse(saved) : [];
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
          let status: ChatMessage['status'] = 'read';
          if (m.direction === 'OUTBOUND') {
            if (index === messages.length - 1 || messages[index + 1]?.direction === 'INBOUND') {
              status = 'delivered';
            }
          }
          return { ...m, status };
        });

        const localMsgIds = new Set(currentChat.messages.map(m => m.id));
        const newMessages = messagesWithStatus.filter((m: ChatMessage) => !localMsgIds.has(m.id));

        if (newMessages.length > 0 || messagesWithStatus.length !== currentChat.messages.length) {
          setCurrentChat(prev => prev ? { ...prev, messages: messagesWithStatus } : null);
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
      localStorage.setItem('cs_active_chats', JSON.stringify(activeChats));
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
          isVip: customer.customerName.includes('VIP') || Math.random() > 0.7,
          location: '上海市 · 徐汇区',
          device: 'iOS 17.4 / App v4.8.2',
          sessionDuration: 0,
          customerSince: '2022-06-18',
          totalOrders: 12,
          company: '上海聚思创享信息科技有限公司',
          customerCode: 'CN-CORP-99201',
          phone: '138****5821',
          email: 'cx***@company.com',
          totalSpend: '¥148,920.00',
          tags: ['高净值客户', '企业月结', '偏好顺丰特快'],
          note: '客户对时效极其敏锐，公司采购频次高，遇延迟需第一时间跟进，优先走顺丰特快。',
        };
        setActiveChats(prev => [...prev, newChat]);
        setCurrentChat(newChat);
        setSessionEnded(false);
        setShowRating(false);
      }

      setWaitingList(prev => prev.filter(c => c.customerId !== customer.customerId));
    } catch (error) {
      console.error('Accept customer error:', error);
    }
  };

  const selectChat = (chat: ActiveChat) => {
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
        status: 'sending',
      };

      setCurrentChat(prev => prev ? { ...prev, messages: [...prev.messages, newMessage] } : null);
      setActiveChats(prev => prev.map(c => {
        if (c.customerId === currentChat.customerId) {
          return { ...c, messages: [...c.messages, newMessage] };
        }
        return c;
      }));

      setTimeout(() => {
        setCurrentChat(prev => prev ? {
          ...prev,
          messages: prev.messages.map(m => m.id === newMessage.id ? { ...m, status: 'sent' as const } : m)
        } : null);
      }, 500);

      setTimeout(() => {
        setCurrentChat(prev => prev ? {
          ...prev,
          messages: prev.messages.map(m => m.id === newMessage.id ? { ...m, status: 'delivered' as const } : m)
        } : null);
      }, 1000);

    } catch (error) {
      console.error('Send message error:', error);
    }
  };

  const endSession = async () => {
    if (!currentChat) return;
    try {
      await postApi('/ai/cs/end', { customerId: currentChat.customerId });
    } catch (error) {
      console.error('End session error:', error);
    }
    setSessionEnded(true);
    setShowRating(true);
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
    { label: '顺丰发货通知', text: '[顺丰物流] 您好，您的订单已进入发运阶段，顺丰单号为 SF1409228190019，请注意查收。' },
    { label: '标准问候', text: '[问候] 您好，很高兴为您服务，请问有什么可以帮您？' },
    { label: '订单号查询', text: '[核对信息] 请提供您的下单手机号或订单后6位方便快速查询。' },
  ];

  // Mock data for demo
  const mockOrders = [
    { id: 'OD202405180092', status: '顺丰配载中', product: 'Master 3S 机械定制旗舰套装', specs: '钛灰银轴 / 镭雕标 x 2', price: '¥2,599.00', date: '05-18 10:14', tracking: 'SF1409228190019', icon: 'keyboard' },
    { id: 'OD202404120018', status: '已完结', product: '4K 144Hz Type-C 12合1拓展坞', specs: '深空灰 / 100W PD x 1', price: '¥699.00', date: '04-12', icon: 'hub', signedDate: '04-14 09:30' },
    { id: 'OD202401039912', status: '已完结', product: '人体工学无线垂直鼠标 Pro', specs: '静音双模 x 5', price: '¥1,495.00', date: '01-03', icon: 'mouse' },
  ];

  return (
    <div className="flex h-screen bg-[#faf8ff] overflow-hidden">
      {/* 左侧导航栏 */}
      <aside className="w-14 bg-white flex flex-col items-center py-3 shadow-[0_1px_8px_rgba(0,0,0,0.04)] z-50 flex-shrink-0">
        <div className="w-9 h-9 rounded-xl bg-[#3525cd] flex items-center justify-center mb-4 shadow-[0_1px_3px_rgba(15,23,42,0.08)]">
          <Icon name="support_agent" className="text-white text-xl" />
        </div>
        <nav className="flex-1 flex flex-col items-center gap-2 w-full px-1">
          {[
            { icon: 'forum', label: '实时工作台', active: true },
            { icon: 'confirmation_number', label: '工单队列' },
            { icon: 'badge', label: '客户中心' },
            { icon: 'menu_book', label: '知识库话术' },
            { icon: 'analytics', label: '客服质检分析' },
          ].map((item, idx) => (
            <a
              key={item.label}
              href="#"
              title={item.label}
              className={`w-10 h-10 flex items-center justify-center rounded-lg transition-colors ${
                item.active
                  ? 'bg-[#4f46e5] text-white'
                  : 'text-[#464555] hover:bg-[#e2e7ff] hover:text-[#131b2e]'
              }`}
            >
              <Icon name={item.icon} className="text-xl" />
            </a>
          ))}
        </nav>
        <div className="mt-auto">
          <a href="#" title="工作台设置" className="w-10 h-10 flex items-center justify-center rounded-lg text-[#464555] hover:bg-[#e2e7ff] hover:text-[#131b2e] transition-colors">
            <Icon name="settings" className="text-xl" />
          </a>
        </div>
      </aside>

      {/* 顶部Header */}
      <header className="fixed top-0 left-14 right-0 h-14 bg-white z-40 px-4 flex items-center justify-between shadow-[0_1px_8px_rgba(0,0,0,0.04)]">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1">
            <span className="text-[15px] font-semibold text-[#131b2e] tracking-tight">AgentDesk</span>
            <span className="text-[11px] px-1 py-0.5 rounded-lg bg-[#e2dfff] text-[#0f0069] font-semibold">PRO</span>
          </div>
          <div className="flex items-center gap-1 bg-[#f2f3ff] px-2 py-1 rounded-lg">
            <span className="w-2 h-2 rounded-full bg-[#4edea3]"></span>
            <span className="text-[11px] text-[#131b2e] font-medium">在线</span>
            <Icon name="expand_more" className="text-[16px] text-[#777587]" />
          </div>
          <div className="hidden xl:flex items-center gap-4 pl-4">
            <div className="flex items-center gap-1 text-[#464555] text-[11px]">
              <span className="w-1.5 h-1.5 rounded-full bg-[#3525cd]"></span>
              <span>接待中</span>
              <span className="font-bold text-[#131b2e] ml-0.5">{activeChats.length}</span>
            </div>
            <div className="w-px h-3 bg-[#c7c4d8]"></div>
            <div className="flex items-center gap-1 text-[#464555] text-[11px]">
              <span className="w-1.5 h-1.5 rounded-full bg-[#ba1a1a]"></span>
              <span>待接入</span>
              <span className="font-bold text-[#ba1a1a] ml-0.5">{waitingList.length}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative flex items-center">
            <Icon name="search" className="absolute left-2.5 text-[16px] text-[#777587]" />
            <input
              className="w-56 lg:w-64 h-8 pl-8 pr-3 rounded-lg bg-[#f2f3ff] text-[12px] text-[#131b2e] placeholder:text-[#777587] focus:outline-none focus:bg-white focus:ring-1 focus:ring-[#3525cd]"
              placeholder="搜索会话/客户..."
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2 pl-2">
            <div className="w-8 h-8 rounded-full bg-[#3525cd] flex items-center justify-center shadow-sm">
              <Icon name="person" className="text-white text-[18px]" />
            </div>
            <div className="flex flex-col text-left">
              <span className="text-[12px] text-[#131b2e] font-semibold leading-tight">李婷</span>
              <span className="text-[11px] text-[#777587] leading-tight">在线</span>
            </div>
          </div>
        </div>
      </header>

      <div className="flex w-full pt-14 h-[calc(100vh-3.5rem)]">
      {/* 左侧会话队列 */}
      <section className="w-80 bg-white flex flex-col shadow-sm z-10 flex-shrink-0">
        {/* Panel Header */}
        <div className="p-3 pb-2 bg-white">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1">
              <span className="text-[15px] font-semibold text-[#131b2e]">会话队列</span>
              <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-[#e2e7ff] text-[#3525cd] font-medium">{activeChats.length} 在线</span>
            </div>
          </div>

          {/* Tab切换 */}
          <div className="grid grid-cols-3 gap-0.5 p-0.5 bg-[#e2e7ff] rounded-lg text-center">
            <button
              onClick={() => setLeftTab('current')}
              className={`py-1 px-2 rounded-md text-[11px] font-semibold transition-all flex items-center justify-center gap-1 ${
                leftTab === 'current'
                  ? 'bg-white text-[#3525cd] shadow-sm'
                  : 'text-[#464555]'
              }`}
            >
              <span>当前接待</span>
              <span className={`w-4 h-4 rounded-full text-[10px] flex items-center justify-center font-bold ${
                leftTab === 'current' ? 'bg-[#4f46e5] text-white' : 'bg-[#e2e7ff] text-[#464555]'
              }`}>
                {activeChats.length}
              </span>
            </button>
            <button
              onClick={() => setLeftTab('waiting')}
              className={`py-1 px-2 rounded-md text-[11px] font-medium transition-all flex items-center justify-center gap-1 ${
                leftTab === 'waiting'
                  ? 'bg-white text-[#3525cd] shadow-sm'
                  : 'text-[#464555]'
              }`}
            >
              <span>待接入</span>
              <span className={`w-4 h-4 rounded-full text-[10px] flex items-center justify-center font-bold ${
                waitingList.length > 0 ? 'bg-[#ba1a1a] text-white' : 'bg-[#e2e7ff] text-[#464555]'
              }`}>
                {waitingList.length}
              </span>
            </button>
            <button
              onClick={() => setLeftTab('ended')}
              className={`py-1 px-2 rounded-md text-[11px] font-medium transition-all ${
                leftTab === 'ended'
                  ? 'bg-white text-[#3525cd] shadow-sm'
                  : 'text-[#464555]'
              }`}
            >
              已完结
            </button>
          </div>

          {/* 搜索框 */}
          <div className="relative flex items-center mt-1">
            <Icon name="search" className="absolute left-2.5 text-[15px] text-[#777587]" />
            <input
              type="text"
              placeholder="筛选客户、手机尾号、未读..."
              className="w-full h-7 pl-7 pr-7 rounded bg-[#f2f3ff] text-[12px] text-[#131b2e] placeholder:text-[#777587] focus:outline-none focus:bg-white"
            />
            <button className="absolute right-2 text-[#777587] hover:text-[#131b2e]">
              <Icon name="tune" className="text-[15px]" />
            </button>
          </div>
        </div>

        {/* 列表区域 */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {leftTab === 'current' && (
            activeChats.length === 0 ? (
              <div className="text-center text-[#777587] py-8">
                <div className="text-3xl mb-2">💬</div>
                <p className="text-xs">暂无活跃会话</p>
              </div>
            ) : (
              activeChats.map((chat, idx) => (
                <div
                  key={chat.customerId}
                  onClick={() => selectChat(chat)}
                  className={`relative p-2 rounded-lg cursor-pointer transition-all ${
                    currentChat?.customerId === chat.customerId
                      ? 'bg-[#e2e7ff] shadow-sm'
                      : 'hover:bg-[#f2f3ff]'
                  }`}
                >
                  {idx === 0 && (
                    <div className="absolute left-0 top-2 bottom-2 w-1 bg-[#3525cd] rounded-r" />
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
                        <span className="text-[12px] font-semibold text-[#131b2e] truncate">{chat.customerName}</span>
                        {chat.messages.length > 0 && (
                          <span className="text-[11px] text-[#777587]">
                            {formatTime(chat.messages[chat.messages.length - 1].createdAt)}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-[12px] text-[#464555] truncate">
                          {chat.messages.length > 0
                            ? chat.messages[chat.messages.length - 1].content
                            : '开始对话'}
                        </p>
                        {chat.unreadCount > 0 && (
                          <span className="w-4 h-4 rounded-full bg-[#3525cd] text-white text-[10px] font-bold flex items-center justify-center">
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
              <div className="px-2 py-1 flex items-center justify-between text-[11px] text-[#777587]">
                <span className="font-semibold text-[#464555]">待接入排队队列</span>
                <span className="text-[#ba1a1a] font-medium">{waitingList.length} 人等候</span>
              </div>
              {waitingList.length === 0 ? (
                <div className="text-center text-[#777587] py-4">
                  <p className="text-xs">暂无等待客户</p>
                </div>
              ) : (
                waitingList.map(customer => (
                  <div
                    key={customer.customerId}
                    onClick={() => acceptCustomer(customer)}
                    className="relative p-2 rounded-lg bg-[#f2f3ff]/70 hover:bg-[#f2f3ff] cursor-pointer transition-all opacity-90"
                  >
                    <div className="flex items-start gap-2">
                      <div className="relative flex-shrink-0">
                        <div className="w-9 h-9 rounded-full bg-[#d2d9f4] text-[#131b2e] flex items-center justify-center font-semibold text-[13px]">
                          {customer.customerName.charAt(0)}
                        </div>
                        <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-[#2170e4] ring-2 ring-white animate-pulse" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-0.5">
                          <div className="flex items-center gap-1 min-w-0">
                            <span className="text-[12px] font-semibold text-[#131b2e] truncate">
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
                            className="px-2 py-0.5 rounded bg-[#3525cd] text-white text-[10px] hover:bg-[#4f46e5] transition-colors shadow-sm"
                          >
                            接入
                          </button>
                        </div>
                        <p className="text-[12px] text-[#777587] truncate">
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
            <div className="text-center text-[#777587] py-8">
              <p className="text-xs">已完成会话记录</p>
            </div>
          )}
        </div>

        {/* 底部状态 */}
        <div className="p-2 bg-[#f2f3ff] flex items-center justify-between text-[11px] text-[#464555]">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-[#4edea3]" />
            <span>自动分流已开启 ({activeChats.length}/6)</span>
          </div>
        </div>
      </section>

      {/* 中间聊天区域 */}
      <main className="flex-1 flex flex-col min-w-0 bg-[#eaedff] shadow-[0_0_12px_rgba(0,0,0,0.02)]">
        {currentChat ? (
          <>
            {/* 聊天头部 */}
            <header className="h-14 px-4 bg-white flex items-center justify-between flex-shrink-0 shadow-sm z-10">
              <div className="flex items-center gap-3 min-w-0">
                <div className="relative flex-shrink-0">
                  <div className="w-9 h-9 rounded-full bg-[#0058be] text-white flex items-center justify-center font-bold text-[18px]">
                    {currentChat.customerName.charAt(0)}
                  </div>
                  <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-[#4edea3] ring-2 ring-white" />
                </div>
                <div className="flex flex-col min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-[15px] text-[#131b2e] truncate">{currentChat.customerName}</span>
                    {currentChat.isVip && (
                      <span className="px-1.5 py-0.5 rounded bg-[#d8e2ff] text-[#004395] text-[11px] font-bold flex items-center gap-0.5">
                        <Icon name="workspace_premium" className="text-[13px] text-[#0058be]" />
                        企业专享VIP
                      </span>
                    )}
                    <span className="text-[11px] px-1.5 py-0.5 rounded bg-[#e2e7ff] text-[#777587]">
                      ID: {currentChat.customerId.slice(0, 7)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-[12px] text-[#777587] truncate">
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
                <button className="h-8 px-2.5 rounded bg-[#e2e7ff] hover:bg-[#dae2fd] text-[#131b2e] text-[12px] font-medium inline-flex items-center gap-1 transition-colors" title="转交其他客服或组">
                  <Icon name="forward" className="text-[16px]" />
                  <span>转接工单</span>
                </button>
                <button className="h-8 px-2.5 rounded bg-[#e2e7ff] hover:bg-[#dae2fd] text-[#131b2e] text-[12px] font-medium inline-flex items-center gap-1 transition-colors" title="邀请质检员/二线协助">
                  <Icon name="person_add" className="text-[16px]" />
                  <span>协作邀请</span>
                </button>
                <button className="h-8 px-2.5 rounded bg-[#e2e7ff] hover:bg-[#dae2fd] text-[#131b2e] text-[12px] font-medium inline-flex items-center gap-1 transition-colors" title="查看历史往来咨询记录">
                  <Icon name="history" className="text-[16px]" />
                  <span>历史记录</span>
                </button>
                <div className="w-px h-5 bg-[#c7c4d8] mx-1" />
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
                  <div className="px-3 py-1 rounded-full bg-[#e2e7ff] text-[#464555] text-[11px] flex items-center gap-1 shadow-sm">
                    <Icon name="schedule" className="text-[13px] text-[#777587]" />
                    <span>今天 {new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })} · 系统自动分配客服【李婷】接待</span>
                  </div>
                </div>

                {currentChat.messages.length === 0 ? (
                  <div className="text-center text-[#777587] py-12">
                    <div className="w-16 h-16 mx-auto mb-3 rounded-full bg-[#e2e7ff] flex items-center justify-center">
                      <Icon name="chat" className="text-3xl text-[#3525cd]" />
                    </div>
                    <p className="font-medium text-[#464555]">开始对话</p>
                    <p className="text-xs text-[#777587] mt-1">发送消息或使用快捷回复</p>
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
                                <span className="text-[11px] text-[#464555] font-semibold">{currentChat.customerName}</span>
                                <span className="text-[11px] text-[#777587]">{formatMessageTime(msg.createdAt)}</span>
                              </div>
                            )}
                            {isOutbound && showAvatar && (
                              <div className="flex items-center gap-2 mb-1 pr-0.5">
                                <span className="text-[11px] text-[#777587]">{formatMessageTime(msg.createdAt)}</span>
                                <span className="text-[11px] text-[#3525cd] font-semibold">李婷 (您)</span>
                              </div>
                            )}

                            {/* 消息气泡 */}
                            <div className={`relative px-3.5 py-2.5 rounded-xl shadow-sm group ${
                              isOutbound
                                ? 'bg-[#4f46e5] text-white rounded-tr-sm'
                                : grouped
                                  ? 'bg-white text-[#131b2e] rounded-bl-sm rounded-br-sm border border-[#c7c4d8]'
                                  : 'bg-white text-[#131b2e] rounded-bl-sm rounded-tr-lg border border-[#c7c4d8]'
                            }`}>
                              {/* 引用内容 */}
                              {msg.quotedContent && (
                                <div className={`p-2 rounded mb-2 ${
                                  isOutbound ? 'bg-[#3525cd] text-white/80' : 'bg-[#f2f3ff] text-[#464555]'
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
                                <div className="absolute -bottom-3 right-2 hidden group-hover:flex items-center gap-0.5 px-1 py-0.5 rounded bg-white shadow-md text-[#777587]">
                                  <button className="p-1 hover:text-[#3525cd] hover:bg-[#e2e7ff] rounded" title="引用回复">
                                    <Icon name="format_quote" className="text-[14px]" />
                                  </button>
                                  <button className="p-1 hover:text-[#3525cd] hover:bg-[#e2e7ff] rounded" title="复制文本">
                                    <Icon name="content_copy" className="text-[14px]" />
                                  </button>
                                  <button className="p-1 hover:text-[#3525cd] hover:bg-[#e2e7ff] rounded" title="转建工单">
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
                              <div className="w-8 h-8 rounded-full bg-[#3525cd] text-white flex items-center justify-center text-[13px] font-semibold shadow-sm flex-shrink-0">
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
                    <div className="flex items-center gap-2 px-3 py-2 rounded-full bg-white shadow-sm text-[12px] text-[#464555]">
                      <span className="flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#3525cd] animate-bounce" style={{ animationDelay: '0ms' }} />
                        <span className="w-1.5 h-1.5 rounded-full bg-[#3525cd] animate-bounce" style={{ animationDelay: '150ms' }} />
                        <span className="w-1.5 h-1.5 rounded-full bg-[#3525cd] animate-bounce" style={{ animationDelay: '300ms' }} />
                      </span>
                      <span className="italic">{currentChat.customerName} 正在输入...</span>
                    </div>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>
            </div>

            {/* 快捷回复 */}
            <div className="px-4 pt-2 bg-white">
              <div className="flex items-center justify-between pb-1">
                <div className="flex items-center gap-1.5 overflow-x-auto py-0.5">
                  {quickReplies.map((reply, index) => (
                    <button
                      key={index}
                      onClick={() => !sessionEnded && insertTemplate(reply.text)}
                      disabled={sessionEnded}
                      className="px-2.5 py-0.5 rounded-full bg-[#e2e7ff] hover:bg-[#dae2fd] text-[#464555] hover:text-[#3525cd] transition-all text-[11px] whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {reply.label}
                    </button>
                  ))}
                </div>
                <button className="text-[#777587] hover:text-[#3525cd] text-[11px] font-medium flex items-center flex-shrink-0 ml-2">
                  <span>话术库</span>
                  <Icon name="chevron_right" className="text-[13px]" />
                </button>
              </div>
            </div>

            {/* 消息输入 */}
            <div className="p-4 pt-1 bg-white flex flex-col gap-1.5">
              {/* 输入框工具栏 */}
              <div className="flex items-center justify-between text-[#777587] py-1">
                <div className="flex items-center gap-1">
                  <button className="w-7 h-7 flex items-center justify-center rounded hover:bg-[#e2e7ff] hover:text-[#131b2e] transition-colors" title="发送图片">
                    <Icon name="image" className="text-[18px]" />
                  </button>
                  <button className="w-7 h-7 flex items-center justify-center rounded hover:bg-[#e2e7ff] hover:text-[#131b2e] transition-colors" title="上传附件">
                    <Icon name="attach_file" className="text-[18px]" />
                  </button>
                  <button className="w-7 h-7 flex items-center justify-center rounded hover:bg-[#e2e7ff] hover:text-[#131b2e] transition-colors" title="转内部便签">
                    <Icon name="sticky_note_2" className="text-[18px]" />
                  </button>
                </div>
                <div className="flex items-center gap-1 text-[11px]">
                  <span>快捷联想 (/)</span>
                </div>
              </div>

              {/* 文本输入框 */}
              <div className="relative rounded-lg bg-[#f2f3ff] p-2 focus-within:bg-white focus-within:shadow-sm transition-all">
                <textarea
                  ref={textareaRef}
                  className="w-full bg-transparent resize-none text-[13px] text-[#131b2e] placeholder:text-[#777587] focus:outline-none"
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
                  <div className="flex items-center gap-2 text-[11px] text-[#777587]">
                    <span>{messageInput.length}/500</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="hidden sm:flex items-center gap-1 text-[11px] text-[#777587]">
                      <kbd className="px-1.5 py-0.5 rounded bg-[#dae2fd] text-[#464555]">Enter</kbd>
                      <span>发送</span>
                    </div>
                    <button
                      onClick={sendMessage}
                      disabled={!messageInput.trim() || sessionEnded}
                      className="h-7 px-4 rounded bg-[#3525cd] text-white hover:bg-[#4f46e5] disabled:bg-[#c7c4d8] disabled:cursor-not-allowed text-[12px] font-medium flex items-center gap-1 transition-all shadow-sm"
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
          <div className="flex-1 flex items-center justify-center bg-[#eaedff]">
            <div className="text-center">
              <div className="w-24 h-24 mx-auto mb-4 rounded-full bg-[#dae2fd] flex items-center justify-center">
                <Icon name="forum" className="text-5xl text-[#3525cd]" />
              </div>
              <h3 className="text-lg font-semibold text-[#464555] mb-2">选择会话开始对话</h3>
              <p className="text-sm text-[#777587]">从左侧列表选择客户或等待新请求</p>
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
      <aside className="w-80 bg-white flex flex-col shadow-sm overflow-hidden z-10 flex-shrink-0">
        {currentChat ? (
          <>
            {/* 客户档案 */}
            <div className="p-3 bg-white">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-10 h-10 rounded-xl bg-[#0058be] text-white flex items-center justify-center font-bold text-[18px] shadow-sm">
                    {currentChat.customerName.charAt(0)}
                  </div>
                  <div className="flex flex-col min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold text-[15px] text-[#131b2e] truncate">{currentChat.customerName}</span>
                      {currentChat.isVip && (
                        <span className="px-1.5 py-0.2 rounded bg-[#d8e2ff] text-[#004395] text-[10px] font-bold">VIP 5</span>
                      )}
                    </div>
                    <span className="text-[11px] text-[#464555] truncate">{currentChat.company || '上海聚思创享信息科技有限公司'}</span>
                    <span className="text-[11px] text-[#777587]">编号: {currentChat.customerCode || 'CN-CORP-99201'}</span>
                  </div>
                </div>
                <button className="w-7 h-7 flex items-center justify-center rounded hover:bg-[#e2e7ff] text-[#777587] hover:text-[#131b2e] transition-colors flex-shrink-0">
                  <Icon name="edit" className="text-[16px]" />
                </button>
              </div>

              {/* 标签 */}
              <div className="flex flex-wrap gap-1 mt-2">
                {(currentChat.tags || ['高净值客户', '企业月结', '偏好顺丰特快']).map((tag, i) => (
                  <span
                    key={i}
                    className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                      i < 3
                        ? 'bg-[#e2e7ff] text-[#3525cd]'
                        : 'bg-[#dae2fd] text-[#464555]'
                    }`}
                  >
                    {tag}
                  </span>
                ))}
              </div>

              {/* 联系信息 */}
              <div className="grid grid-cols-2 gap-2 mt-2 pt-2 bg-[#f2f3ff] p-2 rounded-lg text-[12px]">
                <div className="flex flex-col">
                  <span className="text-[11px] text-[#777587]">联系电话</span>
                  <span className="text-[#131b2e] font-semibold">{currentChat.phone || '138****5821'}</span>
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="text-[11px] text-[#777587]">企业邮箱</span>
                  <span className="text-[#131b2e] font-semibold truncate">{currentChat.email || 'cx***@company.com'}</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-[11px] text-[#777587]">注册时间</span>
                  <span className="text-[#131b2e]">{currentChat.customerSince || '2022-06-18'}</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-[11px] text-[#777587]">累计消费</span>
                  <span className="text-[#3525cd] font-bold">{currentChat.totalSpend || '¥148,920.00'}</span>
                </div>
              </div>

              {/* 客服便签 */}
              {currentChat.note && (
                <div className="mt-2 p-2 rounded-lg bg-[#e2e7ff] text-[12px]">
                  <div className="flex items-center justify-between text-[#131b2e] font-semibold mb-1">
                    <div className="flex items-center gap-1">
                      <Icon name="edit_note" className="text-[14px] text-[#005338]" />
                      <span className="text-[11px]">客服专员便签</span>
                    </div>
                    <span className="text-[10px] text-[#777587]">05-12</span>
                  </div>
                  <p className="text-[#464555] leading-tight text-[12px]">"{currentChat.note}"</p>
                </div>
              )}
            </div>

            {/* Tab切换 */}
            <div className="flex items-center bg-[#f2f3ff] px-3">
              <button
                onClick={() => setRightTab('orders')}
                className={`py-2 px-3 text-[12px] font-semibold flex items-center gap-1 transition-colors ${
                  rightTab === 'orders'
                    ? 'text-[#3525cd] shadow-sm bg-white rounded-t-md'
                    : 'text-[#464555]'
                }`}
              >
                <span>历史订单</span>
                <span className={`px-1 rounded-full text-[10px] ${
                  rightTab === 'orders' ? 'bg-[#dae2fd] text-[#3525cd]' : 'bg-[#e2e7ff] text-[#777587]'
                }`}>
                  {currentChat.totalOrders || 12}
                </span>
              </button>
              <button
                onClick={() => setRightTab('tickets')}
                className={`py-2 px-3 text-[12px] font-medium flex items-center gap-1 transition-colors ${
                  rightTab === 'tickets'
                    ? 'text-[#3525cd] shadow-sm bg-white rounded-t-md'
                    : 'text-[#464555]'
                }`}
              >
                <span>服务工单</span>
                <span className="px-1 rounded-full bg-[#e2e7ff] text-[#777587] text-[10px]">3</span>
              </button>
              <button
                onClick={() => setRightTab('track')}
                className={`py-2 px-3 text-[12px] font-medium transition-colors ${
                  rightTab === 'track'
                    ? 'text-[#3525cd] shadow-sm bg-white rounded-t-md'
                    : 'text-[#464555]'
                }`}
              >
                轨迹足迹
              </button>
            </div>

            {/* 订单列表 */}
            <div className="flex-1 overflow-y-auto p-3 space-y-3 bg-white">
              {rightTab === 'orders' && mockOrders.map((order) => (
                <div key={order.id} className="p-2.5 rounded-lg bg-[#f2f3ff] shadow-sm flex flex-col gap-1.5 transition-all">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1 min-w-0">
                      <Icon name={order.id.includes('202405') ? 'local_shipping' : order.id.includes('202404') ? 'check_circle' : 'inventory_2'} className={`text-[15px] ${
                        order.id.includes('202405') ? 'text-[#0058be]' : order.id.includes('202404') ? 'text-[#005338]' : 'text-[#777587]'
                      }`} />
                      <span className={`font-semibold truncate ${
                        order.id.includes('202405') ? 'text-[#131b2e]' : 'text-[#464555]'
                      }`}>{order.id}</span>
                    </div>
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold flex-shrink-0 ${
                      order.status === '顺丰配载中'
                        ? 'bg-[#dae2fd] text-[#0058be]'
                        : 'bg-[#dae2fd] text-[#005338]'
                    }`}>
                      {order.status}
                    </span>
                  </div>
                  <div className="flex gap-2 items-center">
                    <div className={`w-10 h-10 rounded flex items-center justify-center flex-shrink-0 ${
                      order.id.includes('202405') ? 'bg-[#e2e7ff] text-[#3525cd]' : 'bg-[#e2e7ff] text-[#777587]'
                    }`}>
                      <Icon name={order.icon} className="text-[20px]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="text-[12px] font-semibold text-[#131b2e] truncate">{order.product}</h4>
                      <p className="text-[11px] text-[#777587]">{order.specs}</p>
                      <div className="flex items-center justify-between mt-0.5">
                        <span className="text-[13px] text-[#131b2e] font-bold">{order.price}</span>
                        <span className="text-[10px] text-[#777587]">{order.date}</span>
                      </div>
                    </div>
                  </div>
                  {order.tracking && (
                    <div className="flex items-center justify-between pt-1.5 bg-white p-1.5 rounded text-[11px]">
                      <span className="text-[#464555] truncate">{order.tracking}</span>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button
                          className="px-2 py-0.5 rounded bg-[#f2f3ff] hover:bg-[#e2e7ff] text-[#131b2e] text-[10px] font-medium transition-colors"
                          onClick={() => navigator.clipboard && navigator.clipboard.writeText(order.tracking)}
                        >
                          复制
                        </button>
                        <button className="px-2 py-0.5 rounded bg-[#3525cd] text-white hover:bg-[#4f46e5] text-[10px] font-semibold transition-colors">
                          轨迹
                        </button>
                      </div>
                    </div>
                  )}
                  {order.signedDate && (
                    <div className="flex items-center justify-between pt-1 text-[11px] text-[#777587]">
                      <span className="text-[10px]">签收: {order.signedDate}</span>
                      <button className="text-[#3525cd] hover:underline text-[10px] font-medium">详情</button>
                    </div>
                  )}
                </div>
              ))}

              {rightTab === 'tickets' && (
                <div className="text-center text-[#777587] py-8">
                  <p className="text-xs">暂无服务工单</p>
                </div>
              )}

              {rightTab === 'track' && (
                <div className="text-center text-[#777587] py-8">
                  <p className="text-xs">暂无轨迹足迹</p>
                </div>
              )}
            </div>

            {/* AI助手 */}
            <div className="p-2 bg-[#f2f3ff] flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-[12px] text-[#464555]">
                <Icon name="auto_awesome" className="text-[16px] text-[#3525cd]" />
                <span>AI 质检与知识助手</span>
              </div>
              <button className="px-2 py-1 rounded bg-white hover:bg-[#e2e7ff] text-[#3525cd] text-[11px] font-semibold shadow-sm transition-colors">
                查看推荐话术
              </button>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center text-[#777587]">
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
          <div className="w-full max-w-md bg-white rounded-2xl shadow-xl overflow-hidden">
            <div className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-[#c3c0ff] text-[#3525cd] flex items-center justify-center">
                  <Icon name="thumb_up" className="text-xl" />
                </div>
                <div>
                  <h3 className="font-semibold text-[15px] text-[#131b2e]">结束服务并发送满意度评价</h3>
                  <p className="text-[12px] text-[#777587]">邀请客户【{currentChat?.customerName}】对本次接待进行评分</p>
                </div>
              </div>
              <button onClick={() => setShowRating(false)} className="w-8 h-8 rounded-full hover:bg-[#e2e7ff] text-[#777587] hover:text-[#131b2e] flex items-center justify-center">
                <Icon name="close" className="text-xl" />
              </button>
            </div>

            <div className="p-4 space-y-3">
              <div className="text-center py-3 bg-[#f2f3ff] rounded-xl">
                <p className="text-[12px] text-[#464555] mb-2 font-medium">请预选服务满意度档位</p>
                <div className="flex items-center justify-center gap-2 text-[#4d44e3]">
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
                <span className="font-semibold text-[15px] text-[#3525cd] mt-1 block">
                  {rating}星 · {rating === 5 ? '非常满意' : rating === 4 ? '满意' : rating === 3 ? '一般' : '不满意'}
                </span>
              </div>

              <div>
                <label className="block text-[12px] font-semibold text-[#131b2e] mb-1.5">预选服务标签 (多选)</label>
                <div className="flex flex-wrap gap-1.5">
                  {['响应迅速', '解决彻底', '服务周到热情', '业务熟练', '主动关怀'].map(tag => (
                    <span
                      key={tag}
                      onClick={() => setRatingTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag])}
                      className={`px-2.5 py-1 rounded-full text-[11px] font-semibold cursor-pointer transition-colors ${
                        ratingTags.includes(tag)
                          ? 'bg-[#e2e7ff] text-[#3525cd]'
                          : 'bg-[#dae2fd] text-[#777587] hover:text-[#131b2e]'
                      }`}
                    >
                      {ratingTags.includes(tag) ? '✓ ' : '+ '}{tag}
                    </span>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-[12px] font-semibold text-[#131b2e] mb-1">结案备注</label>
                <textarea
                  className="w-full p-2 rounded-lg bg-[#f2f3ff] text-[12px] text-[#131b2e] placeholder:text-[#777587] focus:outline-none focus:bg-white"
                  placeholder="已为企业VIP客户升级顺丰特快并同步单号，客户诉求已全面解决。"
                  rows={2}
                />
              </div>
            </div>

            <div className="p-4 bg-[#f2f3ff] flex items-center justify-between">
              <button
                onClick={() => setShowRating(false)}
                className="px-4 py-2 rounded bg-white text-[#131b2e] hover:bg-[#e2e7ff] text-[12px] font-medium transition-colors"
              >
                暂不结束
              </button>
              <button
                onClick={submitRating}
                className="px-4 py-2 rounded bg-[#3525cd] text-white hover:bg-[#4f46e5] text-[12px] font-semibold transition-colors shadow-sm flex items-center gap-1"
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
