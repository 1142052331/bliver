// @feature 打卡详情卡片 | Footprint Detail Modal | FootprintDetailModal
import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Clock, Image, MapPin, Share2 } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import useUIStore from '../store/useUIStore';
import ReactionPicker from './ReactionPicker';
import { useFootprintActionsContext } from '../contexts/FootprintActionsContext';
import { apiClient } from '../api';
import { invalidateFootprintLists, setFootprintUnreadState } from '../hooks/socketHandlers';
import { footprintPermissions } from '../domain/footprintConversation';
import FootprintDetailSheet from './footprint/FootprintDetailSheet';
import FootprintConversation from './footprint/FootprintConversation';
import ModerationMenu from './footprint/ModerationMenu';

function canKeepRealtimeFootprint(footprint, userId, isAdmin) {
  const ownerId = footprint.userId?._id || footprint.userId;
  if (isAdmin || (userId && String(ownerId) === String(userId))) return true;
  if (!footprint.visibility) return true;
  if (footprint.visibility === 'private') return false;
  if (footprint.visibility === 'friends') return Boolean(userId);
  if (footprint.visibility !== 'public') return false;
  const expiresAt = new Date(footprint.discoveryExpiresAt).getTime();
  return Number.isFinite(expiresAt) && (expiresAt > Date.now() || Boolean(userId));
}

export default function FootprintDetailModal({
  fp: fpProp,
  userId,
  isAdmin,
  onClose,
  allFootprints,
  pendingAction,
  onPendingActionConsumed,
}) {
  const {
    handleReact: onReact,
    handleDelete: onDelete,
    handleShare: onShare,
    handleComment: onComment,
    handleDeleteComment: onDeleteComment,
    handleReport: onReport,
  } = useFootprintActionsContext();
  const queryClient = useQueryClient();
  const listedFp = allFootprints && fpProp
    ? allFootprints.find((footprint) => footprint._id === fpProp._id) || fpProp
    : fpProp;
  const [realtimeFp, setRealtimeFp] = useState(null);
  const fp = realtimeFp?._id === listedFp?._id ? realtimeFp : listedFp;
  const mountedRef = useRef(true);
  const closedFootprintIdRef = useRef(null);
  const attemptedReadRef = useRef(null);
  const activeReadIdRef = useRef(fp?._id || null);
  const copyTimerRef = useRef(null);
  const [copied, setCopied] = useState(false);
  const [readState, setReadState] = useState({ footprintId: null, status: 'idle' });

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      clearTimeout(copyTimerRef.current);
    };
  }, []);

  useEffect(() => useUIStore.subscribe(
    (state) => state.footprintEventId,
    () => {
      const event = useUIStore.getState().footprintEvent;
      const eventId = event?.footprintId || event?.footprint?._id;
      if (!event || !fpProp?._id || eventId !== fpProp._id) return;
      if (event.type === 'deleted'
        || (event.type === 'updated' && !canKeepRealtimeFootprint(event.footprint, userId, isAdmin))) {
        if (closedFootprintIdRef.current !== eventId) {
          closedFootprintIdRef.current = eventId;
          onClose();
        }
        return;
      }
      if (event.footprint) setRealtimeFp((current) => ({ ...(current || listedFp), ...event.footprint }));
    },
  ), [fpProp?._id, isAdmin, listedFp, onClose, userId]);

  useEffect(() => {
    if (fp?._id) useUIStore.getState().setViewedFootprintId(fp._id);
  }, [fp?._id]);

  const submitRead = useCallback(async () => {
    if (!fp) return;
    const footprintId = fp._id;
    activeReadIdRef.current = footprintId;
    setReadState({ footprintId, status: 'saving' });
    const viewer = userId ? (isAdmin ? `admin:${userId}` : `user:${userId}`) : 'guest';
    setFootprintUnreadState(queryClient, footprintId, false, viewer);
    try {
      await apiClient.footprints.markRead(footprintId);
      if (mountedRef.current && activeReadIdRef.current === footprintId) {
        setReadState({ footprintId, status: 'success' });
      }
    } catch {
      setFootprintUnreadState(queryClient, footprintId, true, viewer);
      if (mountedRef.current && activeReadIdRef.current === footprintId) {
        setReadState({ footprintId, status: 'error' });
      }
    } finally {
      invalidateFootprintLists(queryClient);
    }
  }, [fp, isAdmin, queryClient, userId]);

  useEffect(() => {
    if (!fp) return;
    activeReadIdRef.current = fp._id;
    if (!userId || !fp.isUnread || attemptedReadRef.current === fp._id) return;
    attemptedReadRef.current = fp._id;
    void submitRead();
  }, [fp, submitRead, userId]);

  useEffect(() => {
    if (pendingAction?.footprintId === fp?._id) onPendingActionConsumed?.();
  }, [fp?._id, onPendingActionConsumed, pendingAction]);

  if (!fp) return null;

  const user = fp.userId || {};
  const permissions = footprintPermissions({ footprint: fp, viewerId: userId, isAdmin });
  const showUnreadError = readState.footprintId === fp._id && readState.status === 'error';

  return (
    <FootprintDetailSheet onClose={onClose}>
      {fp.photoUrl ? (
        <img className="bliver-detail-photo" src={fp.photoUrl} alt="足迹照片" loading="lazy" />
      ) : (
        <div className="bliver-detail-photo-placeholder"><Image aria-hidden="true" /></div>
      )}
      <div className="bliver-detail-content">
        <div className="bliver-detail-author">
          {user.avatarUrl ? <img src={user.avatarUrl} alt="" /> : <span>{(user.name || '?')[0]}</span>}
          <div><strong>{user.name || '未知用户'}</strong><small><Clock aria-hidden="true" /> {new Date(fp.createdAt).toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</small></div>
          <ModerationMenu
            targetType="footprint"
            footprintId={fp._id}
            targetId={fp._id}
            canDelete={permissions.canDelete}
            canReport={permissions.canReport}
            onDelete={() => onDelete(fp._id)}
            onReport={onReport}
          />
        </div>
        <div className="bliver-detail-location"><MapPin aria-hidden="true" /> {fp.placeName || '未知位置'} {fp.mood && <span>{fp.mood}</span>}</div>
        <p className="bliver-detail-message">{fp.message}</p>
        <div className="bliver-detail-actions">
          <ReactionPicker fp={fp} userId={userId} onReact={onReact} />
          <button type="button" className="bliver-text-button" onClick={() => {
            onShare(fp._id);
            setCopied(true);
            clearTimeout(copyTimerRef.current);
            copyTimerRef.current = setTimeout(() => { if (mountedRef.current) setCopied(false); }, 2000);
          }}>
            {copied ? <Check aria-hidden="true" /> : <Share2 aria-hidden="true" />} {copied ? '已复制' : '分享'}
          </button>
        </div>
        {showUnreadError && (
          <div className="bliver-detail-read-error" role="alert">
            <span>已读状态同步失败</span>
            <button type="button" onClick={() => { attemptedReadRef.current = null; void submitRead(); }}>重试标记已读</button>
          </div>
        )}
        <FootprintConversation
          comments={fp.comments || []}
          footprintId={fp._id}
          userId={userId}
          isAdmin={isAdmin}
          onSubmitComment={onComment}
          onDeleteComment={onDeleteComment}
          onReport={onReport}
          pendingAction={pendingAction}
        />
      </div>
    </FootprintDetailSheet>
  );
}
