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

  it('falls back explicitly to global discovery and offers a location action when context is unavailable', async () => {
    const user = userEvent.setup();
    const onRequestLocation = vi.fn();
    renderPage({
      locationContext: { reason: 'permission-denied' },
      onRequestLocation,
    });

    expect(useActivityFeed).toHaveBeenLastCalledWith({ scope: 'global', limit: 20 });
    expect(screen.getByText('无法获取位置，当前显示全球公开动态。')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '开启定位' }));
    expect(onRequestLocation).toHaveBeenCalledWith({ explicit: true });
  });

  it('uses global as the effective scope when an initial region scope has no codes', () => {
    useActivityFeed.mockReturnValue(feed({ data: { pages: [{ items: [], hasMore: false }] } }));
    renderPage({ initialScope: 'region', locationContext: { reason: 'permission-denied' } });

    expect(useActivityFeed).toHaveBeenLastCalledWith({ scope: 'global', limit: 20 });
    expect(screen.getByRole('button', { name: '选择动态范围' })).toHaveTextContent('全球');
    expect(screen.getByRole('heading', { name: '全球还没有新动态' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '返回智能范围' })).not.toBeInTheDocument();
  });

  it('uses global as the effective scope when an initial country scope has no country code', () => {
    useActivityFeed.mockReturnValue(feed({ data: { pages: [{ items: [], hasMore: false }] } }));
    renderPage({ initialScope: 'country', locationContext: { regionCode: 'CN-SH', reason: 'unresolved' } });

    expect(useActivityFeed).toHaveBeenLastCalledWith({ scope: 'global', limit: 20 });
    expect(screen.getByRole('button', { name: '选择动态范围' })).toHaveTextContent('全球');
    expect(screen.getByRole('heading', { name: '全球还没有新动态' })).toBeInTheDocument();
  });

  it('explains only the missing province when country context is available', async () => {
    const user = userEvent.setup();
    renderPage({ locationContext: { countryCode: 'CN', countryName: '中国', reason: 'unresolved' } });

    await user.click(screen.getByRole('button', { name: '选择动态范围' }));
    const sheet = screen.getByRole('dialog', { name: '选择动态范围' });
    expect(within(sheet).getByText('开启定位后可选择本省动态。')).toBeInTheDocument();
    expect(within(sheet).queryByText('开启定位后可选择本省和本国动态。')).not.toBeInTheDocument();
    expect(within(sheet).getByRole('button', { name: /本省/ })).toBeDisabled();
    expect(within(sheet).getByRole('button', { name: /本国/ })).toBeEnabled();
  });

  it('disables geographic scopes without location codes while keeping smart and global available', async () => {
    const user = userEvent.setup();
    renderPage({ locationContext: { reason: 'unresolved' } });

    await user.click(screen.getByRole('button', { name: '选择动态范围' }));
    const sheet = screen.getByRole('dialog', { name: '选择动态范围' });
    expect(within(sheet).getByText('开启定位后可选择本省和本国动态。')).toBeInTheDocument();
    expect(within(sheet).getByRole('button', { name: /本省/ })).toBeDisabled();
    expect(within(sheet).getByRole('button', { name: /本国/ })).toBeDisabled();
    expect(within(sheet).getByRole('button', { name: /智能范围/ })).toBeEnabled();
    expect(within(sheet).getByRole('button', { name: /全球/ })).toBeEnabled();
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

  it('gates guest comments and preserves the authenticated comment callback', async () => {
    const user = userEvent.setup();
    const requireLogin = vi.fn(() => false);
    const onComment = vi.fn();
    renderPage({ requireLogin, onComment });

    const cards = screen.getAllByRole('article');
    await user.click(within(cards[0]).getByRole('button', { name: /评论/ }));
    expect(requireLogin).toHaveBeenCalledWith({ type: 'comment', footprintId: 'fp-newer' });
    expect(onComment).not.toHaveBeenCalled();

    await user.click(within(cards[1]).getByRole('button', { name: /评论/ }));
    expect(onComment).toHaveBeenCalledWith(older);
  });

  it('traps focus in the scope dialog, closes with Escape, and restores the opener focus', async () => {
    const user = userEvent.setup();
    renderPage();
    const opener = screen.getByRole('button', { name: '选择动态范围' });

    await user.click(opener);
    const sheet = screen.getByRole('dialog', { name: '选择动态范围' });
    const close = within(sheet).getByRole('button', { name: '关闭范围选择' });
    expect(close).toHaveFocus();

    const globalOption = within(sheet).getByRole('button', { name: /全球/ });
    globalOption.focus();
    await user.tab();
    expect(close).toHaveFocus();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: '选择动态范围' })).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
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

  it('uses the country-specific empty state for an empty country scope', () => {
    useActivityFeed.mockReturnValue(feed({ data: { pages: [{ items: [], hasMore: false }] } }));
    renderPage({ initialScope: 'country' });

    expect(screen.getByRole('heading', { name: '本国还没有新动态' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '返回智能范围' })).toBeInTheDocument();
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
