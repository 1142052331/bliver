import { Info, Navigation } from 'lucide-react';

const COPY = {
  denied: {
    title: '定位权限已关闭',
    message: '你仍可以浏览全球动态；如需省/国家范围，请在浏览器地址栏的权限设置中允许定位。',
    action: '重新尝试定位',
  },
  unavailable: {
    title: '当前浏览器不支持定位',
    message: '已切换到全球公开动态，你可以继续浏览，也可以手动选择范围。',
    action: '再次检查定位',
  },
  error: {
    title: '暂时无法获取位置',
    message: '已切换到全球公开动态。网络恢复或权限调整后，可以再次尝试。',
    action: '重试定位',
  },
};

export default function LocationPermissionNotice({
  permissionState,
  onRequestLocation,
  now,
  viewerKey = 'guest',
  className = '',
}) {
  const copy = COPY[permissionState];
  if (!copy) return null;

  return (
    <aside className={`bliver-location-permission-notice ${className}`.trim()} aria-live="polite">
      <Info size={19} aria-hidden="true" />
      <div className="bliver-location-permission-notice__body">
        <strong>{copy.title}</strong>
        <p>{copy.message}</p>
      </div>
      <button
        type="button"
        onClick={() => onRequestLocation?.({ explicit: true, now, viewerKey })}
      >
        <Navigation size={16} aria-hidden="true" />
        <span>{copy.action}</span>
      </button>
    </aside>
  );
}
