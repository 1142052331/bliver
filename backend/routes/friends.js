const express = require('express');
const { auth } = require('../middleware/auth');
const friendsService = require('../services/FriendsService');

const router = express.Router();

// GET /api/friends
router.get('/friends', auth, async (req, res) => {
  const friends = await friendsService.getFriends(req.user.id, req.user.name);
  res.json({ friends });
});

// GET /api/friends/requests
router.get('/friends/requests', auth, async (req, res) => {
  const requests = await friendsService.getPendingRequests(req.user.id);
  res.json({ requests });
});

// POST /api/friends/request/:userId
router.post('/friends/request/:userId', auth, async (req, res) => {
  const result = await friendsService.sendRequest(req.user.id, req.params.userId);
  res.status(201).json({ friendship: result.friendship });
});

// POST /api/friends/accept/:friendshipId
router.post('/friends/accept/:friendshipId', auth, async (req, res) => {
  const result = await friendsService.acceptRequest(req.params.friendshipId, req.user.id);
  res.json({ friendship: result.friendship });
});

// POST /api/friends/reject/:friendshipId
router.post('/friends/reject/:friendshipId', auth, async (req, res) => {
  await friendsService.rejectRequest(req.params.friendshipId, req.user.id);
  res.json({ ok: true });
});

// DELETE /api/friends/:userId
router.delete('/friends/:userId', auth, async (req, res) => {
  await friendsService.removeFriend(req.user.id, req.params.userId);
  res.json({ ok: true });
});

module.exports = router;
