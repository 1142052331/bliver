import { useState, useEffect, useRef, useCallback } from 'react';
import { X, Send, Loader2, Minus, Maximize2, GripHorizontal } from 'lucide-react';
import api from '../api';
import useChatInput from '../hooks/useChatInput';
import MessageBubble from './MessageBubble';

export default function ChatWindow({
  chatUserId, friendName, friendAvatar, isOnline,
  user, socketRef, onOpen, onClose, onToast,
}) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [typingUser, setTypingUser] = useState(null);
  const [isMinimized, setIsMinimized] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const [winSize, setWinSize] = useState({ w: 380, h: 520 });

  const scrollRef = useRef(null);
  const sentinelRef = useRef(null);
  const inputRef = useRef(null);
  const mountedRef = useRef(true);
  const typingTimerRef = useRef(null);

  useEffect(() => () => { mountedRef.current = false; }, []);

  const { input, sending, handleSend, handleKeyDown, handleInputChange } = useChatInput(
    socketRef, chatUserId, user, (tempMsg) => {
      setMessages(prev => [...prev, tempMsg]);
    }
  );

  // ── Fetch messages ─────────────────────────────────────
  const fetchMessages = useCallback(async (beforeId) => {
    try {
      let url = `/api/messages/${chatUserId}`;
      if (beforeId) url += `?before=${beforeId}`;
      const { data } = await api.get(url);
      if (!mountedRef.current) return;

      if (beforeId) {
        setMessages(prev => [...data.messages, ...prev]);
      } else {
        setMessages(data.messages || []);
      }
      setHasMore(data.hasMore || false);
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
    fetchMessages();
    onOpen?.();
  }, [chatUserId, fetchMessages]);

  // ── Infinite scroll ────────────────────────────────────
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && hasMore && !loading) {
        const oldest = messages[0];
        if (oldest?._id) {
          const prevHeight = scrollRef.current?.scrollHeight || 0;
          fetchMessages(oldest._id).then(() => {
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

  // ── Auto-scroll on new messages ────────────────────────
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
        api.get(`/api/messages/${chatUserId}`).catch(() => {});
      }
    };

    const onSent = (data) => {
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
      if (data.senderId === chatUserId && mountedRef.current) setTypingUser(null);
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

  // ── Resize handler (desktop) ──────────────────────────
  const resizeRef = useRef({ startX: 0, startY: 0, startW: 0, startH: 0 });
  const handleResizeStart = (e) => {
    e.preventDefault();
    resizeRef.current = { startX: e.clientX, startY: e.clientY, startW: winSize.w, startH: winSize.h };
    const onMove = (ev) => {
      setWinSize({
        w: Math.max(300, resizeRef.current.startW + (resizeRef.current.startX - ev.clientX)),
        h: Math.max(400, resizeRef.current.startH + (resizeRef.current.startY - ev.clientY)),
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
      <div className="md:hidden absolute inset-0 bg-black/60 backdrop-blur-sm pointer-events-auto" onClick={onClose} />

      <div className={`${isMinimized ? 'hidden md:flex' : 'flex'} flex-col pointer-events-auto
        absolute inset-0 md:inset-auto
        md:fixed md:bottom-4 md:right-4
        bg-[#0f0f14]/95 backdrop-blur-2xl
        border border-white/[0.08] md:rounded-2xl
        shadow-[0_0_60px_rgba(0,0,0,0.6)] overflow-hidden
        ${isMax ? 'md:inset-4' : ''}`}
        style={{
          ...(isMax ? {} : { width: `${winSize.w}px`, height: `${winSize.h}px` }),
          maxHeight: isMax ? undefined : 'calc(100dvh - 2rem)',
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 flex-shrink-0 border-b border-white/[0.06]"
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
                <p className="text-[11px] text-cyan-400/80 animate-pulse" style={{ fontFamily: 'var(--font-body)' }}>
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

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto aurora-scroll px-4 py-3 space-y-3"
          style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}
        >
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
            messages.map((msg) => (
              <MessageBubble
                key={msg._id}
                msg={msg}
                userId={user?._id}
                friendName={friendName}
                chatUserId={chatUserId}
              />
            ))
          )}
        </div>

        {/* Input */}
        <div className="flex-shrink-0 px-3 py-3 border-t border-white/[0.06]"
          style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}
        >
          <div className="flex items-center gap-2 bg-white/[0.04] rounded-xl px-3 py-2 border border-white/[0.06] focus-within:border-white/20 transition-colors">
            <input
              ref={inputRef}
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder="发送消息..."
              className="flex-1 bg-transparent text-sm text-white/80 placeholder:text-white/20 outline-none"
              style={{ fontFamily: 'var(--font-body)' }}
              disabled={sending}
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || sending}
              className="p-1.5 text-cyan-400 hover:text-cyan-300 disabled:text-white/10 transition-colors flex-shrink-0"
            >
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Resize handle — desktop only */}
        <div
          onMouseDown={handleResizeStart}
          className="hidden md:block absolute bottom-0 right-0 w-4 h-4 cursor-nwse-resize opacity-0 hover:opacity-100 transition-opacity"
        >
          <GripHorizontal className="w-3 h-3 text-white/20 rotate-45" />
        </div>
      </div>
    </div>
  );
}
