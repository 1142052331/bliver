// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  Button,
  IconButton,
  SegmentedControl,
  Sheet,
  Skeleton,
  StatusView,
  Surface,
} from '../index.js';

afterEach(cleanup);

describe('Natural City primitives', () => {
  it('renders a native button with a stable accessible target', () => {
    render(<Button>Publish footprint</Button>);

    const button = screen.getByRole('button', { name: 'Publish footprint' });
    expect(button.tagName).toBe('BUTTON');
    expect(button).toHaveAttribute('type', 'button');
    expect(button).toHaveStyle({ minHeight: '44px' });
  });

  it('forwards the disabled state to the native control', () => {
    render(<Button disabled>Unavailable</Button>);

    expect(screen.getByRole('button', { name: 'Unavailable' })).toBeDisabled();
  });

  it('exposes the dedicated publish action and loading state', () => {
    render(
      <Button variant="publish" loading>
        Publish footprint
      </Button>,
    );

    const button = screen.getByRole('button', { name: 'Publish footprint' });
    expect(button).toHaveClass('bliver-button--publish');
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(button).toBeDisabled();
  });

  it('gives icon-only commands an accessible label and tooltip', () => {
    render(
      <IconButton label="Notifications">
        <span aria-hidden="true">!</span>
      </IconButton>,
    );

    expect(
      screen.getByRole('button', { name: 'Notifications' }),
    ).toHaveAttribute('title', 'Notifications');
  });

  it('reports segmented selection and changes only to another mode', () => {
    const onChange = vi.fn();
    render(
      <SegmentedControl
        label="Map mode"
        value="now"
        options={[
          { value: 'now', label: 'Now' },
          { value: 'friends', label: 'Friends' },
        ]}
        onChange={onChange}
      />,
    );

    const now = screen.getByRole('button', { name: 'Now' });
    const friends = screen.getByRole('button', { name: 'Friends' });
    expect(now).toHaveAttribute('aria-pressed', 'true');
    expect(friends).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(now);
    fireEvent.click(friends);
    expect(onChange).toHaveBeenCalledOnce();
    expect(onChange).toHaveBeenCalledWith('friends');
  });

  it('opens a semantic modal sheet and handles cancellation', () => {
    const onClose = vi.fn();
    render(
      <Sheet open label="Filters" onClose={onClose}>
        <p>Content</p>
      </Sheet>,
    );

    const dialog = screen.getByRole('dialog', { name: 'Filters' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAttribute('open');

    fireEvent(
      dialog,
      new Event('cancel', { bubbles: false, cancelable: true }),
    );
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('renders actionable empty-state content without feature state', () => {
    render(
      <StatusView
        title="No moments"
        body="Move the map to another area."
        action={<Button>Reset map</Button>}
      />,
    );

    expect(
      screen.getByRole('heading', { name: 'No moments' }),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: 'Reset map' })).toBeVisible();
  });

  it('announces a stable structured loading placeholder', () => {
    render(<Skeleton label="Loading activity" lines={3} />);

    const status = screen.getByRole('status', { name: 'Loading activity' });
    expect(status).toHaveAttribute('aria-busy', 'true');
    expect(status.querySelectorAll('span')).toHaveLength(3);
  });

  it('renders semantic content without feature state', () => {
    render(
      <Surface aria-label="Memory summary">
        <h2>Memory summary</h2>
      </Surface>,
    );

    expect(
      screen.getByRole('region', { name: 'Memory summary' }),
    ).toContainElement(
      screen.getByRole('heading', { name: 'Memory summary', level: 2 }),
    );
  });
});
