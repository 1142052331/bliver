import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ProfileExperience from '../ProfileExperience';

const profile = {
  _id: 'owner-1',
  name: '阿森',
  avatarUrl: '',
  profileVisitors: [{ _id: 'visit-1', visitorId: { _id: 'friend-1', name: '小林' } }],
};

const footprints = [
  { _id: 'fp-1', placeName: '苏州河', message: '晚风', createdAt: '2026-07-13T09:00:00.000Z', photoUrl: '' },
  { _id: 'fp-2', placeName: '武康路', message: '树影', createdAt: '2026-07-12T09:00:00.000Z', photoUrl: '/photo.jpg' },
];

let profileData;

vi.mock('../../hooks/useProfileData', () => ({
  default: () => profileData,
}));

vi.mock('../../hooks/useConversations', () => ({
  default: () => ({
    settings: { allowStrangerMessages: false },
    updateSettings: { isPending: false, mutateAsync: vi.fn() },
  }),
}));

function baseProfileData(overrides = {}) {
  return {
    profile,
    footprints,
    loading: false,
    refreshing: false,
    error: null,
    refetch: vi.fn(),
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
    ...overrides,
  };
}

describe('ProfileExperience', () => {
  beforeEach(() => {
    profileData = baseProfileData();
    vi.clearAllMocks();
  });

  it('shows owner controls without visitor relationship actions', () => {
    render(
      <ProfileExperience
        userId="owner-1"
        onOpenSettings={vi.fn()}
        onLogout={vi.fn()}
      />,
    );

    expect(screen.getByRole('heading', { name: '我的记忆' })).toBeVisible();
    expect(screen.getByRole('button', { name: '打开隐私设置' })).toBeVisible();
    expect(screen.getByRole('button', { name: '退出登录' })).toBeVisible();
    expect(screen.queryByRole('button', { name: '发送私信' })).not.toBeInTheDocument();
    expect(screen.getByText('最近访客')).toBeVisible();
  });

  it('shows chat for an accepted friend without owner controls', async () => {
    profileData = baseProfileData({
      profile: { ...profile, _id: 'friend-1', name: '小林', profileVisitors: undefined },
      isOwnProfile: false,
    });
    const onOpenChat = vi.fn();
    const user = userEvent.setup();

    render(
      <ProfileExperience
        userId="friend-1"
        friendshipStatus={() => 'accepted'}
        onOpenChat={onOpenChat}
      />,
    );

    await user.click(screen.getByRole('button', { name: '发送私信' }));
    expect(onOpenChat).toHaveBeenCalledWith('friend-1');
    expect(screen.queryByRole('button', { name: '退出登录' })).not.toBeInTheDocument();
    expect(screen.queryByText('最近访客')).not.toBeInTheDocument();
  });

  it('shows accept and reject controls for an incoming request', async () => {
    profileData = baseProfileData({
      profile: { ...profile, _id: 'visitor-1', name: '访客' },
      isOwnProfile: false,
    });
    const onAcceptRequest = vi.fn();
    const onRejectRequest = vi.fn();
    const user = userEvent.setup();

    render(
      <ProfileExperience
        userId="visitor-1"
        friendshipStatus={() => 'pending_in'}
        pendingRequestId="request-1"
        onAcceptRequest={onAcceptRequest}
        onRejectRequest={onRejectRequest}
      />,
    );

    await user.click(screen.getByRole('button', { name: '同意申请' }));
    await user.click(screen.getByRole('button', { name: '拒绝申请' }));
    expect(onAcceptRequest).toHaveBeenCalledWith('request-1');
    expect(onRejectRequest).toHaveBeenCalledWith('request-1');
  });

  it('opens timeline, photos, and selected footprints from shared tabs', async () => {
    const user = userEvent.setup();
    const onOpenTimeline = vi.fn();
    const onOpenPhotoWall = vi.fn();
    const onSelectFootprint = vi.fn();
    render(
      <ProfileExperience
        userId="owner-1"
        onOpenTimeline={onOpenTimeline}
        onOpenPhotoWall={onOpenPhotoWall}
        onSelectFootprint={onSelectFootprint}
      />,
    );

    await user.click(screen.getByRole('button', { name: '苏州河，晚风' }));
    await user.click(screen.getByRole('tab', { name: '时间线' }));
    await user.click(screen.getByRole('button', { name: '打开完整时间线' }));
    await user.click(screen.getByRole('tab', { name: '照片' }));
    await user.click(screen.getByRole('button', { name: '打开照片墙' }));

    expect(onSelectFootprint).toHaveBeenCalledWith('fp-1');
    expect(onOpenTimeline).toHaveBeenCalledOnce();
    expect(onOpenPhotoWall).toHaveBeenCalledOnce();
  });

  it('keeps cached content visible when a background refresh fails', () => {
    profileData = baseProfileData({ refreshing: false, error: new Error('offline') });
    render(<ProfileExperience userId="owner-1" />);

    expect(screen.getByRole('heading', { name: '我的记忆' })).toBeVisible();
    expect(screen.getByText('资料暂时无法更新，正在显示已缓存内容。')).toBeVisible();
    expect(screen.getByRole('button', { name: '重新加载资料' })).toBeVisible();
  });
});
