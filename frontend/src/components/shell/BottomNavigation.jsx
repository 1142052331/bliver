import { Compass, Map, MessageCircle, UserRound } from 'lucide-react';

/** @typedef {import('../../store/useShellStore').MobileDestination} MobileDestination */

/** @type {Array<{ id: MobileDestination, label: string, Icon: typeof Map }>} */
const NAV_ITEMS = [
  { id: 'map', label: '地图', Icon: Map },
  { id: 'activity', label: '动态', Icon: Compass },
  { id: 'messages', label: '消息', Icon: MessageCircle },
  { id: 'me', label: '我的', Icon: UserRound },
];

export default function BottomNavigation({
  activeDestination,
  layer = 'base',
  unreadMessages = 0,
  onDestinationChange,
}) {
  const numericUnreadMessages = Number(unreadMessages);
  const normalizedUnreadMessages = Number.isFinite(numericUnreadMessages)
    ? Math.max(0, Math.floor(numericUnreadMessages))
    : 0;
  const navigationClassName = layer === 'base'
    ? 'bliver-bottom-navigation'
    : `bliver-bottom-navigation bliver-bottom-navigation--${layer}`;

  return (
    <nav className={navigationClassName} aria-label="主要导航">
      {NAV_ITEMS.map(({ id, label, Icon }) => {
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
