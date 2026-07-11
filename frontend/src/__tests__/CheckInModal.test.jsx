import { useState } from 'react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cwd } from 'node:process';
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CheckInModal from '../components/CheckInModal';

// Mock browser-image-compression
vi.mock('browser-image-compression', () => ({
  default: vi.fn().mockResolvedValue(new File([], 'compressed.jpg')),
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
  Object.defineProperty(global.navigator, 'geolocation', {
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

  test('renders submit button when GPS succeeds', async () => {
    mockGeolocation.getCurrentPosition.mockImplementationOnce((success) =>
      success({ coords: { latitude: 35.6895, longitude: 139.6917 } })
    );

    render(<CheckInModal isOpen={true} onClose={mockOnClose} />);

    await waitFor(() => {
      expect(screen.getByText('Post Footprint')).toBeInTheDocument();
    });

    // Coordinates should be visible
    expect(screen.getByText(/35.6895/)).toBeInTheDocument();
  });

  test('shows location permission warning when denied', async () => {
    mockGeolocation.getCurrentPosition.mockImplementationOnce(
      (_, error) => error({ code: 1 })
    );

    render(<CheckInModal isOpen={true} onClose={mockOnClose} />);

    await waitFor(() => {
      expect(screen.getByText('位置权限已关闭')).toBeInTheDocument();
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
      expect(screen.getByText('Post Footprint')).toBeInTheDocument();
    });

    // GPS should NOT have been called
    expect(mockGeolocation.getCurrentPosition).not.toHaveBeenCalled();

    // Coordinates should show preset values
    expect(screen.getByText(/31.2304/)).toBeInTheDocument();
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

    const dialog = screen.getByRole('dialog', { name: 'Check In Here' });
    const closeButton = screen.getByRole('button', { name: 'Close check-in dialog' });

    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAttribute('tabindex', '-1');
    expect(closeButton).toHaveAttribute('type', 'button');
    expect(closeButton).toHaveAttribute('data-dialog-initial-focus');
    expect(closeButton).toHaveClass('w-11', 'h-11', 'min-w-11', 'min-h-11');
    expect(closeButton).toHaveFocus();
    expect(screen.getByPlaceholderText('此刻在想什么？')).not.toHaveFocus();
    expect(container.querySelector('.ios-backdrop')).toHaveAttribute('aria-hidden', 'true');
  });

  test('wraps reverse Tab from the close control to the enabled submit control', async () => {
    const user = userEvent.setup();
    const { container } = renderModalWithOutsideControls();
    const closeButton = container.querySelector('.ios-icon-button');
    const submitButton = screen.getByRole('button', { name: 'Post Footprint' });
    await waitFor(() => expect(submitButton).toBeEnabled());

    closeButton.focus();
    await user.tab({ shift: true });

    expect(submitButton).toHaveFocus();
  });

  test('wraps forward Tab from the enabled submit control to the close control', async () => {
    const user = userEvent.setup();
    const { container } = renderModalWithOutsideControls();
    const closeButton = container.querySelector('.ios-icon-button');
    const submitButton = screen.getByRole('button', { name: 'Post Footprint' });
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
    expect(screen.getByText('Check In Here')).toBeInTheDocument();

    await user.keyboard('{Escape}');

    expect(screen.queryByText('Check In Here')).not.toBeInTheDocument();
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

    await user.click(screen.getByRole('button', { name: 'Close check-in dialog' }));

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
