const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const service = require('../services/ConversationService');

jest.mock('../models/Conversation');
jest.mock('../models/Message');
jest.mock('../services/InteractionPolicy', () => ({
  canSendGreeting: jest.fn().mockResolvedValue({ allowed: true }),
  canSendText: jest.fn().mockResolvedValue({ allowed: true }),
  canReadConversation: jest.fn().mockResolvedValue({ allowed: true }),
  isBlocked: jest.fn().mockResolvedValue(false),
}));

describe('ConversationService state transitions', () => {
  beforeEach(() => jest.clearAllMocks());

  test('creates a pending greeting conversation and greeting message', async () => {
    Conversation.pairKeyFor.mockReturnValue('a:b');
    Conversation.findOneAndUpdate.mockResolvedValue({ _id: 'conversation-1', state: 'greeting_pending' });
    Message.create.mockResolvedValue({ _id: 'message-1' });

    const result = await service.createGreeting('a', 'b', 'hello');

    expect(result.conversation._id).toBe('conversation-1');
    expect(Message.create).toHaveBeenCalledWith(expect.objectContaining({ kind: 'greeting', senderId: 'a', receiverId: 'b' }));
  });

  test('reply unlocks a pending conversation and creates text', async () => {
    Conversation.findOneAndUpdate.mockResolvedValue({ _id: 'conversation-1', state: 'unlocked' });
    Message.create.mockResolvedValue({ _id: 'message-2' });

    const result = await service.replyAndUnlock('conversation-1', 'b', 'hi');

    expect(Conversation.findOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ _id: 'conversation-1', state: 'greeting_pending', pendingSenderId: { $ne: 'b' } }),
      expect.objectContaining({ $set: expect.objectContaining({ state: 'unlocked' }) }),
      expect.objectContaining({ new: true }),
    );
    expect(result.message._id).toBe('message-2');
  });
});
