import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import MeExperience from '../MeExperience';

const profile = {
  _id: 'me-1',
  name: '阿森',
  avatarUrl: '',
  profileVisitors: [{ _id: 'visit-1', visitorId: { _id: 'u-2', name: '小林' } }],
  checkinStreak: { current: 3 },
};

const footprints = [
  { _id: 'fp-1', placeName: '苏州河', message: '晚风', createdAt: '2026-07-13T09:00:00.000Z', photoUrl: '' },
  { _id: 'fp-2', placeName: '武康路', message: '树影', createdAt: '2026-07-12T09:00:00.000Z', photoUrl: '/photo.jpg' },
];

vi.mock('../../hooks/useProfileData', () => ({
  default: () => ({
    profile,
    footprints,
    loading: false,
    isOwnProfile: true,
    totalReactions: 4,
    activeDays: 2,
    editingName: false,
    setEditingName: vi.fn(),
    newName: '',
    setNewName: vi.fn(),
    savingProfile: false,
    uploadingBanner: false,
    bannerMsg: '',
    handleBannerUpload: vi.fn(),
    handleUpdateProfile: vi.fn(),
    handleSaveName: vi.fn(),
  }),
}));

describe('MeExperience', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows overview and owner-only memory controls', () => {
    render(<MeExperience onOpenSettings={vi.fn()} onOpenTimeline={vi.fn()} onOpenPhotoWall={vi.fn()} onSelectFootprint={vi.fn()} />);
    expect(screen.getByRole('heading', { name: '我的记忆' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '概览', selected: true })).toBeInTheDocument();
    expect(screen.getByText('最近访客')).toBeInTheDocument();
    expect(screen.getByText('小林')).toBeInTheDocument();
  });

  it('opens timeline and photo memories from tabs', async () => {
    const user = userEvent.setup();
    const onOpenTimeline = vi.fn();
    const onOpenPhotoWall = vi.fn();
    render(<MeExperience onOpenSettings={vi.fn()} onOpenTimeline={onOpenTimeline} onOpenPhotoWall={onOpenPhotoWall} onSelectFootprint={vi.fn()} />);

    await user.click(screen.getByRole('tab', { name: '时间线' }));
    await user.click(screen.getByRole('button', { name: '打开完整时间线' }));
    await user.click(screen.getByRole('tab', { name: '照片' }));
    await user.click(screen.getByRole('button', { name: '打开照片墙' }));

    expect(onOpenTimeline).toHaveBeenCalledOnce();
    expect(onOpenPhotoWall).toHaveBeenCalledOnce();
  });

  it('opens a footprint when a memory route stop is selected', async () => {
    const user = userEvent.setup();
    const onSelectFootprint = vi.fn();
    render(<MeExperience onOpenSettings={vi.fn()} onOpenTimeline={vi.fn()} onOpenPhotoWall={vi.fn()} onSelectFootprint={onSelectFootprint} />);
    await user.click(screen.getByRole('button', { name: '苏州河，晚风' }));
    expect(onSelectFootprint).toHaveBeenCalledWith('fp-1');
  });
});

