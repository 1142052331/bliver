import { StrictMode } from 'react';
import { render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import LegacyDestinationBridge from '../LegacyDestinationBridge';

const createActions = () => ({
  openTimeline: vi.fn(),
  openFriends: vi.fn(),
  openProfile: vi.fn(),
  openAuth: vi.fn(),
  onHandled: vi.fn(),
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('LegacyDestinationBridge', () => {
  it('renders nothing and does nothing for Map', () => {
    const actions = createActions();
    const { container } = render(
      <LegacyDestinationBridge destination="map" user={{ _id: 'u1' }} {...actions} />,
    );

    expect(container).toBeEmptyDOMElement();
    expect(actions.openTimeline).not.toHaveBeenCalled();
    expect(actions.openFriends).not.toHaveBeenCalled();
    expect(actions.openProfile).not.toHaveBeenCalled();
    expect(actions.openAuth).not.toHaveBeenCalled();
    expect(actions.onHandled).not.toHaveBeenCalled();
  });

  it('opens the existing timeline for Activity and returns to Map', () => {
    const actions = createActions();
    render(<LegacyDestinationBridge destination="activity" user={{ _id: 'u1' }} {...actions} />);
    expect(actions.openTimeline).toHaveBeenCalledTimes(1);
    expect(actions.onHandled).toHaveBeenCalledWith('map');
  });

  it('opens the existing friends surface for logged-in Messages', () => {
    const actions = createActions();
    render(<LegacyDestinationBridge destination="messages" user={{ _id: 'u1' }} {...actions} />);
    expect(actions.openFriends).toHaveBeenCalledTimes(1);
    expect(actions.openAuth).not.toHaveBeenCalled();
    expect(actions.onHandled).toHaveBeenCalledWith('map');
  });

  it('requests login for guest Messages', () => {
    const actions = createActions();
    render(<LegacyDestinationBridge destination="messages" user={null} {...actions} />);
    expect(actions.openAuth).toHaveBeenCalledWith('login', '登录后查看消息');
    expect(actions.openFriends).not.toHaveBeenCalled();
    expect(actions.onHandled).toHaveBeenCalledWith('map');
  });

  it('opens the current user profile for logged-in Me', () => {
    const actions = createActions();
    render(<LegacyDestinationBridge destination="me" user={{ _id: 'u1' }} {...actions} />);
    expect(actions.openProfile).toHaveBeenCalledWith('u1');
    expect(actions.openAuth).not.toHaveBeenCalled();
    expect(actions.onHandled).toHaveBeenCalledWith('map');
  });

  it('requests login for guest Me', () => {
    const actions = createActions();
    render(<LegacyDestinationBridge destination="me" user={null} {...actions} />);
    expect(actions.openAuth).toHaveBeenCalledWith('login', '登录后查看个人主页');
    expect(actions.openProfile).not.toHaveBeenCalled();
    expect(actions.onHandled).toHaveBeenCalledWith('map');
  });

  it('does not repeat handling when rerendered with the same destination', () => {
    const actions = createActions();
    const { rerender } = render(
      <LegacyDestinationBridge destination="activity" user={{ _id: 'u1' }} {...actions} />,
    );

    rerender(<LegacyDestinationBridge destination="activity" user={{ _id: 'u1' }} {...actions} />);

    expect(actions.openTimeline).toHaveBeenCalledTimes(1);
    expect(actions.onHandled).toHaveBeenCalledTimes(1);
  });

  it('does not duplicate side effects under React StrictMode', () => {
    const actions = createActions();

    render(
      <StrictMode>
        <LegacyDestinationBridge destination="activity" user={{ _id: 'u1' }} {...actions} />
      </StrictMode>,
    );

    expect(actions.openTimeline).toHaveBeenCalledTimes(1);
    expect(actions.onHandled).toHaveBeenCalledTimes(1);
  });

  it('handles a different destination after a direct destination change', () => {
    const actions = createActions();
    const { rerender } = render(
      <LegacyDestinationBridge destination="activity" user={{ _id: 'u1' }} {...actions} />,
    );

    rerender(<LegacyDestinationBridge destination="messages" user={{ _id: 'u1' }} {...actions} />);

    expect(actions.openTimeline).toHaveBeenCalledTimes(1);
    expect(actions.openFriends).toHaveBeenCalledTimes(1);
    expect(actions.onHandled).toHaveBeenCalledTimes(2);
  });

  it('handles a destination again after switching through Map', () => {
    const actions = createActions();
    const { rerender } = render(
      <LegacyDestinationBridge destination="activity" user={{ _id: 'u1' }} {...actions} />,
    );

    rerender(<LegacyDestinationBridge destination="map" user={{ _id: 'u1' }} {...actions} />);
    rerender(<LegacyDestinationBridge destination="activity" user={{ _id: 'u1' }} {...actions} />);

    expect(actions.openTimeline).toHaveBeenCalledTimes(2);
    expect(actions.onHandled).toHaveBeenCalledTimes(2);
  });

  it('preserves a failed destination until its required action becomes available', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const onHandled = vi.fn();
    const openTimeline = vi.fn();
    const { rerender } = render(
      <LegacyDestinationBridge
        destination="activity"
        user={{ _id: 'u1' }}
        onHandled={onHandled}
      />,
    );

    expect(consoleError).toHaveBeenCalledWith(
      'LegacyDestinationBridge requires an openTimeline callback for the activity destination.',
    );
    expect(onHandled).not.toHaveBeenCalled();

    rerender(
      <LegacyDestinationBridge
        destination="activity"
        user={{ _id: 'u1' }}
        openTimeline={openTimeline}
        onHandled={onHandled}
      />,
    );

    expect(openTimeline).toHaveBeenCalledTimes(1);
    expect(onHandled).toHaveBeenCalledWith('map');
  });

  it('reports an unknown destination without marking it handled', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const actions = createActions();

    render(
      <LegacyDestinationBridge destination="nearby" user={{ _id: 'u1' }} {...actions} />,
    );

    expect(consoleError).toHaveBeenCalledWith(
      'LegacyDestinationBridge received an unknown destination: nearby.',
    );
    expect(actions.onHandled).not.toHaveBeenCalled();
  });

  it('stays safe when onHandled is omitted', () => {
    const openTimeline = vi.fn();

    expect(() => {
      render(
        <LegacyDestinationBridge
          destination="activity"
          user={{ _id: 'u1' }}
          openTimeline={openTimeline}
        />,
      );
    }).not.toThrow();

    expect(openTimeline).toHaveBeenCalledTimes(1);
  });
});
