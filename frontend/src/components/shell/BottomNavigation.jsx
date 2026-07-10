import { Compass, Map, MessageCircle, UserRound } from 'lucide-react';

const destinations = [
  { id: 'map', label: '地图', Icon: Map },
  { id: 'activity', label: '动态', Icon: Compass },
  { id: 'messages', label: '消息', Icon: MessageCircle },
  { id: 'profile', label: '我的', Icon: UserRound },
];

export default function BottomNavigation({
  activeDestination,
  unreadMessages = 0,
  onDestinationChange,
}) {
  const normalizedUnreadMessages = Math.max(0, Number(unreadMessages) || 0);

  return (
    <nav className="bliver-bottom-navigation" aria-label="主要导航">
      {destinations.map(({ id, label, Icon }) => {
        const isActive = activeDestination === id;
        const isMessages = id === 'messages';
        const accessibleLabel = isMessages && normalizedUnreadMessages > 0
          ? '消息，' + normalizedUnreadMessages + ' 条未读'
          : label;

        return (
          <button
            key={id}
            type="button"
            className="bliver-bottom-navigation__item"
            aria-current={isActive ? 'page' : undefined}
            aria-label={accessibleLabel}
            data-shell-control
            onClick={() => onDestinationChange(id)}
          >
            <span className="bliver-bottom-navigation__icon" aria-hidden="true">
              <Icon size={22} strokeWidth={isActive ? 2.25 : 1.8} />
              {isMessages && normalizedUnreadMessages > 0 && (
                <span className="bliver-bottom-navigation__badge">
                  {normalizedUnreadMessages > 99 ? '99+' : normalizedUnreadMessages}
                </span>
              )}
            </span>
            <span className="bliver-bottom-navigation__label" aria-hidden="true">
              {label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
