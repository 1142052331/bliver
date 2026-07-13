import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import PhotoWall from '../PhotoWall';

describe('PhotoWall', () => {
  it('renders an accessible dialog and keeps a placeholder when an image fails', () => {
    const telemetry = vi.fn();
    window.addEventListener('bliver:telemetry', telemetry);
    render(<PhotoWall
      footprints={[{ _id: 'fp-1', photoUrl: '/broken.jpg', placeName: '苏州河', userId: { name: '旅人' } }]}
      onClose={vi.fn()}
      onSelect={vi.fn()}
    />);

    expect(screen.getByRole('dialog', { name: '照片墙' })).toBeInTheDocument();
    const image = screen.getByRole('img', { name: '苏州河照片' });
    fireEvent.error(image);
    expect(screen.getByText('照片暂时无法加载')).toBeInTheDocument();
    expect(telemetry).toHaveBeenCalledWith(expect.objectContaining({ detail: {
      name: 'legacy_surface_error', surface: 'photo', status: 'error', reason: 'image-load',
    } }));
    window.removeEventListener('bliver:telemetry', telemetry);
    expect(screen.getByRole('button', { name: '关闭照片墙' })).toBeInTheDocument();
  });
});
