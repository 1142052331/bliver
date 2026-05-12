import { useCallback } from 'react';
import { apiClient } from '../api';
import useUIStore from '../store/useUIStore';

export default function useFootprintActions({ user, requireLogin, setFootprints }) {
  const setFlyArrivedFp = useUIStore((s) => s.setFlyArrivedFp);

  const handleReact = useCallback(async (footprintId, emoji) => {
    if (!requireLogin({ type: 'react', footprintId })) return;
    try {
      const { data } = await apiClient.footprints.react(footprintId, emoji);
      setFootprints((prev) =>
        prev.map((fp) => (fp._id === footprintId ? { ...fp, reactions: data.footprint.reactions } : fp))
      );
    } catch (err) {
      console.error('React failed:', err);
    }
  }, [user, requireLogin, setFootprints]);

  const handleDelete = useCallback(async (footprintId) => {
    if (!requireLogin({ type: 'delete', footprintId })) return;
    if (!confirm('确认删除这条足迹？')) return;
    try {
      await apiClient.footprints.delete(footprintId);
      setFootprints((prev) => prev.filter((fp) => fp._id !== footprintId));
      setFlyArrivedFp((prev) => prev && prev._id === footprintId ? null : prev);
    } catch (err) {
      console.error('Delete failed:', err);
    }
  }, [user, requireLogin, setFootprints, setFlyArrivedFp]);

  const handleDeleteComment = useCallback(async (footprintId, commentId) => {
    try {
      const { data } = await apiClient.footprints.deleteComment(footprintId, commentId);
      setFootprints((prev) =>
        prev.map((fp) => (fp._id === footprintId
          ? { ...fp, comments: data.footprint.comments }
          : fp))
      );
    } catch (err) {
      console.error('Delete comment failed:', err);
    }
  }, [setFootprints]);

  const handleShare = useCallback((footprintId) => {
    const url = `${window.location.origin}${window.location.pathname}?fp=${footprintId}`;
    navigator.clipboard.writeText(url).catch(() => {});
  }, []);

  const handleComment = useCallback(async (footprintId, content) => {
    if (!requireLogin({ type: 'comment', footprintId })) return;
    try {
      const { data } = await apiClient.footprints.comment(footprintId, content);
      setFootprints((prev) =>
        prev.map((fp) => (fp._id === footprintId ? { ...fp, comments: data.footprint.comments } : fp))
      );
    } catch (err) {
      console.error('Comment failed:', err);
    }
  }, [user, requireLogin, setFootprints]);

  return { handleReact, handleDelete, handleDeleteComment, handleShare, handleComment };
}
