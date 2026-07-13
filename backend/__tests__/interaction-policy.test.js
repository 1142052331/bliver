const User = require('../models/User');
const Friendship = require('../models/Friendship');
const Block = require('../models/Block');
const policy = require('../services/InteractionPolicy');

jest.mock('../models/User');
jest.mock('../models/Friendship');
jest.mock('../models/Block');

describe('InteractionPolicy', () => {
  beforeEach(() => jest.clearAllMocks());

  test('blocks all interaction in either direction before other rules', async () => {
    Block.findOne.mockReturnValue({ lean: () => Promise.resolve({ _id: 'block-1' }) });

    await expect(policy.canSendGreeting('stranger', 'owner')).resolves.toMatchObject({ allowed: false, reason: 'blocked' });
    await expect(policy.canViewProfile('owner', 'stranger')).resolves.toMatchObject({ allowed: false, reason: 'blocked' });
  });

  test('allows a stranger greeting when target is public and preference is enabled', async () => {
    Block.findOne.mockReturnValue({ lean: () => Promise.resolve(null) });
    Friendship.findOne.mockReturnValue({ lean: () => Promise.resolve(null) });
    User.findById.mockReturnValue({ select: () => ({ lean: () => Promise.resolve({ _id: 'target', allowStrangerMessages: true }) }) });

    await expect(policy.canSendGreeting('stranger', 'target', { isPublic: true })).resolves.toMatchObject({ allowed: true });
  });

  test('allows text for accepted friends even when stranger messages are disabled', async () => {
    Block.findOne.mockReturnValue({ lean: () => Promise.resolve(null) });
    Friendship.findOne.mockReturnValue({ lean: () => Promise.resolve({ status: 'accepted' }) });

    await expect(policy.canSendText('friend', 'owner', { conversationState: 'unlocked' })).resolves.toMatchObject({ allowed: true });
  });

  test('denies stranger greetings when target disables them', async () => {
    Block.findOne.mockReturnValue({ lean: () => Promise.resolve(null) });
    Friendship.findOne.mockReturnValue({ lean: () => Promise.resolve(null) });
    User.findById.mockReturnValue({ select: () => ({ lean: () => Promise.resolve({ _id: 'target', allowStrangerMessages: false }) }) });

    await expect(policy.canSendGreeting('stranger', 'target', { isPublic: true })).resolves.toMatchObject({ allowed: false, reason: 'stranger_messages_disabled' });
  });
});
