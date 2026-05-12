const express = require('express');
const { auth } = require('../middleware/auth');
const { contentLimiter } = require('../middleware/rateLimiter');
const validate = require('../middleware/validate');
const { message: messageSchema } = require('../validators/schemas');
const messageService = require('../services/MessageService');

const router = express.Router();

// GET /api/messages/:friendId?before=<messageId>
router.get('/messages/:friendId', auth, async (req, res, next) => {
  try {
    const { messages, hasMore } = await messageService.getHistory(
      req.user.id, req.params.friendId, req.query.before
    );
    res.json({ messages, hasMore });
  } catch (err) {
    next(err);
  }
});

// POST /api/messages/:friendId
router.post('/messages/:friendId', auth, contentLimiter, validate(messageSchema), async (req, res, next) => {
  try {
    const result = await messageService.send(req.user.id, req.params.friendId, req.body.content);
    if (result.error) return res.status(result.status).json({ error: result.error });
    res.status(201).json({ message: result.message });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
