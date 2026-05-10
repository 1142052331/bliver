import { useState, useEffect, useRef, useCallback } from 'react';
import { X, Send, Loader2, Minus, Maximize2, GripHorizontal } from 'lucide-react';
import api from '../api';

function timeStr(date) {
  return new Date(date).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}

export default function ChatWindow({
  chatUserId, friendName, friendAvatar, isOnline,
  user, socketRef, onOpen, onClose, onToast,
}) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [typingUser, setTypingUser] = useState(null);
  const [isMinimized, setIsMinimized] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);

  const scrollRef = useRef(null);
  const sentinelRef = useRef(null);
  const inputRef = useRef(null);
  const mountedRef = useRef(true);
  const typingTimerRef = useRef(null);
  const lastMsgIdRef = useRef(null);

  const isAsenSender = user?.name === '阿森';

  useEffect(() => () => { mountedRef.current = false; }, []);

  // ── Fetch messages ─────────────────────────────────────
  const fetchMessages = useCallback(async (beforeId) => {
    try {
      let url = `/api/messages/${chatUserId}`;
      if (beforeId) url += `?before=${beforeId}`;
      const { data } = await api.get(url);
      if (!mountedRef.current) return;

      if (beforeId) {
        // Prepend older messages, preserve scroll position
        setMessages(prev => [...data.messages, ...prev]);
      } else {
        setMessages(data.messages || []);
      }
      setHasMore(data.hasMore || false);
      if (data.messages?.length > 0) {
        lastMsgIdRef.current = data.messages[0]._id;
      }
    } catch (err) {
      console.error('[Chat] Fetch failed:', err);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [chatUserId]);

  useEffect(() => {
    setMessages([]);
    setLoading(true);
    setHasMore(false);
    lastMsgIdRef.current = null;
    fetchMessages();
    onOpen?.(); // Clear Toast + unread on this chat
  }, [chatUserId, fetchMessages]);

  // ── Infinite scroll (IntersectionObserver) ─────────────
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && hasMore && !loading) {
        const oldest = messages[0];
        if (oldest?._id) {
          const prevHeight = scrollRef.current?.scrollHeight || 0;
          fetchMessages(oldest._id).then(() => {
            // Restore scroll position after prepending
            requestAnimationFrame(() => {
              if (scrollRef.current) {
                scrollRef.current.scrollTop = scrollRef.current.scrollHeight - prevHeight;
              }
            });
          });
        }
      }
    }, { root: scrollRef.current, threshold: 0.1 });
    obs.observe(el);
    return () => obs.disconnect();
  }, [hasMore, loading, messages, fetchMessages]);

  // ── Auto-scroll to bottom on new messages ──────────────
  useEffect(() => {
    if (scrollRef.current && messages.length > 0) {
      const last = messages[messages.length - 1];
      if (last?.senderId === user?._id || last?.pending) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }
    }
  }, [messages.length]);

  // ── Socket events ──────────────────────────────────────
  useEffect(() => {
    const socket = socketRef?.current;
    if (!socket) return;

    const onReceive = (data) => {
      if (data.message?.senderId === chatUserId) {
        if (mountedRef.current) {
          setMessages(prev => [...prev, { ...data.message, _delivered: true }]);
        }
        // Mark as read
        api.get(`/api/messages/${chatUserId}`).catch(() => {});
      }
    };

    const onSent = (data) => {
      // Replace temp message with confirmed one
      setMessages(prev => prev.map(m =>
        m._id === data.tempId ? { ...data.message, _confirmed: true } : m
      ));
    };

    const onTyping = (data) => {
      if (data.senderId === chatUserId) {
        if (mountedRef.current) setTypingUser(data.senderName || '对方');
        clearTimeout(typingTimerRef.current);
        typingTimerRef.current = setTimeout(() => {
          if (mountedRef.current) setTypingUser(null);
        }, 3000);
      }
    };

    const onStopTyping = (data) => {
      if (data.senderId === chatUserId && mountedRef.current) {
        setTypingUser(null);
      }
    };

    socket.on('receive_message', onReceive);
    socket.on('message:sent', onSent);
    socket.on('typing', onTyping);
    socket.on('stop_typing', onStopTyping);

    return () => {
      socket.off('receive_message', onReceive);
      socket.off('message:sent', onSent);
      socket.off('typing', onTyping);
      socket.off('stop_typing', onStopTyping);
    };
  }, [socketRef?.current, chatUserId]);

  // ── Send ───────────────────────────────────────────────
  const handleSend = useCallback(() => {
    const text = input.trim();
    if (!text) return;
    const tempId = 'temp_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);

    // Optimistic: insert immediately
    const tempMsg = {
      _id: tempId,
      senderId: user._id,
      receiverId: chatUserId,
      content: text,
      createdAt: new Date().toISOString(),
      pending: true,
    };
    setMessages(prev => [...prev, tempMsg]);
    setInput('');
    setSending(true);

    socketRef.current?.emit('send_message', {
      receiverId: chatUserId,
      content: text,
      tempId,
    });

    // Emit stop_typing after send
    socketRef.current?.emit('stop_typing', { receiverId: chatUserId });

    setSending(false);
  }, [input, user, chatUserId, socketRef]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // ── Typing emission ────────────────────────────────────
  const handleInputChange = (e) => {
    setInput(e.target.value);
    socketRef.current?.emit('typing', { receiverId: chatUserId });
    clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(() => {
      socketRef.current?.emit('stop_typing', { receiverId: chatUserId });
    }, 2000);
  };

  // Desktop size state (only used on md+)
  const [winSize, setWinSize] = useState({ w: 380, h: 520 });
  const resizeRef = useRef({ startX: 0, startY: 0, startW: 0, startH: 0 });
  const handleResizeStart = (e) => {
    e.preventDefault();
    resizeRef.current = { startX: e.clientX, startY: e.clientY, startW: winSize.w, startH: winSize.h };
    const onMove = (ev) => {
      const dw = resizeRef.current.startX - ev.clientX;
      const dh = resizeRef.current.startY - ev.clientY;
      setWinSize({
        w: Math.max(300, resizeRef.current.startW + dw),
        h: Math.max(400, resizeRef.current.startH + dh),
      });
    };
    const onUp = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  const isMax = isMaximized;

  return (
    <div className={`fixed z-[1900] pointer-events-none
      ${isMinimized ? 'md:bottom-4 md:right-4 md:inset-auto' : ''}
      ${isMax ? 'inset-0 md:inset-4' : 'inset-0 md:inset-auto'}`}
    >
      {/* Backdrop — mobile only */}
      <div className="md:hidden absolute inset-0 bg-black/60 backdrop-blur-sm pointer-events-auto"
        onClick={onClose} />

      {/* Window */}
      <div className={`${isMinimized ? 'hidden md:flex' : 'flex'} flex-col pointer-events-auto
        absolute inset-0 md:inset-auto
        md:fixed md:bottom-4 md:right-4
        bg-[#0f0f14]/95 backdrop-blur-2xl
        border border-white/[0.08] md:rounded-2xl
        shadow-[0_0_60px_rgba(0,0,0,0.6)]
        overflow-hidden
        ${isMax ? 'md:inset-4' : ''}`}
        style={{
          ...(isMax ? {} : { width: `${winSize.w}px`, height: `${winSize.h}px` }),
          maxHeight: isMax ? undefined : 'calc(100dvh - 2rem)',
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 flex-shrink-0
          border-b border-white/[0.06]"
          style={{ paddingTop: 'max(12px, env(safe-area-inset-top))' }}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="relative flex-shrink-0">
              {friendAvatar ? (
                <img src={friendAvatar} className="w-8 h-8 rounded-full object-cover ring-1 ring-white/10"
                  onError={(e) => { e.target.style.display = 'none'; }} loading="lazy" />
              ) : (
                <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white text-xs font-bold">
                  {(friendName || '?')[0]}
                </div>
              )}
              {isOnline && (
                <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full
                  bg-green-400 border-2 border-[#0f0f14] shadow-[0_0_6px_rgba(74,222,128,0.5)]" />
              )}
            </div>
            <div className="min-w-0">
              <p className="text-sm text-white/80 truncate" style={{ fontFamily: 'var(--font-body)' }}>
                {friendName || 'Chat'}
              </p>
              {typingUser && (
                <p className="text-[11px] text-cyan-400/80 animate-pulse"
                  style={{ fontFamily: 'var(--font-body)' }}>
                  {typingUser} 正在输入...
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button onClick={() => setIsMinimized(!isMinimized)}
              className="hidden md:flex p-1.5 hover:bg-white/[0.06] rounded-lg transition-colors text-white/30 hover:text-white/60">
              <Minus className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => setIsMaximized(!isMaximized)}
              className="hidden md:flex p-1.5 hover:bg-white/[0.06] rounded-lg transition-colors text-white/30 hover:text-white/60">
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
            <button onClick={onClose}
              className="p-1.5 hover:bg-white/[0.06] rounded-lg transition-colors text-white/40 hover:text-white/70">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* ── Messages ──────────────────────────────────── */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto aurora-scroll px-4 py-3 space-y-3"
          style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}
        >
          {/* Loading sentinel */}
          <div ref={sentinelRef} className="h-1" />

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-5 h-5 text-white/20 animate-spin" />
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-white/15">
              <Send className="w-8 h-8 mb-2 opacity-30" />
              <p className="text-sm" style={{ fontFamily: 'var(--font-body)' }}>发送第一条消息</p>
            </div>
          ) : (
            messages.map((msg) => {
              const isMine = msg.senderId === user?._id;
              const isFromAsen = !isMine && friendName === '阿森' && msg.senderId === chatUserId;
              const isPending = msg.pending;
              const isAsenSenderBubble = isMine && isAsenSender;

              return (
                <div key={msg._id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[75%] px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed
                    transition-opacity duration-200
                    ${isPending ? 'opacity-60' : 'opacity-100'}
                    ${isMine
                      ? (isAsenSenderBubble
                          ? 'bg-amber-500/20 border border-amber-400/30 text-amber-50 rounded-br-md animate-pulse'
                          : 'bg-cyan-600/30 border border-cyan-500/30 text-cyan-50 rounded-br-md')
                      : (isFromAsen
                          ? 'bg-amber-500/10 border border-amber-400/20 text-amber-50 rounded-bl-md shadow-[0_0_12px_rgba(251,191,36,0.08)]'
                          : 'bg-white/[0.06] border border-white/[0.06] text-white/85 rounded-bl-md')
                    }`}
                    style={{ fontFamily: 'var(--font-body)', wordBreak: 'break-word' }}
                  >
                    <p>{msg.content}</p>
                    <div className={`flex items-center gap-1 mt-1 ${isMine ? 'justify-end' : 'justify-start'}`}>
                      {isMine && (
                        <span className="text-[10px] text-white/20">
                          {msg._confirmed ? '✓' : isPending ? '⏳' : ''}
                        </span>
                      )}
                      <span className="text-[10px] text-white/15">{timeStr(msg.createdAt)}</span>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* ── Input ─────────────────────────────────────── */}
        <div className="flex-shrink-0 px-3 py-3 border-t border-white/[0.06]"
          style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}
        >
          <div className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              rows={1}
              placeholder="输入消息..."
              className="flex-1 px-3.5 py-2.5 bg-white/[0.04] border border-white/[0.08] rounded-2xl
                text-white/80 text-sm placeholder:text-white/15 resize-none
                focus:outline-none focus:border-cyan-500/30 max-h-[100px]"
              style={{ fontFamily: 'var(--font-body)' }}
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || sending}
              className="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center
                bg-cyan-500/20 text-cyan-400 border border-cyan-500/30
                hover:bg-cyan-500/40 transition-all duration-200
                disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Resize handle — desktop only */}
        <div
          onMouseDown={handleResizeStart}
          className="hidden md:flex absolute bottom-0 left-0 w-4 h-4 cursor-nesw-resize
            items-center justify-center text-white/10 hover:text-white/30 transition-colors"
          title="拖拽调整窗口大小"
        >
          <GripHorizontal className="w-3 h-3 rotate-45" />
        </div>
      </div>
    </div>
  );
}
