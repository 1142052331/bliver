import type { CommentDto } from '@bliver/contracts';
import { Button } from '@bliver/ui';
import { useQuery } from '@tanstack/react-query';
import { MessageCircle, Reply, Send, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation } from 'react-router-dom';

import { consumePendingAction, type PendingAction } from '../../platform/pending-action.js';
import { addComment as defaultAddComment, addReply as defaultAddReply, loadComments as defaultLoadComments } from './api.js';

export interface ConversationSectionProps {
  readonly footprintId: string;
  readonly comments?: readonly CommentDto[];
  readonly load?: (id: string) => Promise<readonly CommentDto[]>;
  readonly addComment?: (id: string, content: string) => Promise<unknown>;
  readonly addReply?: (id: string, parentId: string, content: string) => Promise<unknown>;
  readonly onAuthRequired?: (action: Record<string, string>) => void;
}

export function ConversationSection({ footprintId, comments: initial = [], load = defaultLoadComments, addComment = defaultAddComment, addReply = defaultAddReply, onAuthRequired }: ConversationSectionProps) {
  const { i18n, t } = useTranslation();
  const [content, setContent] = useState('');
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [error, setError] = useState<'signInToJoin' | 'commentPostFailed' | null>(null);
  const [authRequired, setAuthRequired] = useState(false);
  const location = useLocation();
  const replayed = useRef<string | null>(null);
  const query = useQuery({ queryKey: ['footprint', footprintId, 'comments'], queryFn: () => load(footprintId), ...(initial.length ? { initialData: initial } : {}), retry: 1 });
  const comments = query.data ?? initial;

  useEffect(() => {
    const pending = (location.state as { pendingAction?: PendingAction } | null)?.pendingAction;
    if (!location.pathname.startsWith('/footprints/')) return;
    if (!pending || pending.footprintId !== footprintId || (pending.kind !== 'comment' && pending.kind !== 'reply') || !pending.content) return;
    const pendingContent = pending.content;
    const fingerprint = JSON.stringify(pending);
    if (replayed.current === fingerprint) return;
    replayed.current = fingerprint;
    void (async () => {
      try {
        if (pending.kind === 'reply' && pending.parentCommentId) await addReply(footprintId, pending.parentCommentId, pendingContent);
        else if (pending.kind === 'comment') await addComment(footprintId, pendingContent);
        consumePendingAction();
        await query.refetch();
      } catch {
        return;
      }
    })();
  }, [addComment, addReply, footprintId, location.pathname, location.state, query]);

  const submit = async (): Promise<void> => {
    const value = content.trim();
    if (!value) return;
    try {
      if (replyTo) await addReply(footprintId, replyTo, value);
      else await addComment(footprintId, value);
      setContent('');
      setReplyTo(null);
      setError(null);
      setAuthRequired(false);
      await query.refetch();
    } catch (cause) {
      if (cause instanceof Error && cause.message === 'AUTH_REQUIRED') {
        onAuthRequired?.({ kind: replyTo ? 'reply' : 'comment', footprintId, content: value, ...(replyTo ? { parentCommentId: replyTo } : {}) });
        setAuthRequired(true);
        setError('signInToJoin');
      } else {
        setAuthRequired(false);
        setError('commentPostFailed');
      }
    }
  };

  return (
    <section className="conversation" aria-label={t('activity.conversation')}>
      <div className="conversation__heading"><span><MessageCircle aria-hidden="true" /><strong>{t('activity.conversation')}</strong></span>{query.isLoading ? <span role="status">{t('activity.loadingComments')}</span> : <span>{comments.length}</span>}</div>
      {query.isError ? <p role="alert">{t('activity.commentsLoadFailed')}</p> : null}
      {error ? <p role="alert">{t(`activity.${error}`)}{authRequired ? <> <Link to="/login">{t('activity.signIn')}</Link></> : null}</p> : null}
      <ol className="conversation__thread">
        {comments.map((comment) => (
          <li className="conversation__comment" key={comment.id}>
            <div className="conversation__comment-avatar" aria-hidden="true">{comment.author.name.charAt(0).toLocaleUpperCase()}</div>
            <div className="conversation__comment-body">
              <div className="conversation__comment-meta"><strong>{comment.author.name}</strong><time dateTime={comment.createdAt}>{new Date(comment.createdAt).toLocaleDateString(i18n.resolvedLanguage ?? i18n.language)}</time></div>
              <p>{comment.content}</p>
              <Button variant="ghost" onClick={() => setReplyTo(comment.id)}><Reply aria-hidden="true" />{t('activity.reply')}</Button>
              {comment.replies.length ? (
                <ol className="conversation__replies">
                  {comment.replies.map((reply) => (
                    <li key={reply.id}>
                      <div className="conversation__comment-meta"><strong>{reply.author.name}</strong><time dateTime={reply.createdAt}>{new Date(reply.createdAt).toLocaleDateString(i18n.resolvedLanguage ?? i18n.language)}</time></div>
                      <p>{reply.content}</p>
                    </li>
                  ))}
                </ol>
              ) : null}
            </div>
          </li>
        ))}
      </ol>
      <label className="conversation__composer">
        <span>{t(replyTo ? 'activity.writeReply' : 'activity.addComment')}</span>
        <textarea aria-label={t(replyTo ? 'activity.replyField' : 'activity.commentField')} value={content} maxLength={2000} onChange={(event) => setContent(event.target.value)} />
      </label>
      <div className="conversation__actions">
        {replyTo ? <Button variant="ghost" onClick={() => setReplyTo(null)}><X aria-hidden="true" />{t('activity.cancelReply')}</Button> : null}
        <Button variant="secondary" onClick={() => void submit()} disabled={!content.trim()}><Send aria-hidden="true" />{t('activity.post')}</Button>
      </div>
    </section>
  );
}
