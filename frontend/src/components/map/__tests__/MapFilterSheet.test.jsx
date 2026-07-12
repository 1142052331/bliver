import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_MAP_QUERY } from '../../../domain/mapQuery';
import { consumeLocationReminder } from '../../../domain/locationReminder';
import MapFilterSheet from '../MapFilterSheet';
import MapScopeControl from '../MapScopeControl';

describe('MapFilterSheet', () => {
  it('groups approved filters and applies one normalized draft', async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    const onClose = vi.fn();
    render(
      <MapFilterSheet
        open
        query={DEFAULT_MAP_QUERY}
        isAuthenticated
        onApply={onApply}
        onClose={onClose}
      />,
    );

    expect(screen.getByRole('group', { name: '关系' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: '时间' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: '内容' })).toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: '好友' }));
    await user.click(screen.getByRole('radio', { name: '24小时' }));
    await user.click(screen.getByRole('radio', { name: '有照片' }));
    expect(onApply).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: '应用筛选' }));
    expect(onApply).toHaveBeenCalledWith({
      ...DEFAULT_MAP_QUERY,
      relationship: 'friends',
      period: '24h',
      content: 'photo',
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('disables unread for guests with an explicit explanation', () => {
    render(
      <MapFilterSheet
        open
        query={DEFAULT_MAP_QUERY}
        isAuthenticated={false}
        onApply={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByRole('radio', { name: '未读' })).toBeDisabled();
    expect(screen.getByText('登录后可筛选未读')).toBeInTheDocument();
  });

  it('resets only filter groups and closes on Escape', async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    const onClose = vi.fn();
    const query = {
      ...DEFAULT_MAP_QUERY,
      scope: 'global',
      query: '高知',
      relationship: 'friends',
      period: '24h',
      content: 'photo',
    };
    render(
      <MapFilterSheet open query={query} isAuthenticated onApply={onApply} onClose={onClose} />,
    );

    await user.click(screen.getByRole('button', { name: '重置筛选' }));
    expect(onApply).toHaveBeenCalledWith({
      ...query,
      relationship: 'all',
      period: '7d',
      content: 'all',
    });
    fireEvent.keyDown(screen.getByRole('dialog', { name: '筛选足迹' }), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});

describe('MapScopeControl', () => {
  it('shows ordinary guidance once per seven-day cooldown and records only a real display', async () => {
    localStorage.clear();
    const day = 24 * 60 * 60 * 1000;
    const startedAt = Date.parse('2026-07-12T12:00:00.000Z');
    const locationReminder = {
      consumeOrdinaryReminder: ({ now }) => consumeLocationReminder('viewer-a', { now }),
    };
    const props = {
      value: 'global',
      context: { scope: 'global', reason: 'permission-denied' },
      onChange: vi.fn(),
      onClose: vi.fn(),
      onRequestLocation: vi.fn(),
      locationReminder,
    };
    const { rerender } = render(<MapScopeControl {...props} open now={startedAt} />);

    await waitFor(() => expect(document.body.querySelector('.bliver-location-permission-notice')).toBeInTheDocument());

    rerender(<MapScopeControl {...props} open={false} now={startedAt + day} />);
    rerender(<MapScopeControl {...props} open now={startedAt + day} />);
    await waitFor(() => expect(document.body.querySelector('.bliver-location-permission-notice')).not.toBeInTheDocument());

    rerender(<MapScopeControl {...props} open={false} now={startedAt + 7 * day} />);
    rerender(<MapScopeControl {...props} open now={startedAt + 7 * day} />);
    await waitFor(() => expect(document.body.querySelector('.bliver-location-permission-notice')).toBeInTheDocument());
  });

  it('requests location when region context is unavailable', async () => {
    const user = userEvent.setup();
    const onRequestLocation = vi.fn();
    const onChange = vi.fn();
    render(
      <MapScopeControl
        open
        value="smart"
        context={{ scope: 'smart', reason: 'unresolved' }}
        onChange={onChange}
        onClose={vi.fn()}
        onRequestLocation={onRequestLocation}
      />,
    );

    const region = screen.getByRole('button', { name: /本省/ });
    expect(region).toHaveAttribute('aria-disabled', 'true');
    await user.click(region);
    expect(onRequestLocation).toHaveBeenCalledWith({ explicit: true });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('emits fixed geography codes and closes the sheet', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const onClose = vi.fn();
    render(
      <MapScopeControl
        open
        value="smart"
        context={{
          scope: 'smart', reason: 'resolved-location',
          countryCode: 'CN', countryName: '中国', regionCode: 'CN-SH', regionName: '上海市',
        }}
        onChange={onChange}
        onClose={onClose}
        onRequestLocation={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: /本省/ }));
    expect(onChange).toHaveBeenCalledWith({
      scope: 'region', countryCode: 'CN', regionCode: 'CN-SH',
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('shows actionable permission guidance after a denial', () => {
    render(
      <MapScopeControl
        open
        value="global"
        context={{ scope: 'global', reason: 'permission-denied' }}
        onChange={vi.fn()}
        onClose={vi.fn()}
        onRequestLocation={vi.fn()}
      />,
    );

    expect(screen.getByText('定位权限已关闭')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /重新尝试定位/ })).toBeInTheDocument();
  });
});
