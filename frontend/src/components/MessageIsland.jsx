import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Heart, MessageCircle, Eye, ArrowRight, X } from 'lucide-react';

const typeCfg = {
  reaction:     { Icon: Heart,         iconBg: 'bg-rose-500/15', iconColor: 'text-rose-400',   glow: 'rgba(244,63,94,0.08)' },
  comment:      { Icon: MessageCircle, iconBg: 'bg-teal-500/15',  iconColor: 'text-teal-400',   glow: 'rgba(45,212,191,0.08)' },
  message:      { Icon: MessageCircle, iconBg: 'bg-sky-500/15',   iconColor: 'text-sky-400',    glow: 'rgba(56,189,248,0.08)' },
  profile_view: { Icon: Eye,           iconBg: 'bg-purple-500/15', iconColor: 'text-purple-400', glow: 'rgba(168,85,247,0.08)' },
};

const subLabel = {
  reaction:     '对你的打卡有新的表态',
  comment:      '给你的足迹留下了评论',
  message:      '发来了新私信',
  profile_view: '浏览了你的主页',
};

export default function MessageIsland({ type, senderName, footprintId, senderId, onView, onDismiss }) {
  useEffect(() => {
    if (!senderName) return;
    const timer = setTimeout(onDismiss, 5000);
    return () => clearTimeout(timer);
  }, [senderName, onDismiss]);

  const cfg = typeCfg[type] || typeCfg.comment;
  const Icon = cfg.Icon;
  const initial = (senderName || '?')[0].toUpperCase();
  const label = subLabel[type] || '有新动态';

  return (
    <AnimatePresence>
      {senderName && (
        <>
          {/* Desktop: centered floating pill */}
          <motion.div
            key="desktop"
            initial={{ opacity: 0, y: -60, scale: 0.75 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.7, y: -40 }}
            transition={{ type: 'spring', stiffness: 420, damping: 28, mass: 0.85 }}
            className="hidden md:flex fixed z-[1950] top-6 left-1/2
              items-center gap-3 px-4 py-3
              bg-black/55 backdrop-blur-xl border border-white/15
              rounded-full shadow-2xl shadow-black/40
              pointer-events-auto cursor-default"
            style={{ transform: 'translateX(-50%)' }}
          >
            <div className={`w-9 h-9 rounded-full ${cfg.iconBg} flex items-center justify-center flex-shrink-0`}
              style={{ boxShadow: `0 0 12px ${cfg.glow}` }}>
              <Icon className={`w-4 h-4 ${cfg.iconColor}`} />
            </div>

            <div className="flex items-center gap-2.5 min-w-0" onClick={onView}>
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-indigo-500
                flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                {initial}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-white truncate leading-tight">{senderName}</p>
                <p className="text-[11px] text-gray-400 leading-tight">{label}</p>
              </div>
            </div>

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

          {/* Mobile: iOS notification banner from top */}
          <motion.div
            key="mobile"
            initial={{ opacity: 0, y: -80 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -60 }}
            transition={{ type: 'spring', stiffness: 350, damping: 26, mass: 0.9 }}
            className="md:hidden fixed z-[1950] pointer-events-auto"
            style={{
              top: `max(8px, env(safe-area-inset-top))`,
              left: `max(8px, env(safe-area-inset-left))`,
              right: `max(8px, env(safe-area-inset-right))`,
            }}
          >
            <div
              onClick={onView}
              className="flex items-center gap-3 px-4 py-3.5 rounded-2xl
                bg-[#1c1c1e]/90 backdrop-blur-2xl
                border border-white/[0.06]
                shadow-2xl shadow-black/50
                active:scale-[0.98] transition-transform duration-150"
              style={{ boxShadow: `0 0 0 0.5px rgba(255,255,255,0.04), 0 8px 32px rgba(0,0,0,0.5), inset 0 0.5px 0 rgba(255,255,255,0.06)` }}
            >
              {/* App icon */}
              <div className={`w-10 h-10 rounded-xl ${cfg.iconBg} flex items-center justify-center flex-shrink-0`}
                style={{ boxShadow: `0 0 16px ${cfg.glow}` }}>
                <Icon className={`w-5 h-5 ${cfg.iconColor}`} />
              </div>

              {/* Title + body */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-[15px] font-semibold text-white leading-snug truncate">
                    {senderName}
                  </p>
                  <span className="text-[11px] text-gray-500 font-medium flex-shrink-0">
                    现在
                  </span>
                </div>
                <p className="text-[13px] text-gray-400 leading-snug truncate mt-0.5">
                  {label}
                </p>
              </div>

              {/* Dismiss button */}
              <button
                onClick={(e) => { e.stopPropagation(); onDismiss(); }}
                className="flex-shrink-0 w-7 h-7 rounded-full bg-white/[0.06] flex items-center justify-center
                  hover:bg-white/[0.12] transition-colors"
              >
                <X className="w-3.5 h-3.5 text-gray-500" />
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
