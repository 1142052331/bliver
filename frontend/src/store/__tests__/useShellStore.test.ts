import { beforeEach, expect, it } from 'vitest';
import useShellStore from '../useShellStore';

const initialState = useShellStore.getInitialState();

beforeEach(() => {
  useShellStore.setState(initialState, true);
});

it('starts on map', () => {
  expect(useShellStore.getState().activeDestination).toBe('map');
});

it('changes only to supported destinations', () => {
  useShellStore.getState().setActiveDestination('activity');

  expect(useShellStore.getState().activeDestination).toBe('activity');
});
