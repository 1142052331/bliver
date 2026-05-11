import { create } from 'zustand';

const useUIStore = create((set) => ({
  // ── Modal / Drawer toggles ──────────────────────
  showCheckIn: false,
  showTimeline: false,
  showNotifs: false,
  showAdmin: false,
  showAuth: false,
  showPhotoWall: false,
  showAbout: false,
  showAnnouncements: false,
  showFriends: false,

  // ── Auth modal helpers ──────────────────────────
  authTab: 'login',
  authMessage: '',

  // ── Map interaction ─────────────────────────────
  activeFootprintId: null,
  flyArrivedFp: null,
  timelineTargetFpId: null,
  clusterData: null,
  shareTarget: null,

  // ── Chat / Profile ──────────────────────────────
  chatUserId: null,
  viewingProfileId: null,

  // ── Floating notifications ──────────────────────
  notifications: [],

  // ── Dynamic Island notification ────────────────
  messageIsland: null,

  // ── Actions ─────────────────────────────────────

  openCheckIn: () => set({ showCheckIn: true }),
  closeCheckIn: () => set({ showCheckIn: false }),

  openTimeline: () => set({ showTimeline: true }),
  closeTimeline: () => set({ showTimeline: false }),

  toggleNotifs: () => set((s) => ({ showNotifs: !s.showNotifs })),
  closeNotifs: () => set({ showNotifs: false }),

  openAdmin: () => set({ showAdmin: true }),
  closeAdmin: () => set({ showAdmin: false }),

  openAuth: (tab = 'login', message = '') =>
    set({ showAuth: true, authTab: tab, authMessage: message }),
  closeAuth: () => set({ showAuth: false }),

  openPhotoWall: () => set({ showPhotoWall: true }),
  closePhotoWall: () => set({ showPhotoWall: false }),

  openAbout: () => set({ showAbout: true }),
  closeAbout: () => set({ showAbout: false }),

  openAnnouncements: () => set({ showAnnouncements: true }),
  closeAnnouncements: () => set({ showAnnouncements: false }),

  openFriends: () => set({ showFriends: true }),
  closeFriends: () => set({ showFriends: false }),

  // ── Map actions ─────────────────────────────────
  setActiveFootprintId: (id) => set({ activeFootprintId: id }),
  setFlyArrivedFp: (fp) => set({ flyArrivedFp: fp }),
  setTimelineTargetFpId: (id) => set({ timelineTargetFpId: id }),
  setClusterData: (data) => set({ clusterData: data }),
  setShareTarget: (id) => set({ shareTarget: id }),

  // ── Chat / Profile actions ──────────────────────
  openChat: (uid) => set({ chatUserId: uid }),
  closeChat: () => set({ chatUserId: null }),
  openProfile: (uid) => set({ viewingProfileId: uid }),
  closeProfile: () => set({ viewingProfileId: null }),

  // ── Auth helpers ────────────────────────────────
  setAuthTab: (tab) => set({ authTab: tab }),
  setAuthMessage: (msg) => set({ authMessage: msg }),

  // ── Notification actions ────────────────────────
  addNotification: (notif) => {
    const id = 'n' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
    const entry = { id, ...notif, timestamp: Date.now() };
    set((s) => ({ notifications: [...s.notifications, entry] }));
    // Auto-dismiss after `duration` ms (default 4s)
    const ms = notif.duration || 4000;
    setTimeout(() => {
      useUIStore.getState().dismissNotification(id);
    }, ms);
  },
  dismissNotification: (id) =>
    set((s) => ({ notifications: s.notifications.filter((n) => n.id !== id) })),
  dismissByType: (type) =>
    set((s) => ({ notifications: s.notifications.filter((n) => n.type !== type) })),

  // ── Dynamic Island ────────────────────────────
  setMessageIsland: (data) => set({ messageIsland: data }),
  clearMessageIsland: () => set({ messageIsland: null }),

  // ── Ghost Mode (Admin View-As-User) ────────────
  ghostMode: null,
  enterGhostMode: (userId, userName) => set({ ghostMode: { userId, userName } }),
  exitGhostMode: () => set({ ghostMode: null }),

  // ── Admin Teleport (Right-Click CheckIn) ────────
  pendingCheckInLocation: null,
  setPendingCheckInLocation: (loc) => set({ pendingCheckInLocation: loc }),
}));

export default useUIStore;
