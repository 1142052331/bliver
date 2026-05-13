import { motion, AnimatePresence } from 'framer-motion';
import useUIStore from '../store/useUIStore';

const typeConfig = {
  online:   { dot: 'from-green-400 to-emerald-400' },
  offline:  { dot: 'from-gray-400 to-zinc-400' },
  reaction: { dot: 'from-rose-400 to-pink-400' },
  comment:  { dot: 'from-indigo-400 to-purple-400' },
  message:  { dot: 'from-sky-400 to-blue-400' },
  announcement: { dot: 'from-amber-400 to-orange-400' },
};

export default function GlobalToaster() {
  const toasts = useUIStore((s) => s.toasts);
  const dismissToast = useUIStore((s) => s.dismissToast);

  return (
    <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[1900] flex flex-col gap-2 pointer-events-none
      max-w-[90vw]">
      <AnimatePresence>
        {toasts.map((n) => {
          const cfg = typeConfig[n.type] || typeConfig.comment;
          return (
            <motion.div
              key={n.id}
              layout
              initial={{ opacity: 0, y: -40, scale: 0.88 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.7, y: -20 }}
              transition={{ type: 'spring', stiffness: 500, damping: 30, mass: 0.8 }}
              onClick={() => dismissToast(n.id)}
              className="pointer-events-auto cursor-pointer
                px-4 py-2.5 ios-glass
                text-aurora-text text-sm font-medium
                flex items-center gap-2.5
                active:scale-[0.97]
                transition-transform duration-200"
            >
              <span className={`w-1.5 h-1.5 rounded-full bg-gradient-to-r ${cfg.dot} flex-shrink-0`} />
              <span className="leading-snug">{n.content}</span>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
