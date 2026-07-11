import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';

// ── Types ───────────────────────────────────────────

export interface PendingLocation {
  lat: number;
  lng: number;
}

export interface Toast {
  type: string;
  content: string;
  duration?: number;
}

interface ToastEntry extends Toast {
  id: string;
  timestamp: number;
}

interface MessageIslandData {
  senderId?: string;
  senderName?: string;
  content?: string;
  footprintId?: string;
  [key: string]: unknown;
}

interface ClusterPayload {
  footprints: Array<{ _id: string }>;
  [key: string]: unknown;
}

// ── Store ───────────────────────────────────────────

interface UIStore {
  // Modal / Drawer toggles
  showCheckIn: boolean;
  showTimeline: boolean;
  showNotifs: boolean;
  showAdmin: boolean;
  showAuth: boolean;
  showPhotoWall: boolean;
  showAbout: boolean;
  showFeedback: boolean;
  showAnnouncements: boolean;
  showFriends: boolean;

  // Auth modal helpers
  authTab: string;
  authMessage: string;

  // Map interaction
  activeFootprintId: string | null;
  mapPreviewId: string | null;
  flyArrivedFp: unknown;
  timelineTargetFpId: string | null;
  clusterData: ClusterPayload | null;
  samePlaceIds: string[];
  shareTarget: string | null;

  // Chat / Profile
  chatUserId: string | null;
  viewingProfileId: string | null;

  // Floating toasts
  toasts: ToastEntry[];

  // Dynamic Island
  messageIsland: MessageIslandData | null;

  // Admin Teleport
  pendingCheckInLocation: PendingLocation | null;

  // Real-time event bus (replaces window CustomEvent)
  markReadVersion: number;
  footprintEvent: {
    type: 'new' | 'updated' | 'deleted';
    footprint?: any;
    footprintId?: string;
  } | null;
  footprintEventId: number;
  profileEvent: { userId: string; user: any } | null;
  profileEventId: number;
  viewedFootprintId: string | null;

  // ── Actions ──
  openCheckIn: () => void;
  closeCheckIn: () => void;
  openTimeline: () => void;
  closeTimeline: () => void;
  toggleNotifs: () => void;
  closeNotifs: () => void;
  openAdmin: () => void;
  closeAdmin: () => void;
  openAuth: (tab?: string, message?: string) => void;
  closeAuth: () => void;
  openPhotoWall: () => void;
  closePhotoWall: () => void;
  openAbout: () => void;
  closeAbout: () => void;
  openFeedback: () => void;
  closeFeedback: () => void;
  openAnnouncements: () => void;
  closeAnnouncements: () => void;
  openFriends: () => void;
  closeFriends: () => void;

  setActiveFootprintId: (id: string | null) => void;
  setMapPreviewId: (id: string | null) => void;
  setFlyArrivedFp: (fp: unknown) => void;
  setTimelineTargetFpId: (id: string | null) => void;
  setClusterData: (data: ClusterPayload | null) => void;
  openSamePlace: (ids: string[]) => void;
  closeSamePlace: () => void;
  setShareTarget: (id: string | null) => void;

  openChat: (uid: string) => void;
  closeChat: () => void;
  openProfile: (uid: string) => void;
  closeProfile: () => void;

  setAuthTab: (tab: string) => void;
  setAuthMessage: (msg: string) => void;

  addToast: (toast: Toast) => void;
  dismissToast: (id: string) => void;
  dismissToastByType: (type: string) => void;

  setMessageIsland: (data: MessageIslandData | null) => void;
  clearMessageIsland: () => void;

  setPendingCheckInLocation: (loc: PendingLocation | null) => void;

  incrementMarkReadVersion: () => void;
  emitFootprintEvent: (event: {
    type: 'new' | 'updated' | 'deleted';
    footprint?: any;
    footprintId?: string;
  }) => void;
  emitProfileEvent: (event: { userId: string; user: any }) => void;
  setViewedFootprintId: (id: string | null) => void;
}

const useUIStore = create<UIStore>()(
  subscribeWithSelector((set) => ({
  // ── Modal / Drawer toggles ──────────────────────
  showCheckIn: false,
  showTimeline: false,
  showNotifs: false,
  showAdmin: false,
  showAuth: false,
  showPhotoWall: false,
  showAbout: false,
  showFeedback: false,
  showAnnouncements: false,
  showFriends: false,

  authTab: 'login',
  authMessage: '',

  activeFootprintId: null,
  mapPreviewId: null,
  flyArrivedFp: null,
  timelineTargetFpId: null,
  clusterData: null,
  samePlaceIds: [],
  shareTarget: null,

  chatUserId: null,
  viewingProfileId: null,

  toasts: [],

  messageIsland: null,

  pendingCheckInLocation: null,

  markReadVersion: 0,
  footprintEvent: null,
  footprintEventId: 0,
  profileEvent: null,
  profileEventId: 0,
  viewedFootprintId: null,

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
  openFeedback: () => set({ showFeedback: true }),
  closeFeedback: () => set({ showFeedback: false }),
  openAnnouncements: () => set({ showAnnouncements: true }),
  closeAnnouncements: () => set({ showAnnouncements: false }),
  openFriends: () => set({ showFriends: true }),
  closeFriends: () => set({ showFriends: false }),

  setActiveFootprintId: (id) => set({ activeFootprintId: id }),
  setMapPreviewId: (id) => set({ mapPreviewId: id }),
  setFlyArrivedFp: (fp) => set({ flyArrivedFp: fp }),
  setTimelineTargetFpId: (id) => set({ timelineTargetFpId: id }),
  setClusterData: (data) => set({ clusterData: data }),
  openSamePlace: (ids) => set({ samePlaceIds: [...new Set(ids)] }),
  closeSamePlace: () => set({ samePlaceIds: [] }),
  setShareTarget: (id) => set({ shareTarget: id }),

  openChat: (uid) => set({ chatUserId: uid }),
  closeChat: () => set({ chatUserId: null }),
  openProfile: (uid) => set({ viewingProfileId: uid }),
  closeProfile: () => set({ viewingProfileId: null }),

  setAuthTab: (tab) => set({ authTab: tab }),
  setAuthMessage: (msg) => set({ authMessage: msg }),

  addToast: (toast) => {
    const id = 't' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
    const entry: ToastEntry = { id, ...toast, timestamp: Date.now() };
    set((s) => ({ toasts: [...s.toasts, entry] }));
    const ms = toast.duration || 4000;
    setTimeout(() => {
      useUIStore.getState().dismissToast(id);
    }, ms);
  },
  dismissToast: (id) =>
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  dismissToastByType: (type) =>
    set((s) => ({ toasts: s.toasts.filter((t) => t.type !== type) })),

  setMessageIsland: (data) => set({ messageIsland: data }),
  clearMessageIsland: () => set({ messageIsland: null }),

  setPendingCheckInLocation: (loc) => set({ pendingCheckInLocation: loc }),

  incrementMarkReadVersion: () => set((s) => ({ markReadVersion: s.markReadVersion + 1 })),
  emitFootprintEvent: (event) =>
    set((s) => ({ footprintEvent: event, footprintEventId: s.footprintEventId + 1 })),
  emitProfileEvent: (event) =>
    set((s) => ({ profileEvent: event, profileEventId: s.profileEventId + 1 })),
  setViewedFootprintId: (id) => set({ viewedFootprintId: id }),
})));

export default useUIStore;
