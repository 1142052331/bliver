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
  const notifications = useUIStore((s) => s.notifications);
  const dismissNotification = useUIStore((s) => s.dismissNotification);

  if (notifications.length === 0) return null;

  return (
    <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[1900] flex flex-col gap-2 pointer-events-none
      max-w-[90vw]">
      {notifications.map((n) => {
        const cfg = typeConfig[n.type] || typeConfig.comment;
        return (
          <div
            key={n.id}
            onClick={() => dismissNotification(n.id)}
            className="pointer-events-auto cursor-pointer
              px-4 py-2.5 bg-gray-900/85 backdrop-blur-xl
              text-white text-sm font-medium
              rounded-2xl shadow-2xl shadow-black/20
              animate-slide-down
              flex items-center gap-2.5
              active:scale-[0.97] hover:bg-gray-900/95
              transition-all duration-200"
          >
            <span className={`w-1.5 h-1.5 rounded-full bg-gradient-to-r ${cfg.dot} flex-shrink-0`} />
            <span className="leading-snug">{n.content}</span>
          </div>
        );
      })}
    </div>
  );
}
