import { useMemo, useRef, useState } from 'react';
import {
  Camera, Check, Clock3, Hourglass, Loader2, LogOut, MapPin,
  MessageCircle, Pencil, RefreshCw, Settings2, Sparkles, UserPlus,
  UserRound, X,
} from 'lucide-react';
import useProfileData from '../hooks/useProfileData';
import useConversations from '../hooks/useConversations';
import { isSuperuser } from '../domain/superuser';
import MessageSettings from './MessageSettings';

const TABS = [
  { id: 'overview', label: '概览' },
  { id: 'timeline', label: '时间线' },
  { id: 'photos', label: '照片' },
];

function Avatar({ profile, editable, saving, onPick }) {
  return (
    <div className="relative shrink-0">
      {profile?.avatarUrl ? (
        <img
          src={profile.avatarUrl}
          alt=""
          className="h-20 w-20 rounded-full border-4 border-white object-cover shadow-sm"
          onError={(event) => { event.currentTarget.style.display = 'none'; }}
        />
      ) : (
        <div className="flex h-20 w-20 items-center justify-center rounded-full border-4 border-white bg-[var(--color-forest)] text-3xl font-bold text-white shadow-sm">
          {(profile?.name || '?')[0]}
        </div>
      )}
      {editable && (
        <button
          type="button"
          aria-label="更换头像"
          onClick={onPick}
          disabled={saving}
          className="absolute -bottom-1 -right-1 flex h-11 w-11 items-center justify-center rounded-full border-2 border-white bg-[var(--color-coral)] text-white shadow-sm disabled:opacity-60"
        >
          {saving ? <Loader2 size={17} className="animate-spin" aria-hidden="true" /> : <Camera size={17} aria-hidden="true" />}
        </button>
      )}
    </div>
  );
}

function MemoryRoute({ footprints, onSelectFootprint }) {
  const stops = footprints.slice(0, 5);
  if (!stops.length) {
    return <div className="border-y border-dashed border-[var(--color-border)] py-8 text-sm text-[var(--color-muted-ink)]">还没有足迹。去地图留下第一段记忆。</div>;
  }
  return (
    <div>
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-[var(--color-forest)]"><MapPin size={16} aria-hidden="true" />最近的记忆路线</div>
      <div className="flex gap-2 overflow-x-auto pb-2">
        {stops.map((footprint, index) => (
          <button
            type="button"
            key={footprint._id}
            aria-label={`${footprint.placeName || '未知地点'}，${footprint.message || '足迹'}`}
            onClick={() => onSelectFootprint?.(footprint._id)}
            className="min-h-24 min-w-[140px] rounded-lg border border-[var(--color-border)] bg-white px-3 py-3 text-left shadow-sm transition hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-[var(--color-forest)]"
          >
            <span className="mb-2 block text-xs text-[var(--color-muted-ink)]">{String(index + 1).padStart(2, '0')}</span>
            <span className="block truncate text-sm font-semibold text-[var(--color-ink)]">{footprint.placeName || '未知地点'}</span>
            <span className="mt-1 block truncate text-xs text-[var(--color-muted-ink)]">{footprint.message || '留下一个瞬间'}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function RelationshipActions({
  userId, profile, friendshipStatus, pendingRequestId,
  onSendFriendRequest, onAcceptRequest, onRejectRequest, onOpenChat,
}) {
  const status = friendshipStatus?.(userId) || 'none';
  const canChat = status === 'accepted' || isSuperuser(profile);

  if (canChat) {
    return <button type="button" aria-label="发送私信" onClick={() => onOpenChat?.(userId)} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-[var(--color-forest)] px-4 text-sm font-semibold text-white"><MessageCircle size={17} aria-hidden="true" />发送私信</button>;
  }
  if (status === 'pending_in' && pendingRequestId) {
    return (
      <div className="grid grid-cols-2 gap-2">
        <button type="button" aria-label="同意申请" onClick={() => onAcceptRequest?.(pendingRequestId)} className="flex min-h-11 items-center justify-center gap-2 rounded-lg bg-[var(--color-forest)] px-3 text-sm font-semibold text-white"><Check size={17} aria-hidden="true" />同意</button>
        <button type="button" aria-label="拒绝申请" onClick={() => onRejectRequest?.(pendingRequestId)} className="flex min-h-11 items-center justify-center gap-2 rounded-lg border border-[var(--color-border)] bg-white px-3 text-sm font-semibold text-[var(--color-muted-ink)]"><X size={17} aria-hidden="true" />拒绝</button>
      </div>
    );
  }
  if (status === 'pending_out') {
    return <div className="flex min-h-11 items-center justify-center gap-2 rounded-lg border border-[var(--color-border)] bg-white px-4 text-sm text-[var(--color-muted-ink)]"><Hourglass size={17} aria-hidden="true" />等待对方通过</div>;
  }
  if (status === 'none') {
    return <button type="button" aria-label="申请加为好友" onClick={() => onSendFriendRequest?.(userId)} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-[var(--color-forest)] bg-white px-4 text-sm font-semibold text-[var(--color-forest)]"><UserPlus size={17} aria-hidden="true" />申请加为好友</button>;
  }
  return null;
}

function LoadingState() {
  return <div className="mx-auto w-full max-w-2xl animate-pulse px-4 py-8"><div className="h-40 rounded-lg bg-[var(--color-sage-soft)]" /><div className="mt-5 h-48 rounded-lg bg-[var(--color-sage-soft)]" /></div>;
}

export default function ProfileExperience({
  userId,
  onOpenSettings,
  onOpenTimeline,
  onOpenPhotoWall,
  onSelectFootprint,
  onClose,
  onLogout,
  friendshipStatus,
  pendingRequestId,
  onSendFriendRequest,
  onAcceptRequest,
  onRejectRequest,
  onOpenChat,
}) {
  const data = useProfileData(userId);
  const {
    profile, footprints, loading, refreshing, error, refetch, isOwnProfile,
    totalReactions, activeDays, editingName, setEditingName, newName, setNewName,
    savingProfile, uploadingBanner, bannerMsg, handleBannerUpload,
    handleUpdateProfile, handleSaveName,
  } = data;
  const { settings, updateSettings } = useConversations({ enabled: Boolean(isOwnProfile) });
  const [tab, setTab] = useState('overview');
  const bannerInputRef = useRef(null);
  const avatarInputRef = useRef(null);
  const photos = useMemo(() => footprints.filter((footprint) => footprint.photoUrl), [footprints]);

  if (loading && !profile) return <LoadingState />;
  if (!profile) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-[var(--color-muted-ink)]">{error ? '资料暂时无法加载。' : '暂时找不到这个资料。'}</p>
        {error && <button type="button" onClick={() => refetch?.()} className="min-h-11 rounded-lg bg-[var(--color-forest)] px-4 text-sm font-semibold text-white">重新加载资料</button>}
        {onClose && <button type="button" onClick={onClose} className="min-h-11 px-4 text-sm font-semibold text-[var(--color-forest)]">返回地图</button>}
      </div>
    );
  }

  return (
    <section
      className="bliver-profile-experience h-full overflow-y-auto bg-[var(--color-warm-paper)]"
      aria-label={isOwnProfile ? '我的个人空间' : `${profile.name}的个人空间`}
      style={{
        '--color-forest': '#173B31', '--color-sage-soft': '#E5EEE9', '--color-warm-paper': '#FAF8F3',
        '--color-ink': '#1E2925', '--color-muted-ink': '#5D7068', '--color-border': '#D7E1DC',
        '--color-coral': '#C54B36', '--color-danger': '#B83B3B',
      }}
    >
      <div className="mx-auto max-w-2xl pb-28">
        <div className="relative h-32 overflow-hidden bg-[var(--color-sage-soft)]">
          {profile.profileBannerUrl && <img src={profile.profileBannerUrl} alt="" className="h-full w-full object-cover" />}
          <div className="absolute inset-0 bg-gradient-to-t from-black/25 to-transparent" />
          <div className="absolute right-3 top-[max(12px,env(safe-area-inset-top))] flex gap-2">
            {isOwnProfile && (
              <>
                <input ref={bannerInputRef} type="file" accept="image/*" className="hidden" onChange={(event) => handleBannerUpload(event.target.files?.[0])} />
                <button type="button" aria-label="更换背景" onClick={() => bannerInputRef.current?.click()} disabled={uploadingBanner} className="flex h-11 w-11 items-center justify-center rounded-full bg-black/35 text-white backdrop-blur-sm disabled:opacity-60">
                  {uploadingBanner ? <Loader2 size={18} className="animate-spin" aria-hidden="true" /> : <Camera size={18} aria-hidden="true" />}
                </button>
              </>
            )}
            {onClose && <button type="button" aria-label="关闭个人空间" onClick={onClose} className="flex h-11 w-11 items-center justify-center rounded-full bg-black/35 text-white backdrop-blur-sm"><X size={20} aria-hidden="true" /></button>}
          </div>
        </div>

        <div className="px-4 md:px-8">
          <header className="-mt-9 flex items-end justify-between gap-4">
            <div className="flex min-w-0 items-end gap-3">
              <input ref={avatarInputRef} type="file" accept="image/*" className="hidden" onChange={(event) => handleUpdateProfile({ avatar: event.target.files?.[0] })} />
              <Avatar profile={profile} editable={isOwnProfile} saving={savingProfile} onPick={() => avatarInputRef.current?.click()} />
              <div className="min-w-0 pb-1">
                {editingName ? (
                  <div className="flex items-center gap-1">
                    <input autoFocus value={newName} onChange={(event) => setNewName(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') handleSaveName(); if (event.key === 'Escape') setEditingName(false); }} aria-label="用户名" className="min-h-11 min-w-0 rounded-lg border border-[var(--color-border)] bg-white px-3 text-base font-semibold text-[var(--color-ink)]" />
                    <button type="button" aria-label="保存用户名" onClick={handleSaveName} className="flex h-11 w-11 items-center justify-center text-[var(--color-forest)]"><Check size={19} aria-hidden="true" /></button>
                  </div>
                ) : (
                  <div className="flex items-center gap-1">
                    <h1 className="truncate text-xl font-bold text-[var(--color-ink)]">{isOwnProfile ? '我的记忆' : profile.name}</h1>
                    {isOwnProfile && <button type="button" aria-label="修改用户名" onClick={() => { setNewName(profile.name); setEditingName(true); }} className="flex h-11 w-11 items-center justify-center text-[var(--color-muted-ink)]"><Pencil size={16} aria-hidden="true" /></button>}
                  </div>
                )}
                {isOwnProfile && <p className="truncate text-sm text-[var(--color-muted-ink)]">{profile.name}</p>}
              </div>
            </div>
            {isOwnProfile && <button type="button" onClick={onOpenSettings} aria-label="打开隐私设置" className="mb-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-[var(--color-border)] bg-white text-[var(--color-forest)]"><Settings2 size={18} aria-hidden="true" /></button>}
          </header>

          {bannerMsg && <p className="mt-3 text-sm font-semibold text-[var(--color-forest)]" role="status">{bannerMsg}</p>}
          {error && <div className="mt-3 flex items-center justify-between gap-3 border-y border-[var(--color-border)] py-3 text-sm text-[var(--color-muted-ink)]"><span>资料暂时无法更新，正在显示已缓存内容。</span><button type="button" aria-label="重新加载资料" onClick={() => refetch?.()} className="flex h-11 w-11 shrink-0 items-center justify-center text-[var(--color-forest)]"><RefreshCw size={17} aria-hidden="true" /></button></div>}
          {refreshing && !error && <p className="mt-3 text-xs text-[var(--color-muted-ink)]" aria-live="polite">正在更新资料</p>}

          <div className="mt-5 grid grid-cols-3 border-y border-[var(--color-border)] py-4 text-center">
            <div><strong className="block text-lg text-[var(--color-ink)]">{footprints.length}</strong><span className="text-xs text-[var(--color-muted-ink)]">足迹</span></div>
            <div><strong className="block text-lg text-[var(--color-ink)]">{totalReactions}</strong><span className="text-xs text-[var(--color-muted-ink)]">获赞</span></div>
            <div><strong className="block text-lg text-[var(--color-ink)]">{activeDays}</strong><span className="text-xs text-[var(--color-muted-ink)]">活跃天数</span></div>
          </div>

          {!isOwnProfile && <div className="mt-4"><RelationshipActions userId={userId} profile={profile} friendshipStatus={friendshipStatus} pendingRequestId={pendingRequestId} onSendFriendRequest={onSendFriendRequest} onAcceptRequest={onAcceptRequest} onRejectRequest={onRejectRequest} onOpenChat={onOpenChat} /></div>}

          <div className="mt-5 flex gap-1 rounded-lg bg-[var(--color-sage-soft)] p-1" role="tablist" aria-label="个人记忆视图">
            {TABS.map((item) => <button key={item.id} type="button" role="tab" aria-selected={tab === item.id} onClick={() => setTab(item.id)} className={`min-h-11 flex-1 rounded-md px-3 text-sm font-semibold transition ${tab === item.id ? 'bg-[var(--color-forest)] text-white shadow-sm' : 'text-[var(--color-muted-ink)]'}`}>{item.label}</button>)}
          </div>

          {tab === 'overview' && (
            <div className="mt-6 space-y-6">
              <MemoryRoute footprints={footprints} onSelectFootprint={onSelectFootprint} />
              {isOwnProfile && profile.profileVisitors?.length > 0 && <div><div className="mb-3 flex items-center gap-2 text-sm font-semibold text-[var(--color-ink)]"><UserRound size={16} aria-hidden="true" />最近访客</div><div className="flex flex-wrap gap-2">{profile.profileVisitors.slice(-5).reverse().map((item) => <span key={item._id} className="rounded-full bg-[var(--color-sage-soft)] px-3 py-2 text-xs text-[var(--color-forest)]">{item.visitorId?.name || '访客'}</span>)}</div></div>}
              {isOwnProfile && <MessageSettings value={settings?.allowStrangerMessages} disabled={updateSettings.isPending} onChange={(value) => updateSettings.mutateAsync(value)} />}
            </div>
          )}
          {tab === 'timeline' && <div className="mt-6 border-y border-[var(--color-border)] py-6"><Clock3 size={22} className="text-[var(--color-forest)]" aria-hidden="true" /><h2 className="mt-3 text-lg font-bold text-[var(--color-ink)]">按时间回看足迹</h2><p className="mt-1 text-sm text-[var(--color-muted-ink)]">把每一次到达串成城市记忆。</p><button type="button" onClick={onOpenTimeline} className="mt-4 min-h-11 rounded-lg bg-[var(--color-forest)] px-4 text-sm font-semibold text-white">打开完整时间线</button></div>}
          {tab === 'photos' && <div className="mt-6 border-y border-[var(--color-border)] py-6"><Camera size={22} className="text-[var(--color-coral)]" aria-hidden="true" /><h2 className="mt-3 text-lg font-bold text-[var(--color-ink)]">照片记忆</h2><p className="mt-1 text-sm text-[var(--color-muted-ink)]">{photos.length ? `已保存 ${photos.length} 张照片。` : '给下一次打卡加一张照片。'}</p><button type="button" onClick={onOpenPhotoWall} className="mt-4 min-h-11 rounded-lg bg-[var(--color-forest)] px-4 text-sm font-semibold text-white"><Sparkles size={16} className="mr-2 inline" aria-hidden="true" />打开照片墙</button></div>}

          {isOwnProfile && onLogout && <button type="button" aria-label="退出登录" onClick={onLogout} className="mt-7 flex min-h-11 items-center gap-2 text-sm font-semibold text-[var(--color-danger)]"><LogOut size={17} aria-hidden="true" />退出登录</button>}
        </div>
      </div>
    </section>
  );
}
