import { useEffect, useState } from 'react';
import { Clock3, MapPin, X } from 'lucide-react';

function timeAgo(value) {
  const elapsed = Date.now() - new Date(value).getTime();
  const minutes = Math.max(0, Math.floor(elapsed / 60000));
  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  return `${Math.floor(hours / 24)} 天前`;
}

export default function MapPreviewCard({ footprint, onClose, onOpenDetail, onOpenProfile }) {
  const [imageFailed, setImageFailed] = useState(false);
  useEffect(() => setImageFailed(false), [footprint?._id, footprint?.photoUrl]);
  if (!footprint) return null;

  const author = footprint.userId || {};
  const unread = Boolean(footprint.isUnread);
  const message = (footprint.message || '').split('\n').filter(Boolean).slice(-1)[0] || '留下了一条足迹';

  return (
    <section className="bliver-map-preview" aria-label="足迹预览">
      <div className="bliver-map-preview__handle" aria-hidden="true" />
      <div className="bliver-map-preview__header">
        <button
          type="button"
          className="bliver-map-preview__identity"
          onClick={() => author._id && onOpenProfile?.(author._id)}
          aria-label={`查看 ${author.name || '用户'} 的个人主页`}
        >
          {author.avatarUrl ? (
            <img src={author.avatarUrl} alt="" className="bliver-map-preview__avatar" />
          ) : (
            <span className="bliver-map-preview__avatar bliver-map-preview__avatar--fallback" aria-hidden="true">
              {(author.name || '?').slice(0, 1)}
            </span>
          )}
          <span>
            <strong title={author.name || '匿名用户'}>{author.name || '匿名用户'}</strong>
            <span className="bliver-map-preview__time"><Clock3 size={13} />{timeAgo(footprint.createdAt)}</span>
          </span>
        </button>
        <button type="button" className="bliver-map-preview__close" onClick={onClose} aria-label="关闭足迹预览" title="关闭">
          <X size={20} />
        </button>
      </div>

      <div className="bliver-map-preview__body">
        <div className="bliver-map-preview__content">
          <div className="bliver-map-preview__context">
            <span className="bliver-map-preview__source">{footprint.sourceLabel || '全球'}</span>
            {unread && <span className="bliver-map-preview__unread">未读更新</span>}
          </div>
          <p className="bliver-map-preview__place" title={footprint.placeName || '未命名地点'}><MapPin size={15} />{footprint.placeName || '未命名地点'}</p>
          <p className="bliver-map-preview__message">{footprint.mood ? `${footprint.mood} ` : ''}{message}</p>
        </div>
        {footprint.photoUrl && !imageFailed && (
          <img
            className="bliver-map-preview__photo"
            src={footprint.photoUrl}
            alt={`${author.name || '用户'}在${footprint.placeName || '此地点'}的足迹照片`}
            loading="lazy"
            onError={() => setImageFailed(true)}
          />
        )}
      </div>

      <button type="button" className="bliver-map-preview__detail" onClick={onOpenDetail}>
        查看详情
      </button>
    </section>
  );
}
