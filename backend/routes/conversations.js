const express = require('express');
const { auth } = require('../middleware/auth');
const validate = require('../middleware/validate');
const { message: messageSchema } = require('../validators/schemas');
const conversationService = require('../services/ConversationService');

const router = express.Router();

router.get('/conversations', auth, async (req, res) => {
  res.json({ conversations: await conversationService.list(req.user.id) });
});

router.get('/conversations/:conversationId/messages', auth, async (req, res) => {
  res.json(await conversationService.history(req.user.id, req.params.conversationId, req.query.before));
});

router.post('/users/:userId/greetings', auth, validate(messageSchema), async (req, res) => {
  const result = await conversationService.createGreeting(req.user.id, req.params.userId, req.body.content);
  res.status(201).json(result);
});

router.post('/conversations/:conversationId/reply', auth, validate(messageSchema), async (req, res) => {
  const result = await conversationService.replyAndUnlock(req.params.conversationId, req.user.id, req.body.content);
  res.status(201).json(result);
});

router.post('/conversations/:conversationId/messages', auth, validate(messageSchema), async (req, res) => {
  const result = await conversationService.sendText(req.user.id, null, req.params.conversationId, req.body.content);
  res.status(201).json(result);
});

router.post('/conversations/:conversationId/ignore', auth, async (req, res) => {
  res.json(await conversationService.ignoreGreeting(req.params.conversationId, req.user.id));
});

router.delete('/conversations/:conversationId', auth, async (req, res) => {
  res.json(await conversationService.hideForUser(req.params.conversationId, req.user.id));
});

router.post('/users/:userId/block', auth, async (req, res) => {
  res.json(await conversationService.blockUser(req.user.id, req.params.userId));
});

router.delete('/users/:userId/block', auth, async (req, res) => {
  res.json(await conversationService.unblockUser(req.user.id, req.params.userId));
});

router.get('/me/message-settings', auth, async (req, res) => {
  res.json(await conversationService.getMessageSettings(req.user.id));
});

router.patch('/me/message-settings', auth, async (req, res) => {
  if (typeof req.body.allowStrangerMessages !== 'boolean') return res.status(400).json({ error: 'allowStrangerMessages must be boolean' });
  res.json(await conversationService.updateMessageSettings(req.user.id, req.body.allowStrangerMessages));
});

module.exports = router;
