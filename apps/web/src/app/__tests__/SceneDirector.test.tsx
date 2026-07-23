// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import {
  SceneDirector,
  sceneVariantForPathname,
} from '../SceneDirector.js';

describe('SceneDirector', () => {
  it.each([
    ['/map', 'spatial'],
    ['/publish', 'spatial'],
    ['/activity', 'content'],
    ['/login', 'auth'],
    ['/register', 'auth'],
    ['/messages/thread-id', 'work'],
    ['/notifications', 'work'],
  ] as const)('maps %s to the %s motion register', (pathname, expected) => {
    expect(sceneVariantForPathname(pathname)).toBe(expected);
  });

  it('keeps work routes quiet by omitting spatial aperture decoration', () => {
    const { container } = render(
      <SceneDirector routeKey="/messages" variant="work">
        <p>Messages</p>
      </SceneDirector>,
    );

    expect(screen.getByText('Messages')).toBeVisible();
    expect(container.querySelector('.scene-director__aperture')).toBeNull();
  });

  it('retains spatial decoration for content scenes', () => {
    const { container } = render(
      <SceneDirector routeKey="/activity" variant="content">
        <p>Activity</p>
      </SceneDirector>,
    );

    expect(container.querySelector('.scene-director__aperture')).toBeInTheDocument();
  });
});
