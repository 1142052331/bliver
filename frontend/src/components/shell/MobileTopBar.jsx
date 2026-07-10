import { Bell, ChevronDown, MapPin } from 'lucide-react';

export default function MobileTopBar({
  locationLabel = '当前位置',
  unreadNotifications = 0,
  onBrandPress,
  onLocationPress,
  onNotificationsPress,
}) {
  const normalizedLocationLabel = typeof locationLabel === 'string' && locationLabel.trim()
    ? locationLabel.trim()
    : '当前位置';
  const normalizedUnreadNotifications = typeof unreadNotifications === 'number'
    && Number.isFinite(unreadNotifications)
    ? Math.max(0, Math.floor(unreadNotifications))
    : 0;
  const notificationsLabel = normalizedUnreadNotifications > 0
    ? '通知，' + normalizedUnreadNotifications + ' 条未读'
    : '通知';
  const notificationContent = (
    <>
      <Bell size={21} strokeWidth={2} aria-hidden="true" />
      {normalizedUnreadNotifications > 0 && (
        <span className="bliver-mobile-top-bar__badge" aria-hidden="true">
          {normalizedUnreadNotifications > 99 ? '99+' : normalizedUnreadNotifications}
        </span>
      )}
    </>
  );

  return (
    <header className="bliver-mobile-top-bar">
      {onBrandPress ? (
        <button
          type="button"
          className="bliver-mobile-top-bar__control bliver-mobile-top-bar__brand"
          aria-label="关于 Bliver"
          data-shell-control
          onClick={onBrandPress}
        >
          Bliver
        </button>
      ) : (
        <span className="bliver-mobile-top-bar__brand bliver-mobile-top-bar__brand--static">
          Bliver
        </span>
      )}

      {onLocationPress ? (
        <button
          type="button"
          className="bliver-mobile-top-bar__control bliver-mobile-top-bar__location"
          aria-label={normalizedLocationLabel}
          data-shell-control
          onClick={onLocationPress}
        >
          <MapPin size={17} strokeWidth={2} aria-hidden="true" />
          <span className="bliver-mobile-top-bar__location-label" aria-hidden="true">
            {normalizedLocationLabel}
          </span>
          <ChevronDown size={15} strokeWidth={2} aria-hidden="true" />
        </button>
      ) : (
        <span className="bliver-mobile-top-bar__location bliver-mobile-top-bar__location--static">
          <MapPin size={17} strokeWidth={2} aria-hidden="true" />
          <span className="bliver-mobile-top-bar__location-label">{normalizedLocationLabel}</span>
        </span>
      )}

      {onNotificationsPress ? (
        <button
          type="button"
          className="bliver-mobile-top-bar__control bliver-mobile-top-bar__notifications"
          aria-label={notificationsLabel}
          data-shell-control
          onClick={onNotificationsPress}
        >
          {notificationContent}
        </button>
      ) : (
        <span
          className="bliver-mobile-top-bar__notifications bliver-mobile-top-bar__notifications--static"
          aria-label={notificationsLabel}
        >
          {notificationContent}
        </span>
      )}
    </header>
  );
}
