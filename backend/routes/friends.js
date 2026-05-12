const express = require('express');
const { auth } = require('../middleware/auth');
const friendsService = require('../services/FriendsService');

const router = express.Router();

// GET /api/friends
router.get('/friends', auth, async (req, res) => {
  try {
    const friends = await friendsService.getFriends(req.user.id, req.user.name);
    res.json({ friends });
  } catch (err) {
    console.error('[friends]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/friends/requests
router.get('/friends/requests', auth, async (req, res) => {
  try {
    const requests = await friendsService.getPendingRequests(req.user.id);
    res.json({ requests });
  } catch (err) {
    console.error('[friends]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/friends/request/:userId
router.post('/friends/request/:userId', auth, async (req, res) => {
  try {
    const result = await friendsService.sendRequest(req.user.id, req.params.userId);
    if (result.error) return res.status(result.status).json({ error: result.error });
    res.status(201).json({ friendship: result.friendship });
  } catch (err) {
    console.error('[friends]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/friends/accept/:friendshipId
router.post('/friends/accept/:friendshipId', auth, async (req, res) => {
  try {
    const result = await friendsService.acceptRequest(req.params.friendshipId, req.user.id);
    if (result.error) return res.status(result.status).json({ error: result.error });
    res.json({ friendship: result.friendship });
  } catch (err) {
    console.error('[friends]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/friends/reject/:friendshipId
router.post('/friends/reject/:friendshipId', auth, async (req, res) => {
  try {
    const result = await friendsService.rejectRequest(req.params.friendshipId, req.user.id);
    if (result.error) return res.status(result.status).json({ error: result.error });
    res.json({ ok: true });
  } catch (err) {
    console.error('[friends]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/friends/:userId
router.delete('/friends/:userId', auth, async (req, res) => {
  try {
    const result = await friendsService.removeFriend(req.user.id, req.params.userId);
    if (result.error) return res.status(result.status).json({ error: result.error });
    res.json({ ok: true });
  } catch (err) {
    console.error('[friends]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
