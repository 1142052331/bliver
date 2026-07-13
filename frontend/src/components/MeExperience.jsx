import { useMemo, useState } from 'react';
import { Camera, Clock3, MapPin, Settings2, Sparkles, UserRound } from 'lucide-react';
import useProfileData from '../hooks/useProfileData';

const TABS = [
  { id: 'overview', label: '概览' },
  { id: 'timeline', label: '时间线' },
  { id: 'photos', label: '照片' },
];

function Avatar({ profile }) {
  if (profile?.avatarUrl) return <img src={profile.avatarUrl} alt="" className="h-16 w-16 rounded-full object-cover ring-4 ring-white" />;
  return <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--color-forest)] text-2xl font-bold text-white ring-4 ring-white">{(profile?.name || '?')[0]}</div>;
}

function MemoryRoute({ footprints, onSelectFootprint }) {
  const stops = footprints.slice(0, 5);
  if (!stops.length) return <div className="rounded-2xl border border-dashed border-[var(--color-border)] bg-[var(--color-sage-soft)] p-5 text-sm text-[var(--color-muted-ink)]">还没有足迹。去地图留下第一段记忆。</div>;
  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-sage-soft)] p-4">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-[var(--color-forest)]"><MapPin size={16} aria-hidden="true" />最近的记忆路线</div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {stops.map((fp, index) => (
          <button type="button" key={fp._id} aria-label={`${fp.placeName || '未知地点'}，${fp.message || '足迹'}`} onClick={() => onSelectFootprint?.(fp._id)} className="min-w-[132px] rounded-xl border border-white bg-white px-3 py-3 text-left shadow-sm transition hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-[var(--color-forest)]">
            <span className="mb-2 block text-xs text-[var(--color-muted-ink)]">{String(index + 1).padStart(2, '0')}</span>
            <span className="block truncate text-sm font-semibold text-[var(--color-ink)]">{fp.placeName || '未知地点'}</span>
            <span className="mt-1 block truncate text-xs text-[var(--color-muted-ink)]">{fp.message || '留下一个瞬间'}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export default function MeExperience({ userId, onOpenSettings, onOpenTimeline, onOpenPhotoWall, onSelectFootprint, onClose, onLogout }) {
  const { profile, footprints, loading, isOwnProfile, totalReactions, activeDays } = useProfileData(userId);
  const [tab, setTab] = useState('overview');
  const photos = useMemo(() => footprints.filter((fp) => fp.photoUrl), [footprints]);

  if (loading) return <div className="flex h-full items-center justify-center p-6"><div className="w-full max-w-xl"><div className="h-24 animate-pulse rounded-3xl bg-[var(--color-sage-soft)]" /><div className="mt-4 h-48 animate-pulse rounded-2xl bg-[var(--color-sage-soft)]" /></div></div>;
  if (!profile) return <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center"><p className="text-[var(--color-muted-ink)]">暂时找不到这个资料。</p><button type="button" onClick={onClose} className="min-h-11 rounded-xl bg-[var(--color-forest)] px-4 text-sm font-semibold text-white">返回地图</button></div>;

  return (
    <section
      className="bliver-me-experience h-full overflow-y-auto bg-[var(--color-warm-paper)]"
      aria-label="我的个人空间"
      style={{
        '--color-forest': '#173B31',
        '--color-sage-soft': '#E5EEE9',
        '--color-warm-paper': '#FAF8F3',
        '--color-ink': '#1E2925',
        '--color-muted-ink': '#5D7068',
        '--color-border': '#D7E1DC',
        '--color-coral': '#C54B36',
        '--color-danger': '#B83B3B',
      }}
    >
      <div className="mx-auto max-w-2xl px-4 pb-28 pt-[max(20px,env(safe-area-inset-top))] md:px-8">
        <header className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3"><Avatar profile={profile} /><div><h1 className="text-xl font-bold text-[var(--color-ink)]">我的记忆</h1><p className="text-sm text-[var(--color-muted-ink)]">{profile.name}</p></div></div>
          <button type="button" onClick={onOpenSettings} aria-label="打开隐私设置" className="flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-[var(--color-border)] bg-white text-[var(--color-forest)] focus:outline-none focus:ring-2 focus:ring-[var(--color-forest)]"><Settings2 size={18} aria-hidden="true" /></button>
        </header>

        <div className="mt-5 grid grid-cols-3 gap-2 rounded-2xl border border-[var(--color-border)] bg-white p-3 text-center"><div><strong className="block text-lg text-[var(--color-ink)]">{footprints.length}</strong><span className="text-xs text-[var(--color-muted-ink)]">足迹</span></div><div><strong className="block text-lg text-[var(--color-ink)]">{totalReactions}</strong><span className="text-xs text-[var(--color-muted-ink)]">获赞</span></div><div><strong className="block text-lg text-[var(--color-ink)]">{activeDays}</strong><span className="text-xs text-[var(--color-muted-ink)]">活跃天数</span></div></div>

        <div className="mt-5 flex gap-1 rounded-2xl bg-[var(--color-sage-soft)] p-1" role="tablist" aria-label="个人记忆视图">
          {TABS.map((item) => <button key={item.id} type="button" role="tab" aria-selected={tab === item.id} onClick={() => setTab(item.id)} className={`min-h-11 flex-1 rounded-xl px-3 text-sm font-semibold transition ${tab === item.id ? 'bg-[var(--color-forest)] text-white shadow-sm' : 'text-[var(--color-muted-ink)]'}`}>{item.label}</button>)}
        </div>

        {tab === 'overview' && <div className="mt-5 space-y-4"><MemoryRoute footprints={footprints} onSelectFootprint={onSelectFootprint} />{isOwnProfile && profile.profileVisitors?.length > 0 && <div className="rounded-2xl border border-[var(--color-border)] bg-white p-4"><div className="mb-3 flex items-center gap-2 text-sm font-semibold text-[var(--color-ink)]"><UserRound size={16} aria-hidden="true" />最近访客</div><div className="flex flex-wrap gap-2">{profile.profileVisitors.slice(-5).reverse().map((item) => <span key={item._id} className="rounded-full bg-[var(--color-sage-soft)] px-3 py-2 text-xs text-[var(--color-forest)]">{item.visitorId?.name || '访客'}</span>)}</div></div>}<button type="button" onClick={onOpenSettings} className="flex min-h-12 w-full items-center justify-between rounded-2xl border border-[var(--color-border)] bg-white px-4 text-left text-sm font-semibold text-[var(--color-ink)]"><span>隐私与消息设置</span><Settings2 size={17} aria-hidden="true" /></button></div>}
        {tab === 'timeline' && <div className="mt-5 rounded-2xl border border-[var(--color-border)] bg-white p-5"><Clock3 size={22} className="text-[var(--color-forest)]" aria-hidden="true" /><h2 className="mt-3 text-lg font-bold text-[var(--color-ink)]">按时间回看足迹</h2><p className="mt-1 text-sm text-[var(--color-muted-ink)]">把每一次到达串成自己的城市记忆。</p><button type="button" onClick={onOpenTimeline} className="mt-4 min-h-11 rounded-xl bg-[var(--color-forest)] px-4 text-sm font-semibold text-white">打开完整时间线</button></div>}
        {tab === 'photos' && <div className="mt-5 rounded-2xl border border-[var(--color-border)] bg-white p-5"><Camera size={22} className="text-[var(--color-coral)]" aria-hidden="true" /><h2 className="mt-3 text-lg font-bold text-[var(--color-ink)]">照片记忆</h2><p className="mt-1 text-sm text-[var(--color-muted-ink)]">{photos.length ? `已保存 ${photos.length} 张照片。` : '给下一次打卡加一张照片。'}</p><button type="button" onClick={onOpenPhotoWall} className="mt-4 min-h-11 rounded-xl bg-[var(--color-forest)] px-4 text-sm font-semibold text-white"><Sparkles size={16} className="mr-2 inline" aria-hidden="true" />打开照片墙</button></div>}
        {onLogout && <button type="button" onClick={onLogout} className="mt-6 min-h-11 text-sm text-[var(--color-danger)]">退出登录</button>}
      </div>
    </section>
  );
}
