import { beforeEach, describe, expect, it } from 'vitest';
import {
  LOCATION_REMINDER_COOLDOWN_MS,
  loadLocationReminderAt,
  consumeLocationReminder,
  loadLocationReminderState,
  markLocationReminder,
  shouldShowLocationReminder,
} from '../locationReminder';

const NOW = Date.parse('2026-07-12T12:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;

describe('location reminder contract', () => {
  beforeEach(() => localStorage.clear());

  it('isolates reminder cooldown per viewer', () => {
    markLocationReminder('viewer-a', NOW);

    expect(shouldShowLocationReminder('viewer-a', { now: NOW + 1 })).toBe(false);
    expect(shouldShowLocationReminder('viewer-b', { now: NOW + 1 })).toBe(true);
  });

  it('allows explicit actions to bypass the seven-day cooldown', () => {
    markLocationReminder('guest', NOW);

    expect(shouldShowLocationReminder('guest', { now: NOW + 1, explicit: true })).toBe(true);
    expect(LOCATION_REMINDER_COOLDOWN_MS).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it('consumes an ordinary opportunity once and again after seven days', () => {
    const storage = localStorage;
    expect(consumeLocationReminder('viewer-a', { now: NOW, storage })).toBe(true);
    expect(consumeLocationReminder('viewer-a', { now: NOW + DAY, storage })).toBe(false);
    expect(consumeLocationReminder('viewer-a', { now: NOW + 7 * DAY, storage })).toBe(true);
  });

  it('recovers invalid storage without throwing', () => {
    localStorage.setItem('bliver_location_reminder_at_v2:guest', 'not-a-number');

    expect(loadLocationReminderAt('guest')).toBe(0);
    expect(shouldShowLocationReminder('guest', { now: NOW })).toBe(true);
  });

  it('persists a denied permission state for contextual guidance after reload', () => {
    markLocationReminder('viewer-a', NOW, localStorage, 'denied');

    expect(loadLocationReminderState('viewer-a')).toEqual({
      permissionState: 'denied',
      remindedAt: NOW,
    });
  });
});
