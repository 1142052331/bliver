process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-key-for-jest';

const EventEmitter = require('events');
const mongoose = require('mongoose');

const mockTestBus = new EventEmitter();
const mockGetFriendIds = jest.fn();

jest.mock('../events/bus', () => mockTestBus);
jest.mock('../services/SuperuserPolicy', () => ({
  getBroadcastTargets: jest.fn(),
  getFriendIds: mockGetFriendIds,
}));
jest.mock('../models/User', () => ({
  find: jest.fn(() => ({
    select: jest.fn(() => ({
      lean: jest.fn().mockResolvedValue([{ _id: 'admin' }, { _id: 'admin' }]),
    })),
  })),
  countDocuments: jest.fn(),
  findByIdAndUpdate: jest.fn(),
}));

const { setupSocket } = require('../socket');

function createIo() {
  const roomEmits = [];
  return {
    emit: jest.fn(),
    to: jest.fn((room) => ({
      emit: (event, payload) => roomEmits.push({ room: String(room), event, payload }),
    })),
    use: jest.fn(),
    on: jest.fn(),
    roomEmits,
  };
}

async function emitAndFlush(event, payload) {
  mockTestBus.emit(event, payload);
  await new Promise(setImmediate);
}

describe('Socket footprint publication privacy', () => {
  let io;

  beforeEach(() => {
    mockTestBus.removeAllListeners();
    mockGetFriendIds.mockReset().mockResolvedValue(new Set(['friend']));
    io = createIo();
    setupSocket(io);
  });

  test.each(['footprint:new', 'footprint:updated'])('globally publishes active public %s', async (event) => {
    const payload = {
      footprint: {
        _id: 'fp-public',
        userId: { _id: 'owner' },
        visibility: 'public',
        discoveryExpiresAt: new Date(Date.now() + 60_000),
      },
    };

    await emitAndFlush(event, payload);

    expect(io.emit).toHaveBeenCalledWith(event, payload);
    expect(io.roomEmits).toEqual([]);
  });

  test('publishes friends footprints only to owner, accepted friends, and explicit admins', async () => {
    const payload = {
      footprint: { _id: 'fp-friends', userId: { _id: 'owner' }, visibility: 'friends' },
    };

    await emitAndFlush('footprint:new', payload);

    expect(io.emit).not.toHaveBeenCalled();
    expect(io.roomEmits.map(({ room }) => room).sort()).toEqual(['admin', 'friend', 'owner']);
  });

  test('publishes private footprints only to owner and explicit admins', async () => {
    const ownerId = new mongoose.Types.ObjectId();
    const payload = {
      footprint: { _id: 'fp-private', userId: ownerId, visibility: 'private' },
    };

    await emitAndFlush('footprint:updated', payload);

    expect(io.emit).not.toHaveBeenCalled();
    expect(io.roomEmits.map(({ room }) => room).sort()).toEqual(['admin', ownerId.toString()].sort());
    expect(mockGetFriendIds).not.toHaveBeenCalled();
  });

  test('keeps deletion broadcasts global and ID-only', async () => {
    await emitAndFlush('footprint:deleted', {
      footprintId: 'fp-deleted',
      footprint: { message: 'must not leak' },
    });

    expect(io.emit).toHaveBeenCalledWith('footprint:deleted', { footprintId: 'fp-deleted' });
  });

  test('contains asynchronous publication listener failures', async () => {
    io.emit.mockRejectedValueOnce(new Error('raw socket details'));
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});

    await expect(emitAndFlush('footprint:new', {
      footprint: {
        _id: 'fp-public',
        userId: 'owner',
        visibility: 'public',
        discoveryExpiresAt: new Date(Date.now() + 60_000),
      },
    })).resolves.toBeUndefined();

    expect(consoleError).toHaveBeenCalledWith('[Socket] Footprint publication failed');
    consoleError.mockRestore();
  });
});
