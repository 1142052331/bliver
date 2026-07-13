const Conversation = require('../models/Conversation');
const Block = require('../models/Block');
const Message = require('../models/Message');
const User = require('../models/User');

describe('conversation persistence models', () => {
  test('defines canonical conversation state and per-user hiding', () => {
    expect(Conversation.schema.path('userA')).toBeDefined();
    expect(Conversation.schema.path('userB')).toBeDefined();
    expect(Conversation.schema.path('pairKey')).toBeDefined();
    expect(Conversation.schema.path('state').enumValues).toEqual(['greeting_pending', 'unlocked']);
    expect(Conversation.schema.path('hiddenAtA')).toBeDefined();
    expect(Conversation.schema.path('hiddenAtB')).toBeDefined();
  });

  test('defines unique block pair and message metadata', () => {
    expect(Block.schema.path('blockerId')).toBeDefined();
    expect(Block.schema.path('blockedId')).toBeDefined();
    expect(Message.schema.path('conversationId')).toBeDefined();
    expect(Message.schema.path('kind').enumValues).toEqual(['greeting', 'text']);
  });

  test('defaults stranger messaging to enabled', () => {
    expect(new User({ name: 'u', password: 'p' }).allowStrangerMessages).toBe(true);
  });
});
