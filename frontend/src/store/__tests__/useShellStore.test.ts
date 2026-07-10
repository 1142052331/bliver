import { beforeEach, expect, it } from 'vitest';
import useShellStore from '../useShellStore';

beforeEach(() => {
  useShellStore.setState({ activeDestination: 'map' });
});

it('starts on map', () => {
  expect(useShellStore.getState().activeDestination).toBe('map');
});

it('changes only to supported destinations', () => {
  useShellStore.getState().setActiveDestination('activity');

  expect(useShellStore.getState().activeDestination).toBe('activity');
});
