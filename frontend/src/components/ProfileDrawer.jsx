import { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { X, Camera, Loader2, Pencil, Check, MessageCircle, Clock, UserPlus, MapPin } from 'lucide-react';
import useProfileData from '../hooks/useProfileData';
import ProfileSkeleton from './ProfileSkeleton';
import ProfileStats from './ProfileStats';
import ProfileVisitors from './ProfileVisitors';
import FootprintCardList from './FootprintCardList';
import { isSuperuser } from '../domain/superuser';

export default function ProfileDrawer({ userId, onClose, onLogout, friendshipStatus, pendingRequestId, onSendFriendRequest, onAcceptRequest, onRejectRequest, onOpenChat, onSelectFootprint }) {
  const {
    profile,
    footprints,
    loading,
    uploadingBanner, bannerMsg,
    editingName, setEditingName,
    newName, setNewName,
    savingProfile,
    isOwnProfile,
    totalReactions, activeDays,
    handleBannerUpload,
    handleUpdateProfile,
    handleSaveName,
  } = useProfileData(userId);

  const bannerFileRef = useRef(null);
  const avatarFileRef = useRef(null);

  // ── Render ─────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-[2500] pointer-events-none">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="absolute inset-0 bg-black/40 backdrop-blur-sm pointer-events-auto"
        onClick={onClose}
      />

      <motion.div
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'spring', stiffness: 300, damping: 30, mass: 1 }}
        style={{ right: `max(0px, env(safe-area-inset-right))` }}
        className="absolute top-0 h-full w-full md:w-96 bg-black/40 backdrop-blur-lg border-l border-white/10 shadow-xl
          flex flex-col pointer-events-auto"
      >
        {loading ? (
          <ProfileSkeleton />
        ) : !profile ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-gray-400">用户不存在</p>
          </div>
        ) : (
          <>
            {/* ── Banner Header ──────────────────────────── */}
            <div className="relative flex-shrink-0">
              <div
                className="absolute inset-0 bg-gradient-to-r from-blue-400 to-indigo-500 bg-cover bg-center"
                style={profile.profileBannerUrl ? { backgroundImage: `url(${profile.profileBannerUrl})` } : undefined}
              />
              <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-black/50 to-black/80" />

              <div className="relative z-10">
                {/* Banner top bar */}
                <div className="relative h-28">
                  <div className="absolute top-3 right-3 flex items-center gap-2">
                    {isOwnProfile && (
                      <>
                        <input type="file" accept="image/*" ref={bannerFileRef} onChange={(e) => handleBannerUpload(e.target.files?.[0])} className="hidden" />
                        <button
                          onClick={() => bannerFileRef.current?.click()}
                          disabled={uploadingBanner}
                          className="p-2 bg-white/20 hover:bg-white/30 backdrop-blur-md rounded-full text-white transition-colors disabled:opacity-50"
                          title="更换背景"
                        >
                          {uploadingBanner ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
                        </button>
                      </>
                    )}
                    <button onClick={onClose} className="p-2 bg-white/20 hover:bg-white/30 backdrop-blur-md rounded-full text-white transition-colors">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  {bannerMsg && (
                    <div className="absolute bottom-3 left-1/2 -translate-x-1/2 px-3 py-1.5 bg-black/50 backdrop-blur-sm text-white text-xs rounded-full">
                      {bannerMsg}
                    </div>
                  )}
                </div>

                {/* Avatar */}
                <div className="relative px-5 h-10">
                  <div className="absolute -top-10">
                    {profile.avatarUrl ? (
                      <img src={profile.avatarUrl} className="w-20 h-20 rounded-full object-cover border-4 border-white/30 shadow-lg" alt="" onError={(e) => { e.target.style.display = 'none'; }} loading="lazy" />
                    ) : (
                      <div className="w-20 h-20 rounded-full bg-blue-500 flex items-center justify-center text-white text-3xl font-bold border-4 border-white/30 shadow-lg">
                        {(profile.name || '?')[0].toUpperCase()}
                      </div>
                    )}
                    {isOwnProfile && (
                      <>
                        <input type="file" accept="image/*" ref={avatarFileRef} onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleUpdateProfile({ avatar: file });
                        }} className="hidden" />
                        <button
                          onClick={() => avatarFileRef.current?.click()}
                          disabled={savingProfile}
                          className="absolute bottom-0 right-0 p-1.5 bg-white/90 hover:bg-white rounded-full shadow-md transition-colors disabled:opacity-50"
                          title="更换头像"
                        >
                          <Camera className="w-3 h-3 text-gray-300" />
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* Name */}
                <div className="px-5 pt-2 pb-3">
                  {editingName ? (
                    <div className="flex items-center gap-1.5">
                      <input
                        autoFocus
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleSaveName();
                          if (e.key === 'Escape') setEditingName(false);
                        }}
                        className="bg-white/20 backdrop-blur-sm text-white text-lg font-bold rounded-lg px-3 py-1 outline-none border border-white/30 focus:border-white/50 w-36 placeholder:text-white/30"
                        placeholder={profile.name}
                      />
                      <button onClick={handleSaveName} disabled={savingProfile} className="p-1 text-emerald-300 hover:text-emerald-200 transition-colors disabled:opacity-50">
                        <Check className="w-4 h-4" />
                      </button>
                      <button onClick={() => setEditingName(false)} className="p-1 text-white/40 hover:text-white/70 transition-colors">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <h2 className="text-lg font-bold text-white drop-shadow-md">{profile.name}</h2>
                      {isOwnProfile && (
                        <button onClick={() => { setNewName(profile.name); setEditingName(true); }} className="p-0.5 text-white/40 hover:text-white/80 transition-colors" title="修改名字">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* Stats */}
                <ProfileStats
                  footprintCount={footprints.length}
                  totalReactions={totalReactions}
                  activeDays={activeDays}
                  streak={profile.checkinStreak?.current || 0}
                />

                {/* Visitors */}
                <ProfileVisitors visitors={profile.profileVisitors} />

                {/* Friend action button (only on others' profiles) */}
                {!isOwnProfile && (() => {
                  const status = friendshipStatus ? friendshipStatus(userId) : 'none';
                  const isAsen = isSuperuser(profile);
                  const showChat = status === 'accepted' || isAsen;
                  const showPending = status === 'pending_out' || status === 'pending_in';
                  const hasIncoming = status === 'pending_in';
                  const canSendRequest = status === 'none';

                  if (showChat) {
                    return (
                      <div className="px-5 pt-2 pb-1">
                        <button
                          onClick={() => onOpenChat?.(userId)}
                          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl
                            bg-cyan-600/20 text-cyan-400 border border-cyan-500/30
                            hover:bg-cyan-600/40 backdrop-blur-md
                            transition-all duration-200 text-sm font-semibold
                            shadow-[0_0_20px_rgba(6,182,212,0.15)]"
                          style={{ fontFamily: 'var(--font-body)' }}
                        >
                          <MessageCircle className="w-4 h-4" />
                          发送私信
                        </button>
                      </div>
                    );
                  }

                  if (showPending) {
                    return (
                      <div className="px-5 pt-2 pb-1 space-y-2">
                        {hasIncoming && pendingRequestId ? (
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => onAcceptRequest?.(pendingRequestId)}
                              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl
                                bg-cyan-600/20 text-cyan-400 border border-cyan-500/30
                                hover:bg-cyan-600/40 backdrop-blur-md
                                transition-all duration-200 text-sm font-semibold"
                              style={{ fontFamily: 'var(--font-body)' }}
                            >
                              <Check className="w-4 h-4" />
                              同意申请
                            </button>
                            <button
                              onClick={() => onRejectRequest?.(pendingRequestId)}
                              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl
                                bg-white/5 text-white/40 border border-white/[0.06]
                                hover:bg-white/10 hover:text-white/60 backdrop-blur-md
                                transition-all duration-200 text-sm"
                              style={{ fontFamily: 'var(--font-body)' }}
                            >
                              <X className="w-4 h-4" />
                              拒绝
                            </button>
                          </div>
                        ) : (
                          <div className="w-full flex items-center justify-center gap-2 py-3 rounded-xl
                            bg-white/5 border border-white/[0.06]
                            opacity-50 cursor-not-allowed text-sm text-white/30"
                            style={{ fontFamily: 'var(--font-body)' }}
                          >
                            <Clock className="w-4 h-4" />
                            等待对方通过
                          </div>
                        )}
                      </div>
                    );
                  }

                  if (canSendRequest) {
                    return (
                      <div className="px-5 pt-2 pb-1">
                        <button
                          onClick={() => onSendFriendRequest?.(userId)}
                          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl
                            bg-white/10 hover:bg-white/20 backdrop-blur-md
                            border border-white/10
                            text-white/80 hover:text-white
                            transition-all duration-200 text-sm font-semibold"
                          style={{ fontFamily: 'var(--font-body)' }}
                        >
                          <UserPlus className="w-4 h-4" />
                          申请加为好友
                        </button>
                      </div>
                    );
                  }

                  return null;
                })()}

              </div>
            </div>

            {/* ── Footprint List ──────────────────────────── */}
            <div className="flex-1 overflow-y-auto">
              <FootprintCardList
                footprints={footprints}
                userId={userId}
                isAdmin={false}
                onSelect={onSelectFootprint}
              />
              {footprints.length === 0 && (
                <p className="text-center text-white/20 text-sm py-8">还没有足迹</p>
              )}
            </div>

            {/* ── Action footer ──────────────────────────── */}
            <div className="flex-shrink-0 px-5 py-3 space-y-2">
              {isOwnProfile && (
                <button onClick={onLogout} className="w-full py-3 rounded-xl text-sm font-medium text-red-300 hover:text-red-200 hover:bg-white/5 transition-colors"
                  style={{ fontFamily: 'var(--font-body)' }}>
                  退出登录
                </button>
              )}
            </div>
          </>
        )}
      </motion.div>
    </div>
  );
}
