const LABELS = {
  admin: '正在打开管理面板',
  photo: '正在打开照片墙',
  announcement: '正在打开系统公告',
};

export default function LegacySurfaceFallback({ surface = 'legacy' }) {
  return (
    <div className="bliver-legacy-surface-fallback" role="status" aria-live="polite">
      <span className="bliver-legacy-surface-fallback__spinner" aria-hidden="true" />
      <span>{LABELS[surface] || '正在打开内容'}</span>
    </div>
  );
}
