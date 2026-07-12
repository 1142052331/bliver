import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import LocationPermissionNotice from '../LocationPermissionNotice';

describe('LocationPermissionNotice', () => {
  it('explains a denied permission and offers an explicit retry', async () => {
    const user = userEvent.setup();
    const onRequestLocation = vi.fn();
    render(
      <LocationPermissionNotice
        permissionState="denied"
        viewerKey="viewer-a"
        now={123}
        onRequestLocation={onRequestLocation}
      />,
    );

    expect(screen.getByText('定位权限已关闭')).toBeInTheDocument();
    expect(screen.getByText(/浏览器地址栏/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /重新尝试定位/ }));
    expect(onRequestLocation).toHaveBeenCalledWith({ explicit: true, now: 123, viewerKey: 'viewer-a' });
  });

  it('renders no notice while permission has not failed', () => {
    const { container } = render(
      <LocationPermissionNotice permissionState="idle" onRequestLocation={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('explains that check-in needs a location and offers a publish-focused retry', () => {
    render(
      <LocationPermissionNotice
        context="checkin"
        permissionState="denied"
        onRequestLocation={vi.fn()}
      />,
    );

    expect(screen.getByText('发布足迹需要位置')).toBeInTheDocument();
    expect(screen.getByText(/允许定位后才能发布足迹/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '重试定位' })).toBeInTheDocument();
  });
});
