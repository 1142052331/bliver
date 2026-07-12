import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import useActivityFeed from '../../../hooks/useActivityFeed';
import ActivityPage from '../ActivityPage';

vi.mock('../../../hooks/useActivityFeed');

const newer = {
  _id: 'fp-newer',
  createdAt: '2026-07-12T10:00:00.000Z',
  visibility: 'public',
  relationship: 'stranger',
  sourceScope: 'region',
  sourceLabel: '同省',
  canInteract: false,
  placeName: '上海市静安区陕西北路',
  message: '梧桐树下刚下过一阵雨。',
  mood: '🌧️',
  userId: { _id: 'author-2', name: '阿青' },
  reactions: [{ _id: 'r1', emoji: '❤️' }],
  comments: [{ _id: 'c1', content: '雨后的路很好看' }],
};

const older = {
  ...newer,
  _id: 'fp-older',
  createdAt: '2026-07-11T10:00:00.000Z',
  relationship: 'friend',
  sourceScope: 'friend',
  sourceLabel: '好友',
  canInteract: true,
  placeName: '徐汇滨江',
  message: '晚风正好。',
  mood: '🌿',
  userId: { _id: 'author-1', name: '小林' },
};

function feed(overrides = {}) {
  return {
    data: { pages: [{ items: [older, newer], hasMore: false, nextCursor: null }] },
    isPending: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
    fetchNextPage: vi.fn(),
    hasNextPage: false,
    isFetchingNextPage: false,
    ...overrides,
  };
}

function renderPage(props = {}) {
  return render(
    <ActivityPage
      user={null}
      requireLogin={vi.fn(() => false)}
      locationContext={{ countryCode: 'CN', regionCode: 'CN-SH', regionName: '上海市', countryName: '中国' }}
      {...props}
    />,
  );
}

describe('ActivityPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useActivityFeed.mockReturnValue(feed());
  });

  it('renders guest public discovery in strict createdAt descending order with source labels', () => {
    renderPage();

    expect(screen.getByRole('heading', { name: '动态' })).toBeInTheDocument();
    expect(screen.getByText('公开发现')).toBeInTheDocument();
    const cards = screen.getAllByRole('article');
    expect(cards).toHaveLength(2);
    expect(within(cards[0]).getByText('阿青')).toBeInTheDocument();
    expect(within(cards[1]).getByText('小林')).toBeInTheDocument();
    expect(within(cards[0]).getByText('陌生人')).toBeInTheDocument();
    expect(within(cards[0]).getByText('同省')).toBeInTheDocument();
    expect(within(cards[1]).getByText('好友')).toBeInTheDocument();
  });

  it('uses smart location context and switches to fixed region, country, global, then smart scope', async () => {
    const user = userEvent.setup();
    renderPage();

    expect(useActivityFeed).toHaveBeenLastCalledWith({
      scope: 'smart', countryCode: 'CN', regionCode: 'CN-SH', limit: 20,
    });
    await user.click(screen.getByRole('button', { name: '选择动态范围' }));
    const sheet = screen.getByRole('dialog', { name: '选择动态范围' });
    await user.click(within(sheet).getByRole('button', { name: /本省/ }));
    expect(useActivityFeed).toHaveBeenLastCalledWith({
      scope: 'region', countryCode: 'CN', regionCode: 'CN-SH', limit: 20,
    });

    await user.click(screen.getByRole('button', { name: '选择动态范围' }));
    await user.click(screen.getByRole('button', { name: /本国/ }));
    expect(useActivityFeed).toHaveBeenLastCalledWith({ scope: 'country', countryCode: 'CN', limit: 20 });

    await user.click(screen.getByRole('button', { name: '选择动态范围' }));
    await user.click(screen.getByRole('button', { name: /全球/ }));
    expect(useActivityFeed).toHaveBeenLastCalledWith({ scope: 'global', limit: 20 });

    await user.click(screen.getByRole('button', { name: '选择动态范围' }));
    await user.click(screen.getByRole('button', { name: /智能范围/ }));
    expect(useActivityFeed).toHaveBeenLastCalledWith({
      scope: 'smart', countryCode: 'CN', regionCode: 'CN-SH', limit: 20,
    });
  });

  it('opens authentication for a guest interaction without losing the selected footprint', async () => {
    const user = userEvent.setup();
    const requireLogin = vi.fn(() => false);
    const onReact = vi.fn();
    renderPage({ requireLogin, onReact });

    await user.click(screen.getAllByRole('button', { name: /喜欢/ })[0]);

    expect(requireLogin).toHaveBeenCalledWith({ type: 'react', footprintId: 'fp-newer' });
    expect(onReact).not.toHaveBeenCalled();
    expect(screen.getByText('梧桐树下刚下过一阵雨。')).toBeInTheDocument();
  });

  it('renders structural skeletons while the first page loads', () => {
    useActivityFeed.mockReturnValue(feed({ data: undefined, isPending: true }));
    const { container } = renderPage();

    expect(screen.getByLabelText('正在加载动态')).toBeInTheDocument();
    expect(container.querySelectorAll('.bliver-activity-skeleton')).toHaveLength(3);
  });

  it('keeps cached items visible with an actionable retry notice after refresh failure', async () => {
    const user = userEvent.setup();
    const refetch = vi.fn();
    useActivityFeed.mockReturnValue(feed({ isError: true, error: new Error('offline'), refetch }));
    renderPage();

    expect(screen.getByText('动态暂时无法更新，正在显示已缓存内容。')).toBeInTheDocument();
    expect(screen.getByText('梧桐树下刚下过一阵雨。')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '重新加载动态' }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('renders an empty fixed-scope state and broadens back to smart discovery', async () => {
    const user = userEvent.setup();
    useActivityFeed.mockReturnValue(feed({ data: { pages: [{ items: [], hasMore: false }] } }));
    renderPage({ initialScope: 'region' });

    expect(screen.getByRole('heading', { name: '本省还没有新动态' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '返回智能范围' }));
    expect(useActivityFeed).toHaveBeenLastCalledWith({
      scope: 'smart', countryCode: 'CN', regionCode: 'CN-SH', limit: 20,
    });
  });

  it('renders a retry-only failure when no cached activity exists', async () => {
    const user = userEvent.setup();
    const refetch = vi.fn();
    useActivityFeed.mockReturnValue(feed({ data: undefined, isError: true, error: new Error('offline'), refetch }));
    renderPage();

    expect(screen.getByRole('heading', { name: '动态加载失败' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '重新加载动态' }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('preserves long text and tall media without truncating the activity content', () => {
    const longMessage = '沿着苏州河一直走，记录桥下的水声与路灯。'.repeat(20);
    useActivityFeed.mockReturnValue(feed({
      data: { pages: [{ items: [{ ...newer, message: longMessage, photoUrl: '/tall.jpg' }] }] },
    }));
    renderPage();

    expect(screen.getByText(longMessage)).toBeVisible();
    const image = screen.getByRole('img', { name: '阿青在上海市静安区陕西北路的足迹照片' });
    expect(image).toHaveClass('bliver-activity-card__media');
    expect(image).toHaveAttribute('loading', 'lazy');
    fireEvent.error(image);
    expect(image).not.toBeInTheDocument();
  });
});
