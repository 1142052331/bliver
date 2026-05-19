// @feature 反馈建议 | Feedback Modal | FeedbackModal
import { useState } from 'react';
import { X, Star, MessageSquare, Loader2 } from 'lucide-react';
import { apiClient } from '../api';
import useUIStore from '../store/useUIStore';

export default function FeedbackModal({ isOpen, onClose }) {
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!rating) return;
    setLoading(true);
    try {
      await apiClient.feedback.submit({ rating, content });
      localStorage.setItem('feedback_submitted', '1');
      setDone(true);
      setTimeout(() => {
        setDone(false);
        setRating(0);
        setContent('');
        onClose();
      }, 1200);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setRating(0);
    setContent('');
    setDone(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[2000] flex items-end sm:items-center justify-center pointer-events-none">
      <div className="ios-backdrop absolute inset-0 pointer-events-auto" onClick={handleClose} />
      <div className="relative w-full sm:max-w-md mx-0 sm:mx-auto pointer-events-auto
        ios-panel rounded-t-[28px] sm:rounded-[28px] p-6 animate-slide-up">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-white/90 flex items-center gap-2">
            <div className="w-9 h-9 rounded-full ios-primary flex items-center justify-center">
              <MessageSquare className="w-4 h-4" />
            </div>
            反馈建议
          </h2>
          <button onClick={handleClose} className="ios-icon-button w-8 h-8 min-w-8">
            <X className="w-4 h-4 text-white/40" />
          </button>
        </div>

        {done ? (
          <div className="text-center py-8">
            <div className="text-4xl mb-3">🎉</div>
            <p className="text-white/80 font-medium">感谢你的反馈！</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            {/* Stars */}
            <div className="mb-5">
              <p className="text-xs text-white/30 mb-2">你觉得 Bliver 怎么样？</p>
              <div className="flex gap-1.5">
                {[1, 2, 3, 4, 5].map((i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setRating(i)}
                    onMouseEnter={() => setHover(i)}
                    onMouseLeave={() => setHover(0)}
                    className="p-1 transition-transform hover:scale-110"
                  >
                    <Star
                      className="w-8 h-8 transition-colors"
                      fill={(hover || rating) >= i ? '#facc15' : 'transparent'}
                      stroke={(hover || rating) >= i ? '#facc15' : 'rgba(255,255,255,0.2)'}
                    />
                  </button>
                ))}
              </div>
            </div>

            {/* Text */}
            <textarea
              className="w-full p-3 aurora-input rounded-xl resize-none text-sm mb-5 h-28"
              placeholder="有什么建议或想法？（可选）"
              value={content}
              onChange={(e) => setContent(e.target.value)}
            />

            {/* Submit */}
            <button
              type="submit"
              disabled={!rating || loading}
              className="ios-primary w-full py-3.5 rounded-full font-extrabold
                disabled:opacity-40 disabled:cursor-not-allowed
                transition-all duration-300 flex items-center justify-center gap-2"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              提交反馈
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
