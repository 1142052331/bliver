import { describe, expect, it, vi } from 'vitest';

import { emitFootprintPublished } from '../realtime.js';

describe('realtime privacy boundary', () => {
  it('routes publication metadata to the owner room instead of broadcasting globally', () => {
    const room = { emit: vi.fn() };
    const io = { to: vi.fn(() => room), emit: vi.fn() };

    emitFootprintPublished(io, { footprintId: 'footprint-1', authorId: 'owner-1' });

    expect(io.to).toHaveBeenCalledWith('user:owner-1');
    expect(room.emit).toHaveBeenCalledWith('footprint:published', { footprintId: 'footprint-1', authorId: 'owner-1' });
    expect(io.emit).not.toHaveBeenCalled();
  });
});
