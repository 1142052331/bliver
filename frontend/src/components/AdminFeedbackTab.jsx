// @feature 管理员反馈查看 | Admin Feedback Tab | AdminFeedbackTab
import { useState, useEffect } from 'react';
import { Star, MessageSquare, Loader2 } from 'lucide-react';
import { apiClient } from '../api';

function timeStr(date) {
  return new Date(date).toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function AdminFeedbackTab() {
  const [feedback, setFeedback] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiClient.admin.feedback().then(({ data }) => {
      setFeedback(data.feedback || []);
    }).finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <Loader2 className="w-6 h-6 animate-spin text-white/40" />
    </div>
  );

  if (feedback.length === 0) return (
    <div className="text-center py-20 text-white/40 text-sm">暂无反馈</div>
  );

  return (
    <div className="divide-y divide-white/[0.06]">
      {feedback.map((fb) => (
        <div key={fb._id} className="px-6 py-4">
          <div className="flex items-center gap-3 mb-2">
            {fb.userId?.avatarUrl ? (
              <img src={fb.userId.avatarUrl} className="w-7 h-7 rounded-full object-cover" alt="" />
            ) : (
              <div className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center text-white text-[10px] font-bold">
                {(fb.userId?.name || '?')[0]}
              </div>
            )}
            <span className="text-sm text-white/80 font-medium">{fb.userId?.name || 'Unknown'}</span>
            <span className="text-xs text-white/30">{timeStr(fb.createdAt)}</span>
          </div>
          <div className="flex items-center gap-1 mb-1.5">
            {[1, 2, 3, 4, 5].map((i) => (
              <Star key={i} className="w-4 h-4" fill={i <= fb.rating ? '#facc15' : 'transparent'} stroke={i <= fb.rating ? '#facc15' : 'rgba(255,255,255,0.15)'} />
            ))}
          </div>
          {fb.content && <p className="text-sm text-white/60 whitespace-pre-wrap">{fb.content}</p>}
        </div>
      ))}
    </div>
  );
}
