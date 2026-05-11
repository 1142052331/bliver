import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageCircle, ArrowRight } from 'lucide-react';

export default function MessageIsland({ senderName, senderId, onView, onDismiss }) {
  useEffect(() => {
    if (!senderId) return;
    const timer = setTimeout(onDismiss, 5000);
    return () => clearTimeout(timer);
  }, [senderId, onDismiss]);

  const initial = (senderName || '?')[0].toUpperCase();

  return (
    <AnimatePresence>
      {senderId && (
        <motion.div
          initial={{ opacity: 0, y: -60, scale: 0.75 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, scale: 0.7, y: -40 }}
          transition={{ type: 'spring', stiffness: 420, damping: 28, mass: 0.85 }}
          className="fixed top-20 left-1/2 z-[1950]
            flex items-center gap-3 px-4 py-3
            bg-black/55 backdrop-blur-xl border border-white/15
            rounded-full shadow-2xl shadow-black/40
            pointer-events-auto cursor-default"
          style={{ transform: 'translateX(-50%)' }}
        >
          {/* Left — Message icon */}
          <div className="w-9 h-9 rounded-full bg-teal-500/15 flex items-center justify-center flex-shrink-0"
            style={{ boxShadow: '0 0 12px rgba(45,212,191,0.15)' }}>
            <MessageCircle className="w-4 h-4 text-teal-400" />
          </div>

          {/* Center — Sender avatar + name + subtitle */}
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-indigo-500
              flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
              {initial}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-white truncate leading-tight">{senderName}</p>
              <p className="text-[11px] text-gray-400 leading-tight">新私信</p>
            </div>
          </div>

          {/* Right — View button */}
          <button
            onClick={onView}
            className="flex-shrink-0 flex items-center gap-1 px-3 py-1.5
              bg-white/10 hover:bg-white/20 text-white text-xs font-medium
              rounded-full transition-colors active:scale-95"
          >
            查看
            <ArrowRight className="w-3 h-3" />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
