import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import TimelineDrawer from '../TimelineDrawer';
import { FootprintActionsProvider } from '../../contexts/FootprintActionsContext';
import useUIStore from '../../store/useUIStore';

const defaultProps = {
  footprints: [],
  userId: 'user-1',
  isAdmin: false,
  onSelectFootprint: vi.fn(),
  period: 'today',
  onChangePeriod: vi.fn(),
  loading: false,
};

function TimelineHarness() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button type="button" onClick={() => setIsOpen(true)}>Open timeline</button>
      <button type="button" onClick={() => setIsOpen(false)}>Map destination</button>
      <TimelineDrawer
        {...defaultProps}
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
      />
    </>
  );
}

function PopulatedTimelineHarness() {
  const [isOpen, setIsOpen] = useState(true);
  const footprints = [{
    _id: 'footprint-1',
    userId: { _id: 'person-1', name: 'Alice', avatarUrl: '' },
    createdAt: '2026-07-11T08:00:00.000Z',
    placeName: 'Shanghai',
    message: 'Hello from the map',
    reactions: [],
  }];

  return (
    <FootprintActionsProvider
      user={{ _id: 'user-1' }}
      requireLogin={() => true}
      setFootprints={() => {}}
    >
      <TimelineDrawer
        {...defaultProps}
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        footprints={footprints}
      />
    </FootprintActionsProvider>
  );
}

afterEach(() => {
  useUIStore.setState({ viewingProfileId: null });
});

describe('TimelineDrawer accessibility', () => {
  it('does not render its interactive subtree while closed', () => {
    const { container } = render(
      <TimelineDrawer {...defaultProps} isOpen={false} onClose={vi.fn()} />,
    );

    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('exposes a labelled modal dialog with an accessible 44px close control', () => {
    render(<TimelineDrawer {...defaultProps} isOpen onClose={vi.fn()} />);

    const dialog = screen.getByRole('dialog', { name: '足迹记录' });
    const closeButton = screen.getByRole('button', { name: '关闭足迹记录' });

    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByRole('heading', { name: '足迹记录' })).toBeInTheDocument();
    expect(closeButton).toHaveClass('h-11', 'min-h-11', 'w-11', 'min-w-11');
  });

  it.each([
    [undefined, false],
    [true, true],
  ])('sets mobile navigation reservation to %s', (reserveMobileNavigation, shouldReserve) => {
    render(
      <TimelineDrawer
        {...defaultProps}
        isOpen
        onClose={vi.fn()}
        reserveMobileNavigation={reserveMobileNavigation}
      />,
    );

    const dialog = screen.getByRole('dialog');
    if (shouldReserve) {
      expect(dialog).toHaveClass('bliver-destination-surface');
    } else {
      expect(dialog).not.toHaveClass('bliver-destination-surface');
    }
  });

  it('contains forward and reverse tab navigation inside the open dialog', async () => {
    const user = userEvent.setup();
    render(<TimelineHarness />);

    await user.click(screen.getByRole('button', { name: 'Open timeline' }));

    const closeButton = screen.getByRole('button', { name: '关闭足迹记录' });
    const lastPeriodButton = screen.getByRole('button', { name: '本年' });
    expect(closeButton).toHaveFocus();

    await user.tab({ shift: true });
    expect(lastPeriodButton).toHaveFocus();

    await user.tab();
    expect(closeButton).toHaveFocus();
  });

  it('closes on Escape and restores focus to the opener', async () => {
    const user = userEvent.setup();
    render(<TimelineHarness />);

    const opener = screen.getByRole('button', { name: 'Open timeline' });
    await user.click(opener);
    expect(screen.getByRole('dialog', { name: '足迹记录' })).toBeInTheDocument();

    await user.keyboard('{Escape}');

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });

  it('keeps focus on an explicit external target that closes the dialog', async () => {
    const user = userEvent.setup();
    render(<TimelineHarness />);

    await user.click(screen.getByRole('button', { name: 'Open timeline' }));
    const mapDestination = screen.getByRole('button', { name: 'Map destination' });

    await user.click(mapDestination);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(mapDestination).toHaveFocus();
  });

  it('closes before opening a profile from the user identity control', async () => {
    const user = userEvent.setup();
    render(<PopulatedTimelineHarness />);

    const identityButton = screen.getByRole('button', { name: '查看 Alice 的个人主页' });
    expect(identityButton).toHaveClass('min-h-11');

    await user.click(identityButton);

    expect(screen.queryByRole('dialog', { name: '足迹记录' })).not.toBeInTheDocument();
    expect(useUIStore.getState().viewingProfileId).toBe('person-1');
  });
});
