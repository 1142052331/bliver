import { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import api from '../api';
import { getUser } from '../auth';
import useUIStore from '../store/useUIStore';

/**
 * Manages profile data fetching, real-time updates, profile/banner editing,
 * and derived values (totalReactions, activeDays).
 */
export default function useProfileData(userId) {
  const [profile, setProfile] = useState(null);
  const [footprints, setFootprints] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploadingBanner, setUploadingBanner] = useState(false);
  const [bannerMsg, setBannerMsg] = useState('');
  const [editingName, setEditingName] = useState(false);
  const [newName, setNewName] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const bannerTimerRef = useRef(null);
  const mountedRef = useRef(true);

  useEffect(() => () => { mountedRef.current = false; }, []);

  const currentUser = getUser();
  const isOwnProfile = currentUser?._id === userId;

  /** Show banner message, auto-clear after N ms */
  const showBannerMsg = useCallback((msg, ms = 3000) => {
    setBannerMsg(msg);
    clearTimeout(bannerTimerRef.current);
    bannerTimerRef.current = setTimeout(() => setBannerMsg(''), ms);
  }, []);

  // ── Data fetching ──

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api.get(`/api/users/${userId}/profile`).then(({ data }) => {
      if (cancelled) return;
      setProfile(data.user);
      setFootprints(data.footprints);
    }).catch((err) => {
      if (!cancelled) console.error(err);
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [userId]);

  // Lock body scroll when open
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
      clearTimeout(bannerTimerRef.current);
    };
  }, []);

  // ── Real-time updates ──

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

  // ── Derived values ──

  const totalReactions = useMemo(
    () => footprints.reduce((sum, fp) => sum + (fp.reactions?.length || 0), 0),
    [footprints]
  );
  const activeDays = useMemo(() => {
    const days = new Set();
    footprints.forEach((fp) => days.add(new Date(fp.createdAt).toDateString()));
    return days.size;
  }, [footprints]);

  // ═══════════════════════════════════════════════════════
  //  Actions
  // ═══════════════════════════════════════════════════════

  const handleBannerUpload = useCallback(async (file) => {
    if (!file) return;
    setUploadingBanner(true);
    setBannerMsg('');
    try {
      const imageCompression = (await import('browser-image-compression')).default;
      const compressed = await imageCompression(file, { maxSizeMB: 1, maxWidthOrHeight: 1920 });
      const form = new FormData();
      form.append('banner', compressed);
      const { data } = await api.post('/api/users/profile/banner', form);
      if (mountedRef.current) setProfile(data.user);
      showBannerMsg('背景更换成功！');
    } catch (err) {
      showBannerMsg(err.response?.data?.error || '上传失败');
    }
    if (mountedRef.current) setUploadingBanner(false);
  }, [showBannerMsg]);

  const handleUpdateProfile = useCallback(async (updates) => {
    setSavingProfile(true);
    try {
      const form = new FormData();
      if (updates.name) form.append('name', updates.name);
      if (updates.avatar) {
        const imageCompression = (await import('browser-image-compression')).default;
        const compressed = await imageCompression(updates.avatar, { maxSizeMB: 0.5, maxWidthOrHeight: 300 });
        form.append('avatar', compressed);
      }
      const { data } = await api.put('/api/users/profile', form);
      if (mountedRef.current) setProfile(data.user);
      showBannerMsg('更新成功！');
    } catch (err) {
      showBannerMsg(err.response?.data?.error || '更新失败');
    }
    if (mountedRef.current) setSavingProfile(false);
  }, [showBannerMsg]);

  const handleSaveName = useCallback(() => {
    const name = newName.trim();
    if (!name || name === profile?.name) {
      setEditingName(false);
      return;
    }
    handleUpdateProfile({ name });
    setEditingName(false);
  }, [newName, profile, handleUpdateProfile]);

  return {
    profile, setProfile,
    footprints,
    loading,
    uploadingBanner, bannerMsg, showBannerMsg,
    editingName, setEditingName,
    newName, setNewName,
    savingProfile,
    isOwnProfile,
    totalReactions, activeDays,
    handleBannerUpload, handleUpdateProfile, handleSaveName,
  };
}
