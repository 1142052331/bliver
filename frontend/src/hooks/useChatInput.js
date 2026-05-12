import { useState, useRef, useCallback } from 'react';

/**
 * Manages chat message sending: input state, send action, typing indicator emission.
 */
export default function useChatInput(socketRef, chatUserId, user, onSendStart) {
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const typingTimerRef = useRef(null);

  const handleSend = useCallback(() => {
    const text = input.trim();
    if (!text) return;
    const tempId = 'temp_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);

    const tempMsg = {
      _id: tempId,
      senderId: user._id,
      receiverId: chatUserId,
      content: text,
      createdAt: new Date().toISOString(),
      pending: true,
    };

    setInput('');
    setSending(true);
    onSendStart?.(tempMsg);

    socketRef.current?.emit('send_message', { receiverId: chatUserId, content: text, tempId });
    socketRef.current?.emit('stop_typing', { receiverId: chatUserId });
    setSending(false);
  }, [input, user, chatUserId, socketRef, onSendStart]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInputChange = (e) => {
    setInput(e.target.value);
    socketRef.current?.emit('typing', { receiverId: chatUserId });
    clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(() => {
      socketRef.current?.emit('stop_typing', { receiverId: chatUserId });
    }, 2000);
  };

  return { input, setInput, sending, handleSend, handleKeyDown, handleInputChange };
}
