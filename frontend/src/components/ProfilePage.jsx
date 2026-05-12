import { useEffect, useState, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, MapPin, Clock, Image, MessageCircle, Heart, Send } from 'lucide-react';
import api from '../api';
import { getUser } from '../auth';
import useUIStore from '../store/useUIStore';

const REACTION_EMOJIS = ['❤️', '😂', '😮', '😢', '🙏', '👍'];

function timeAgo(date) {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return '刚刚';
  if (mins < 60) return `${mins}分钟前`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}小时前`;
  return `${Math.floor(hours / 24)}天前`;
}

export default function ProfilePage() {
  const { userId } = useParams();
  const currentUser = getUser();

  const [profile, setProfile] = useState(null);
  const [footprints, setFootprints] = useState([]);
  const [recentReactions, setRecentReactions] = useState([]);
  const [recentComments, setRecentComments] = useState([]);
  const [loading, setLoading] = useState(true);

  // Message board
  const [commentText, setCommentText] = useState('');
  const [sendingComment, setSendingComment] = useState(false);

  // Reaction
  const [reacting, setReacting] = useState(false);

  const fetchProfile = async () => {
    try {
      const { data } = await api.get(`/api/users/${userId}/profile`);
      setProfile(data.user);
      setFootprints(data.footprints);
      setRecentReactions(data.recentReactions);
      setRecentComments(data.recentComments);
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  };

  useEffect(() => { fetchProfile(); }, [userId]);

  // Real-time updates via Zustand store
  useEffect(() => {
    const unsubFp = useUIStore.subscribe(
      (s) => s.footprintEventId,
      () => {
        const evt = useUIStore.getState().footprintEvent;
        if (!evt) return;
        if (evt.type === 'new') {
          const fp = evt.footprint;
          if (fp && (fp.userId?._id === userId || fp.userId === userId)) {
            setFootprints((prev) => [fp, ...prev]);
          }
        } else if (evt.type === 'updated') {
          const fp = evt.footprint;
          if (fp) {
            setFootprints((prev) =>
              prev.map((f) => (f._id === fp._id
                ? { ...f, reactions: fp.reactions, comments: fp.comments }
                : f))
            );
          }
        } else if (evt.type === 'deleted') {
          const fid = evt.footprintId;
          if (fid) setFootprints((prev) => prev.filter((f) => f._id !== fid));
        }
      }
    );

    const unsubProfile = useUIStore.subscribe(
      (s) => s.profileEventId,
      () => {
        const evt = useUIStore.getState().profileEvent;
        if (evt?.userId === userId) setProfile(evt.user);
      }
    );

    return () => { unsubFp(); unsubProfile(); };
  }, [userId]);

  const handleComment = async () => {
    if (!currentUser) {
      alert('请先登录后再留言');
      return;
    }
    if (!commentText.trim()) return;
    setSendingComment(true);
    try {
      const { data } = await api.post(`/api/users/${userId}/profile/comment`, { content: commentText.trim() });
      setProfile(data.user);
      setCommentText('');
    } catch (err) {
      console.error(err);
    }
    setSendingComment(false);
  };

  const handleReact = async (emoji) => {
    if (!currentUser) {
      alert('请先登录后再表态');
      return;
    }
    setReacting(true);
    try {
      const { data } = await api.post(`/api/users/${userId}/profile/react`, { emoji });
      setProfile(data.user);
    } catch (err) {
      console.error(err);
    }
    setReacting(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-400">用户不存在</p>
      </div>
    );
  }

  const isOwnProfile = currentUser?._id === userId;
  const myReact = profile.profileReactions?.find((r) => r.senderId?._id === currentUser?._id || r.senderId === currentUser?._id);
  const reactionCount = profile.profileReactions?.length || 0;
  const reactionSummary = REACTION_EMOJIS
    .map((e) => {
      const count = profile.profileReactions?.filter((r) => r.emoji === e).length || 0;
      return count > 0 ? { emoji: e, count } : null;
    })
    .filter(Boolean);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 shadow-sm">
        <div className="max-w-2xl mx-auto px-4 py-6">
          {/* Back button */}
          <Link to="/" className="inline-flex items-center gap-1 text-sm text-gray-400 hover:text-gray-600 mb-4">
            <ArrowLeft className="w-4 h-4" />
            Back to Map
          </Link>

          <div className="flex items-center gap-5">
            {/* Avatar */}
            {profile.avatarUrl ? (
              <img src={profile.avatarUrl} className="w-20 h-20 rounded-full object-cover ring-4 ring-blue-100" />
            ) : (
              <div className="w-20 h-20 rounded-full bg-blue-500 flex items-center justify-center text-white text-3xl font-bold">
                {(profile.name || '?')[0].toUpperCase()}
              </div>
            )}

            <div className="flex-1">
              <h1 className="text-2xl font-bold text-gray-800">{profile.name}</h1>
              <div className="flex items-center gap-4 mt-1">
                <span className="text-sm text-gray-400">足迹 {footprints.length}</span>
                <span className="text-sm text-gray-400">表态 {reactionCount}</span>
              </div>

              {/* Reaction badge + buttons */}
              {!isOwnProfile && (
                <div className="flex items-center gap-2 mt-3">
                  <div className="flex items-center gap-1">
                    {REACTION_EMOJIS.map((emoji) => (
                      <button
                        key={emoji}
                        disabled={reacting}
                        onClick={() => handleReact(emoji)}
                        className={`text-lg p-1 rounded-lg transition-all hover:scale-125
                          ${myReact?.emoji === emoji ? 'bg-blue-100 scale-110 ring-2 ring-blue-400' : 'hover:bg-gray-100'}`}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                  {myReact && (
                    <span className="text-xs text-gray-400 ml-1">已表态</span>
                  )}
                </div>
              )}

              {/* Reaction summary */}
              {reactionSummary.length > 0 && (
                <div className="flex items-center gap-1 mt-2">
                  {reactionSummary.map(({ emoji, count }) => (
                    <span key={emoji} className="text-sm" title={`${count}人`}>
                      {emoji}
                      {count > 1 && <span className="text-xs text-gray-400 ml-0.5">{count}</span>}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Content grid */}
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-8">
        {/* Interaction history */}
        {(recentReactions.length > 0 || recentComments.length > 0) && (
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
            <h3 className="font-semibold text-gray-800 mb-3">最近互动</h3>
            {recentReactions.length > 0 && (
              <div className="mb-3">
                <p className="text-xs text-gray-400 mb-2">最近表态过</p>
                <div className="flex flex-wrap gap-2">
                  {recentReactions.map((fp) => (
                    <span key={fp._id} className="inline-flex items-center gap-1 text-xs bg-gray-50 px-2 py-1 rounded-full">
                      {fp.userId?.name || '?'}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {recentComments.length > 0 && (
              <div>
                <p className="text-xs text-gray-400 mb-2">最近评论过</p>
                <div className="flex flex-wrap gap-2">
                  {recentComments.map((fp) => (
                    <span key={fp._id} className="inline-flex items-center gap-1 text-xs bg-gray-50 px-2 py-1 rounded-full">
                      {fp.userId?.name || '?'}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Footprint History */}
        <div>
          <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <MapPin className="w-5 h-5 text-blue-500" />
            历史足迹
          </h3>
          {footprints.length === 0 ? (
            <p className="text-gray-400 text-sm text-center py-10">还没有发布过足迹</p>
          ) : (
            <div className="space-y-4">
              {footprints.map((fp) => (
                <div key={fp._id} className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
                  <div className="flex items-center gap-2 mb-2">
                    <Clock className="w-3.5 h-3.5 text-gray-300" />
                    <span className="text-xs text-gray-400">{timeAgo(fp.createdAt)}</span>
                  </div>
                  <p className="text-sm font-medium text-gray-700 mb-1">
                    <MapPin className="w-3.5 h-3.5 inline mr-1 text-gray-400" />
                    {fp.placeName || 'Unknown'}
                  </p>
                  {fp.photoUrl && (
                    <img src={fp.photoUrl} className="w-full max-h-[300px] object-cover rounded-xl mt-2 mb-2" />
                  )}
                  <p className="text-sm text-gray-600 whitespace-pre-wrap leading-relaxed">{fp.message}</p>
                  <div className="flex items-center gap-4 mt-3 text-xs text-gray-400">
                    <span className="flex items-center gap-1">
                      <Heart className="w-3.5 h-3.5" />
                      {(fp.reactions || []).length}
                    </span>
                    <span className="flex items-center gap-1">
                      <MessageCircle className="w-3.5 h-3.5" />
                      {(fp.comments || []).length}
                    </span>
                    {fp.mood && <span className="text-base">{fp.mood}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Message Board (only visible on others' profiles) */}
        {!isOwnProfile && (
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
            <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
              <MessageCircle className="w-5 h-5 text-blue-500" />
              留言板
            </h3>

            {/* Comments list */}
            {(profile.profileComments || []).length > 0 ? (
              <div className="space-y-3 mb-4">
                {profile.profileComments.map((c, i) => (
                  <div key={i} className="p-3 bg-gray-50 rounded-xl">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-sm text-gray-800">{c.senderName}</span>
                      <span className="text-xs text-gray-400">{timeAgo(c.createdAt)}</span>
                    </div>
                    <p className="text-sm text-gray-600">{c.content}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-gray-400 mb-4">还没有留言，来说点什么吧</p>
            )}

            {/* Comment form */}
            <div className="flex gap-2">
              <textarea
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                placeholder="留下你的寄语..."
                rows={2}
                className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-blue-400 resize-none"
              />
              <button
                onClick={handleComment}
                disabled={sendingComment || !commentText.trim()}
                className="flex-shrink-0 px-4 py-2 bg-blue-500 text-white rounded-xl text-sm font-medium
                  hover:bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors
                  flex items-center gap-1"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
