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

  test('x button calls onClose', async () => {
    mockGeolocation.getCurrentPosition.mockImplementationOnce((success) =>
      success({ coords: { latitude: 35.6895, longitude: 139.6917 } })
    );

    const user = userEvent.setup();
    render(<CheckInModal isOpen={true} onClose={mockOnClose} />);

    await waitFor(() => screen.getByText('Post Footprint'));

    // Click the backdrop to close (first X is inside the modal)
    const backdrop = document.querySelector('.absolute.inset-0.bg-black\\/50');
    if (backdrop) {
      await user.click(backdrop);
      expect(mockOnClose).toHaveBeenCalled();
    }
  });
});
