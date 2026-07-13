import { useMemo, useState } from 'react';
import { MessageCircle, Reply, Send } from 'lucide-react';
import { buildCommentTree, commentPermissions } from '../../domain/footprintConversation';
import ModerationMenu from './ModerationMenu';

export default function FootprintConversation({
  comments = [],
  footprintId,
  userId,
  isAdmin = false,
  onSubmitComment,
  onDeleteComment,
  onReport,
  pendingAction,
}) {
  const tree = useMemo(() => buildCommentTree(comments), [comments]);
  const [draft, setDraft] = useState(pendingAction?.draft || '');
  const [replyTarget, setReplyTarget] = useState(
    pendingAction?.targetId ? comments.find((comment) => comment._id === pendingAction.targetId) : null,
  );
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [retryPayload, setRetryPayload] = useState(null);

  const submit = async (payload = null) => {
    const content = payload?.content || draft.trim();
    if (!content || sending) return;
    const body = payload || {
      content,
      ...(replyTarget ? {
        parentCommentId: replyTarget.parentCommentId || replyTarget._id,
        replyToCommentId: replyTarget._id,
      } : {}),
    };
    setSending(true);
    setError('');
    try {
      await onSubmitComment?.(footprintId, body);
      setDraft('');
      setReplyTarget(null);
      setRetryPayload(null);
    } catch {
      setError('发送失败，请重试');
      setRetryPayload(body);
    } finally {
      setSending(false);
    }
  };

  const renderComment = (comment, nested = false) => {
    const permissions = commentPermissions({ comment, viewerId: userId, isAdmin });
    return (
      <div key={comment._id} data-testid="comment" data-comment-id={comment._id} className={`bliver-conversation-comment${nested ? ' is-reply' : ''}`}>
        <div className="bliver-conversation-comment__body">
          <strong>{comment.isDeleted ? '已删除用户' : comment.username}</strong>
          <p>{comment.isDeleted ? '该评论已删除' : comment.content}</p>
          {!comment.isDeleted && <button type="button" onClick={() => setReplyTarget(comment)}><Reply aria-hidden="true" /> 回复</button>}
          <ModerationMenu
            targetType="comment"
            footprintId={footprintId}
            targetId={comment._id}
            canDelete={permissions.canDelete}
            canReport={permissions.canReport}
            onDelete={() => onDeleteComment?.(footprintId, comment._id)}
            onReport={onReport}
          />
        </div>
        {comment.replies?.map((reply) => renderComment(reply, true))}
      </div>
    );
  };

  return (
    <section className="bliver-conversation" aria-labelledby="conversation-title">
      <h2 id="conversation-title"><MessageCircle aria-hidden="true" /> 评论 ({comments.length})</h2>
      <div className="bliver-conversation-list">
        {tree.length ? tree.map((comment) => renderComment(comment)) : <p className="bliver-conversation-empty">还没有评论</p>}
      </div>
      {replyTarget && (
        <div className="bliver-conversation-replying">
          回复 {replyTarget.username}
          <button type="button" onClick={() => setReplyTarget(null)}>取消回复</button>
        </div>
      )}
      <div className="bliver-conversation-composer">
        <label htmlFor="footprint-comment-input">{replyTarget ? '回复内容' : '评论内容'}</label>
        <textarea id="footprint-comment-input" aria-label={replyTarget ? '回复内容' : '评论内容'} value={draft} onChange={(event) => setDraft(event.target.value)} rows={2} />
        <button type="button" aria-label="发送评论" disabled={sending || !draft.trim()} onClick={() => submit()}>
          <Send aria-hidden="true" /> 发送
        </button>
      </div>
      {error && <div className="bliver-conversation-error" role="alert"><span>{error}</span><button type="button" onClick={() => submit(retryPayload)}>重试发送</button></div>}
    </section>
  );
}
