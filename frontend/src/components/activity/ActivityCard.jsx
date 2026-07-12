import { useState } from 'react';
import { Heart, MessageCircle, MapPin } from 'lucide-react';

function relationshipLabel(value) {
  if (value === 'friend') return '好友';
  if (value === 'owner' || value === 'self') return '我';
  if (value === 'admin') return '管理员';
  return '陌生人';
}

export default function ActivityCard({ item, requireLogin, onReact, onComment }) {
  const [imageVisible, setImageVisible] = useState(Boolean(item.photoUrl));
  const author = item.userId || item.user || {};
  const authorName = author.name || '未知用户';
  const photoAlt = `${authorName}在${item.placeName || '此处'}的足迹照片`;
  const handleReact = () => {
    const payload = { type: 'react', footprintId: item._id };
    if (item.canInteract || requireLogin?.(payload) === true) onReact?.(item);
  };
  const handleComment = () => {
    const payload = { type: 'comment', footprintId: item._id };
    if (item.canInteract || requireLogin?.(payload) === true) onComment?.(item);
  };
  return (
    <article className="bliver-activity-card">
      <header className="bliver-activity-card__header">
        <div className="bliver-activity-card__avatar" aria-hidden="true">{authorName.slice(0, 1)}</div>
        <div className="bliver-activity-card__identity"><strong>{authorName}</strong>{relationshipLabel(item.relationship) !== item.sourceLabel && <span>{relationshipLabel(item.relationship)}</span>}</div>
        {item.mood && <span className="bliver-activity-card__mood" aria-label="心情">{item.mood}</span>}
      </header>
      <div className="bliver-activity-card__meta"><MapPin size={16} aria-hidden="true" /><span>{item.placeName || '未知地点'}</span><time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</time><span className="bliver-activity-card__source">{item.sourceLabel || '公开发现'}</span></div>
      {item.message && <p className="bliver-activity-card__message">{item.message}</p>}
      {imageVisible && item.photoUrl && <img className="bliver-activity-card__media" src={item.photoUrl} alt={photoAlt} loading="lazy" onError={() => setImageVisible(false)} />}
      <footer className="bliver-activity-card__actions">
        <button type="button" aria-label={`喜欢 ${authorName}`} onClick={handleReact}><Heart size={18} aria-hidden="true" /><span>{item.reactions?.length || 0}</span></button>
        <button type="button" aria-label="查看评论" onClick={handleComment}><MessageCircle size={18} aria-hidden="true" /><span>{item.comments?.length || 0}</span></button>
      </footer>
    </article>
  );
}
