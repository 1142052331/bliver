function idOf(value) {
  return String(value?._id || value?.id || value || '');
}

function chronological(left, right) {
  const time = new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();
  return time || idOf(left).localeCompare(idOf(right));
}

export function buildCommentTree(comments = []) {
  const flattened = comments.flatMap((comment) => [
    { ...comment, replies: undefined },
    ...(comment.replies || []).map((reply) => ({
      ...reply,
      parentCommentId: reply.parentCommentId || comment._id,
    })),
  ]);
  const roots = flattened.filter((comment) => !comment.parentCommentId).sort(chronological);
  const replies = flattened.filter((comment) => comment.parentCommentId).sort(chronological);
  return roots.map((root) => ({
    ...root,
    replies: replies.filter((reply) => idOf(reply.parentCommentId) === idOf(root)),
  }));
}

export function commentPermissions({ comment, viewerId, isAdmin }) {
  const isOwner = Boolean(viewerId) && idOf(comment.userId) === idOf(viewerId);
  return {
    canDelete: Boolean(isAdmin || isOwner),
    canReport: Boolean(viewerId && !isAdmin && !isOwner && !comment.isDeleted),
  };
}

export function footprintPermissions({ footprint, viewerId, isAdmin }) {
  const isOwner = Boolean(viewerId) && idOf(footprint.userId) === idOf(viewerId);
  return {
    canDelete: Boolean(isAdmin),
    canReport: Boolean(viewerId && !isAdmin && !isOwner),
  };
}
