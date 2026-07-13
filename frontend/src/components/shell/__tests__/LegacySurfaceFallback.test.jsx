import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import LegacySurfaceFallback from '../LegacySurfaceFallback';

describe('LegacySurfaceFallback', () => {
  it('exposes an accessible, Natural City loading state', () => {
    render(<LegacySurfaceFallback surface="admin" />);

    expect(screen.getByRole('status')).toHaveTextContent('正在打开管理面板');
    expect(screen.getByRole('status')).toHaveClass('bliver-legacy-surface-fallback');
    expect(screen.getByRole('status').className).not.toMatch(/aurora|bg-black/);
  });
});
