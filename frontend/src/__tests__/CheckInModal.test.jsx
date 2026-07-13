import { useState } from 'react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cwd } from 'node:process';
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CheckInModal from '../components/CheckInModal';

const { mockCheckin, mockImageCompression } = vi.hoisted(() => ({
  mockCheckin: vi.fn(),
  mockImageCompression: vi.fn(),
}));

vi.mock('../api', () => ({
  apiClient: {
    footprints: { checkin: mockCheckin },
  },
}));

// Mock browser-image-compression
vi.mock('browser-image-compression', () => ({
  default: mockImageCompression,
}));

const mockGeolocation = {
  getCurrentPosition: vi.fn(),
  watchPosition: vi.fn(),
  clearWatch: vi.fn(),
};

function hexToRelativeLuminance(hexColor) {
  const channels = hexColor.match(/[a-f\d]{2}/gi).map((channel) => Number.parseInt(channel, 16) / 255);
  const linearChannels = channels.map((channel) => (
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  ));

  return (0.2126 * linearChannels[0]) + (0.7152 * linearChannels[1]) + (0.0722 * linearChannels[2]);
}

function getContrastRatio(firstColor, secondColor) {
  const firstLuminance = hexToRelativeLuminance(firstColor);
  const secondLuminance = hexToRelativeLuminance(secondColor);
  const lighter = Math.max(firstLuminance, secondLuminance);
  const darker = Math.min(firstLuminance, secondLuminance);

  return (lighter + 0.05) / (darker + 0.05);
}

function CheckInHarness() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button type="button" onClick={() => setIsOpen(true)}>Open check-in</button>
      <CheckInModal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        presetLocation={{ lat: 31.2304, lng: 121.4737 }}
      />
    </>
  );
}

function renderModalWithOutsideControls() {
  return render(
    <>
      <button type="button">Before modal</button>
      <CheckInModal
        isOpen
        onClose={vi.fn()}
        presetLocation={{ lat: 31.2304, lng: 121.4737 }}
      />
      <button type="button">After modal</button>
    </>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  mockCheckin.mockResolvedValue({ data: { footprint: { _id: 'footprint-1' } } });
  mockImageCompression.mockResolvedValue(new File([], 'compressed.jpg', { type: 'image/jpeg' }));
  Object.defineProperty(globalThis.navigator, 'geolocation', {
    value: mockGeolocation,
    writable: true,
    configurable: true,
  });
});

describe('CheckInModal', () => {
  const mockOnClose = vi.fn();

  test('does not render when closed', () => {
    const { container } = render(
      <CheckInModal isOpen={false} onClose={mockOnClose} />
    );
    expect(container.innerHTML).toBeFalsy();
  });

  test('makes the first publication public and approximate with a continuously visible summary', () => {
    render(
      <CheckInModal
        isOpen
        onClose={mockOnClose}
        presetLocation={{ lat: 31.2304, lng: 121.4737 }}
      />,
    );

    expect(screen.getByRole('radio', { name: /公开/ })).toBeChecked();
    expect(screen.getByRole('radio', { name: /大致位置/ })).toBeChecked();
    expect(screen.getByText('公开 · 大致位置')).toBeVisible();
    expect(screen.getByRole('button', { name: '公开发布足迹' })).toBeEnabled();
  });

  test('remembers audience and precision only after a successful publication', async () => {
    const user = userEvent.setup();
    const first = render(
      <CheckInModal
        isOpen
        onClose={mockOnClose}
        presetLocation={{ lat: 31.2304, lng: 121.4737 }}
      />,
    );

    await user.click(screen.getByRole('radio', { name: /仅好友/ }));
    await user.click(screen.getByRole('radio', { name: /精确位置/ }));
    await user.click(screen.getByRole('button', { name: '向好友发布足迹' }));
    await waitFor(() => expect(mockCheckin).toHaveBeenCalledTimes(1));
    first.unmount();

    render(
      <CheckInModal
        isOpen
        onClose={mockOnClose}
        presetLocation={{ lat: 39.9042, lng: 116.4074 }}
      />,
    );

    expect(screen.getByRole('radio', { name: /仅好友/ })).toBeChecked();
    expect(screen.getByRole('radio', { name: /精确位置/ })).toBeChecked();
    expect(screen.getByText('仅好友 · 精确位置')).toBeVisible();
  });

  test('submits explicit audience and independent location precision fields', async () => {
    const user = userEvent.setup();
    render(
      <CheckInModal
        isOpen
        onClose={mockOnClose}
        presetLocation={{ lat: 31.2304, lng: 121.4737 }}
      />,
    );

    await user.click(screen.getByRole('radio', { name: /仅自己/ }));
    await user.click(screen.getByRole('radio', { name: /精确位置/ }));
    await user.click(screen.getByRole('button', { name: '保存私人足迹' }));

    await waitFor(() => expect(mockCheckin).toHaveBeenCalledTimes(1));
    const payload = Object.fromEntries(mockCheckin.mock.calls[0][0].entries());
    expect(payload).toMatchObject({
      visibility: 'private',
      locationPrecision: 'precise',
      precise: 'true',
    });
  });

  test('explains the consequence of precise location in context', async () => {
    const user = userEvent.setup();
    render(
      <CheckInModal
        isOpen
        onClose={mockOnClose}
        presetLocation={{ lat: 31.2304, lng: 121.4737 }}
      />,
    );

    expect(screen.queryByText(/具体坐标/)).not.toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: /精确位置/ }));
    expect(screen.getByText(/会显示到地图上的具体坐标/)).toBeVisible();
  });

  test('reveals exact coordinates only after opting into precise location', async () => {
    const user = userEvent.setup();
    render(<CheckInModal isOpen onClose={mockOnClose} presetLocation={{ lat: 31.2304, lng: 121.4737 }} />);
    expect(screen.queryByText(/31\.2304/)).not.toBeInTheDocument();
    await user.click(screen.getByDisplayValue('precise'));
    expect(screen.getByText(/31\.2304/)).toBeInTheDocument();
  });

  test('initializes from authenticated user visibility and removes a selected photo', async () => {
    const user = userEvent.setup();
    localStorage.setItem('bliver_user', JSON.stringify({ _id: 'user-1', lastFootprintVisibility: 'friends' }));
    localStorage.setItem('bliver_token', 'token');
    const { container } = render(<CheckInModal isOpen onClose={mockOnClose} presetLocation={{ lat: 31.2304, lng: 121.4737 }} />);
    expect(screen.getByDisplayValue('friends')).toBeChecked();
    const file = new File(['image'], 'place.jpg', { type: 'image/jpeg' });
    await user.upload(container.querySelector('input[type="file"]'), file);
    expect(await screen.findByRole('button', { name: '移除照片' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '移除照片' }));
    expect(screen.queryByRole('button', { name: '移除照片' })).not.toBeInTheDocument();
  });

  test('retains the complete form and privacy decisions when publication fails', async () => {
    mockCheckin.mockRejectedValueOnce(new Error('offline'));
    const user = userEvent.setup();
    render(
      <CheckInModal
        isOpen
        onClose={mockOnClose}
        presetLocation={{ lat: 31.2304, lng: 121.4737 }}
      />,
    );

    await user.type(screen.getByRole('textbox', { name: '这一刻' }), '雨后的街角');
    await user.click(screen.getByRole('button', { name: '开心' }));
    await user.click(screen.getByRole('radio', { name: /仅好友/ }));
    await user.click(screen.getByRole('radio', { name: /精确位置/ }));
    await user.click(screen.getByRole('button', { name: '向好友发布足迹' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('发布失败');
    expect(screen.getByRole('textbox', { name: '这一刻' })).toHaveValue('雨后的街角');
    expect(screen.getByRole('button', { name: '开心' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('radio', { name: /仅好友/ })).toBeChecked();
    expect(screen.getByRole('radio', { name: /精确位置/ })).toBeChecked();
    expect(mockOnClose).not.toHaveBeenCalled();
  });

  test('keeps a successful publication successful when preference storage throws', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    localStorage.setItem('bliver_user', JSON.stringify({ _id: 'user-1', lastFootprintVisibility: 'public' }));
    localStorage.setItem('bliver_token', 'token');
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('blocked', 'SecurityError'); });

    try {
      render(<CheckInModal isOpen onClose={onClose} presetLocation={{ lat: 31.2304, lng: 121.4737 }} />);
      await user.click(screen.getByRole('button', { name: /公开发布/ }));

      await waitFor(() => expect(mockCheckin).toHaveBeenCalledTimes(1));
      await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    } finally {
      setItemSpy.mockRestore();
    }
  });

  test('keeps GPS acquisition and publication usable when reminder storage throws', async () => {
    const user = userEvent.setup();
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });
    mockGeolocation.getCurrentPosition.mockImplementationOnce((success) => {
      success({ coords: { latitude: 35.6895, longitude: 139.6917 } });
    });

    try {
      render(<CheckInModal isOpen onClose={mockOnClose} />);
      const publish = await screen.findByRole('button', { name: '公开发布足迹' });
      expect(publish).toBeEnabled();
      await user.click(publish);
      await waitFor(() => expect(mockCheckin).toHaveBeenCalledTimes(1));
    } finally {
      setItemSpy.mockRestore();
    }
  });

  test('disables publication and exposes progress while a photo is processing', async () => {
    const compression = deferred();
    mockImageCompression.mockReturnValueOnce(compression.promise);
    const user = userEvent.setup();
    const { container } = render(
      <CheckInModal isOpen onClose={mockOnClose} presetLocation={{ lat: 31.2304, lng: 121.4737 }} />,
    );

    const upload = user.upload(
      container.querySelector('input[type="file"]'),
      new File(['first'], 'first.jpg', { type: 'image/jpeg' }),
    );

    expect(await screen.findByText('正在处理照片')).toBeVisible();
    expect(screen.getByRole('button', { name: '公开发布足迹' })).toBeDisabled();
    compression.resolve(new File(['first-compressed'], 'first-compressed.jpg', { type: 'image/jpeg' }));
    await upload;
    await waitFor(() => expect(screen.getByRole('button', { name: '公开发布足迹' })).toBeEnabled());
  });

  test('ignores an older slow compression result after a newer photo finishes', async () => {
    const firstCompression = deferred();
    const secondCompression = deferred();
    mockImageCompression
      .mockReturnValueOnce(firstCompression.promise)
      .mockReturnValueOnce(secondCompression.promise);
    const user = userEvent.setup();
    const { container } = render(
      <CheckInModal isOpen onClose={mockOnClose} presetLocation={{ lat: 31.2304, lng: 121.4737 }} />,
    );
    const input = container.querySelector('input[type="file"]');

    const firstUpload = user.upload(input, new File(['first'], 'first.jpg', { type: 'image/jpeg' }));
    await waitFor(() => expect(mockImageCompression).toHaveBeenCalledTimes(1));
    const secondUpload = user.upload(input, new File(['second'], 'second.jpg', { type: 'image/jpeg' }));
    await waitFor(() => expect(mockImageCompression).toHaveBeenCalledTimes(2));

    secondCompression.resolve(new File(['second-compressed'], 'second-compressed.jpg', { type: 'image/jpeg' }));
    await secondUpload;
    firstCompression.resolve(new File(['first-compressed'], 'first-compressed.jpg', { type: 'image/jpeg' }));
    await firstUpload;
    await user.click(screen.getByRole('button', { name: '公开发布足迹' }));

    await waitFor(() => expect(mockCheckin).toHaveBeenCalledTimes(1));
    const photo = mockCheckin.mock.calls[0][0].get('photo');
    expect(photo.name).toBe('second-compressed.jpg');
  });

  test('renders submit button when GPS succeeds', async () => {
    mockGeolocation.getCurrentPosition.mockImplementationOnce((success) =>
      success({ coords: { latitude: 35.6895, longitude: 139.6917 } })
    );

    render(<CheckInModal isOpen={true} onClose={mockOnClose} />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '公开发布足迹' })).toBeInTheDocument();
    });

    expect(screen.getByText(/附近区域（约 2\.5 公里范围）/)).toBeInTheDocument();
  });

  test('shows location permission warning when denied', async () => {
    mockGeolocation.getCurrentPosition.mockImplementationOnce(
      (_, error) => error({ code: 1 })
    );

    render(<CheckInModal isOpen={true} onClose={mockOnClose} />);

    await waitFor(() => {
      expect(screen.getByText('发布足迹需要位置')).toBeInTheDocument();
    });
  });

  test('uses presetLocation and skips GPS when provided', async () => {
    render(
      <CheckInModal
        isOpen={true}
        onClose={mockOnClose}
        presetLocation={{ lat: 31.2304, lng: 121.4737 }}
      />
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '公开发布足迹' })).toBeInTheDocument();
    });

    // GPS should NOT have been called
    expect(mockGeolocation.getCurrentPosition).not.toHaveBeenCalled();

    expect(screen.getByText(/附近区域（约 2\.5 公里范围）/)).toBeInTheDocument();
  });

  test('shows mood emoji buttons', async () => {
    mockGeolocation.getCurrentPosition.mockImplementationOnce((success) =>
      success({ coords: { latitude: 35.6895, longitude: 139.6917 } })
    );

    render(<CheckInModal isOpen={true} onClose={mockOnClose} />);

    await waitFor(() => {
      expect(screen.getByText('😊')).toBeInTheDocument();
      expect(screen.getByText('😭')).toBeInTheDocument();
      expect(screen.getByText('🍺')).toBeInTheDocument();
    });
  });

  test('exposes a labelled modal dialog with an accessible 44px initial-focus close control', () => {
    const { container } = render(
      <CheckInModal
        isOpen
        onClose={mockOnClose}
        presetLocation={{ lat: 31.2304, lng: 121.4737 }}
      />,
    );

    const dialog = screen.getByRole('dialog', { name: '发布足迹' });
    const closeButton = screen.getByRole('button', { name: '关闭发布足迹' });

    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAttribute('tabindex', '-1');
    expect(closeButton).toHaveAttribute('type', 'button');
    expect(closeButton).toHaveAttribute('data-dialog-initial-focus');
    expect(closeButton).toHaveClass('bliver-checkin__close');
    expect(closeButton).toHaveFocus();
    expect(screen.getByPlaceholderText('写下此刻的见闻或心情')).not.toHaveFocus();
    expect(container.querySelector('.bliver-checkin-backdrop')).toHaveAttribute('aria-hidden', 'true');
  });

  test('wraps reverse Tab from the close control to the enabled submit control', async () => {
    const user = userEvent.setup();
    const { container } = renderModalWithOutsideControls();
    const closeButton = container.querySelector('.bliver-checkin__close');
    const submitButton = screen.getByRole('button', { name: '公开发布足迹' });
    await waitFor(() => expect(submitButton).toBeEnabled());

    closeButton.focus();
    await user.tab({ shift: true });

    expect(submitButton).toHaveFocus();
  });

  test('wraps forward Tab from the enabled submit control to the close control', async () => {
    const user = userEvent.setup();
    const { container } = renderModalWithOutsideControls();
    const closeButton = container.querySelector('.bliver-checkin__close');
    const submitButton = screen.getByRole('button', { name: '公开发布足迹' });
    await waitFor(() => expect(submitButton).toBeEnabled());

    submitButton.focus();
    await user.tab();

    expect(closeButton).toHaveFocus();
  });

  test('closes on Escape and restores focus to the real opener', async () => {
    const user = userEvent.setup();
    render(<CheckInHarness />);

    const opener = screen.getByRole('button', { name: 'Open check-in' });
    await user.click(opener);
    expect(screen.getByText('发布足迹')).toBeInTheDocument();

    await user.keyboard('{Escape}');

    expect(screen.queryByText('发布足迹')).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });

  test('x button calls onClose', async () => {
    const user = userEvent.setup();
    render(
      <CheckInModal
        isOpen
        onClose={mockOnClose}
        presetLocation={{ lat: 31.2304, lng: 121.4737 }}
      />,
    );

    await user.click(screen.getByRole('button', { name: '关闭发布足迹' }));

    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  test('uses a dedicated high-contrast focus ring only for dark panel focus targets', () => {
    const tokensCss = readFileSync(resolve(cwd(), 'src/styles/tokens.css'), 'utf8');
    const darkFocusRing = tokensCss.match(/--bliver-focus-ring-on-dark:\s*(#[a-f\d]{6});/i)?.[1];
    const defaultFocusBlock = tokensCss.match(
      /\.bliver-shell :focus-visible,\s*\.bliver-shell \.aurora-input:focus-visible\s*{([^}]*)}/s,
    )?.[1] ?? '';
    const darkPanelFocusBlock = tokensCss.match(
      /\.bliver-shell \.ios-panel:focus-visible,\s*\.bliver-shell \.ios-panel :focus-visible\s*{([^}]*)}/s,
    )?.[1] ?? '';

    expect(darkFocusRing?.toLowerCase()).toBe('#a9c9bf');
    expect(defaultFocusBlock).toMatch(/outline:\s*3px solid var\(--bliver-forest\);/);
    expect(darkPanelFocusBlock).toMatch(/outline-color:\s*var\(--bliver-focus-ring-on-dark\);/);
    expect(getContrastRatio(darkFocusRing, '#101319')).toBeGreaterThanOrEqual(3);
  });
});

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}
