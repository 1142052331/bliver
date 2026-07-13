import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../api';
import useUIStore from '../store/useUIStore';
import { replaceFootprintInCaches } from './socketHandlers';

export default function useFootprintActions({ user, requireLogin, setFootprints }) {
  const queryClient = useQueryClient();
  const setFlyArrivedFp = useUIStore((s) => s.setFlyArrivedFp);
  const viewerIdentity = user?._id
    ? `${user.role === 'admin' ? 'admin' : 'user'}:${user._id}`
    : 'guest';

  const applyFootprint = useCallback((footprint) => {
    if (!footprint?._id) return;
    replaceFootprintInCaches(queryClient, footprint, viewerIdentity);
    setFootprints((previous) => previous.map((item) => (
      item._id === footprint._id ? footprint : item
    )));
  }, [queryClient, setFootprints, viewerIdentity]);

  const handleReact = useCallback(async (footprintId, emoji) => {
    if (!requireLogin({ type: 'react', footprintId })) return;
    try {
      const { data } = await apiClient.footprints.react(footprintId, emoji);
      applyFootprint(data.footprint);
      return data.footprint;
    } catch (err) {
      console.error('React failed:', err);
      throw err;
    }
  }, [applyFootprint, requireLogin]);

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
      applyFootprint(data.footprint);
      return data.footprint;
    } catch (err) {
      console.error('Delete comment failed:', err);
      throw err;
    }
  }, [applyFootprint]);

  const handleShare = useCallback((footprintId) => {
    const url = `${window.location.origin}${window.location.pathname}?fp=${footprintId}`;
    navigator.clipboard.writeText(url).catch(() => {});
  }, []);

  const handleComment = useCallback(async (footprintId, input) => {
    if (!requireLogin({ type: 'comment', footprintId })) return;
    const payload = typeof input === 'string' ? { content: input } : input;
    try {
      const { data } = await apiClient.footprints.comment(footprintId, payload);
      applyFootprint(data.footprint);
      return data.footprint;
    } catch (err) {
      console.error('Comment failed:', err);
      throw err;
    }
  }, [applyFootprint, requireLogin]);

  const handleReport = useCallback(async ({ footprintId, targetType, targetId, reason, details }) => {
    if (!requireLogin({ type: 'report', footprintId, targetType, targetId })) return null;
    const payload = { footprintId, targetType, targetId, reason, ...(details ? { details } : {}) };
    const { data } = await apiClient.reports.create(payload);
    return data.report;
  }, [requireLogin]);

  return {
    handleReact,
    handleDelete,
    handleDeleteComment,
    handleShare,
    handleComment,
    handleReport,
  };
}
