process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-key-for-jest';

const express = require('express');
const jwt = require('jsonwebtoken');
const request = require('supertest');
const Announcement = require('../models/Announcement');
const Footprint = require('../models/Footprint');
const Friendship = require('../models/Friendship');
const Message = require('../models/Message');
const User = require('../models/User');
const friendsService = require('../services/FriendsService');
const pushWarning = jest.spyOn(console, 'warn').mockImplementation(() => {});
const footprintService = require('../services/FootprintService');
pushWarning.mockRestore();
const {
  areFriends,
  getBroadcastTargets,
  getEffectiveFriends,
} = require('../services/SuperuserPolicy');
const { SUPERUSER_NAME } = require('../services/superuser');
const errorHandler = require('../middleware/errorHandler');
const { clearDB, connectDB, disconnectDB } = require('./setup');

function tokenFor(user) {
  return jwt.sign(
    { id: user.id, sessionVersion: user.sessionVersion },
    process.env.JWT_SECRET,
  );
}

function bearer(user) {
  return { Authorization: `Bearer ${tokenFor(user)}` };
}

async function createUser(overrides = {}) {
  return User.create({
    name: `user-${new User()._id}`,
    password: 'hash',
    ...overrides,
  });
}

describe('database-authoritative identity and authorization', () => {
  let announcementApp;

  beforeAll(async () => {
    await connectDB();
    announcementApp = express();
    announcementApp.use(express.json());
    announcementApp.use('/api', require('../routes/announcements'));
    announcementApp.use(errorHandler);
  });

  afterAll(disconnectDB);
  afterEach(clearDB);

  test('announcement publishing requires the database admin role, not the founder display name', async () => {
    const lookalike = await createUser({ name: SUPERUSER_NAME, role: 'user' });

    const denied = await request(announcementApp)
      .post('/api/announcements')
      .set(bearer(lookalike))
      .send({ content: 'lookalike announcement' });

    expect(denied.status).toBe(403);
    expect(await Announcement.countDocuments()).toBe(0);

    const admin = await createUser({ name: 'renamed-moderator', role: 'admin' });
    const published = await request(announcementApp)
      .post('/api/announcements')
      .set(bearer(admin))
      .send({ content: 'authorized announcement' });

    expect(published.status).toBe(201);
    expect(published.body.announcement).toMatchObject({
      content: 'authorized announcement',
      author: SUPERUSER_NAME,
    });
  });

  test('comment moderation requires the database admin role', async () => {
    const owner = await createUser({ name: 'footprint-owner' });
    const commenter = await createUser({ name: 'comment-author' });
    const lookalike = await createUser({ name: SUPERUSER_NAME, role: 'user' });
    const footprint = await Footprint.create({
      userId: owner._id,
      location: { lat: 31.23, lng: 121.47 },
      visibility: 'public',
      discoveryExpiresAt: new Date(Date.now() + 60_000),
      comments: [{ userId: commenter._id, username: commenter.name, content: 'keep me' }],
    });
    const commentId = footprint.comments[0]._id.toString();

    await expect(footprintService.deleteComment(
      footprint.id,
      commentId,
      lookalike.id,
      lookalike.name,
      { viewer: { id: lookalike.id, name: lookalike.name, role: lookalike.role } },
    )).rejects.toMatchObject({ statusCode: 403 });

    const admin = await createUser({ name: 'moderator', role: 'admin' });
    await expect(footprintService.deleteComment(
      footprint.id,
      commentId,
      admin.id,
      admin.name,
      { viewer: { id: admin.id, name: admin.name, role: admin.role } },
    )).resolves.toHaveProperty('footprint');
  });

  test('forced-friend injection follows canonical systemIdentity after founder rename', async () => {
    const founder = await createUser({
      name: 'Founder Renamed',
      systemIdentity: 'asen',
      isOnline: true,
    });
    const lookalike = await createUser({ name: SUPERUSER_NAME });
    const regular = await createUser({ name: 'regular-user' });

    const regularFriends = await getEffectiveFriends(regular.id, regular.name, []);
    expect(regularFriends.map((friend) => friend._id.toString())).toEqual([founder.id]);
    expect(regularFriends.map((friend) => friend._id.toString())).not.toContain(lookalike.id);

    const chatter = await createUser({ name: 'founder-chatter' });
    await Message.create({ senderId: founder._id, receiverId: chatter._id, content: 'hello' });
    const founderFriends = await getEffectiveFriends(founder.id, founder.name, []);
    expect(founderFriends.map((friend) => friend._id.toString())).toContain(chatter.id);
    expect(founderFriends.map((friend) => friend._id.toString())).not.toContain(lookalike.id);
  });

  test('broadcast scope follows canonical systemIdentity, never the display name', async () => {
    const founder = await createUser({
      name: 'Founder Renamed',
      systemIdentity: 'asen',
      isOnline: true,
    });
    const lookalike = await createUser({ name: SUPERUSER_NAME });

    await expect(getBroadcastTargets(founder.id, founder.name)).resolves.toEqual({ mode: 'all' });
    await expect(getBroadcastTargets(lookalike.id, lookalike.name)).resolves.toMatchObject({
      mode: 'friends+superuser',
      superuserId: founder._id,
    });
  });

  test('friendship bypass is limited to admins and the canonical founder identity', async () => {
    const founder = await createUser({ name: 'Founder Renamed', systemIdentity: 'asen' });
    const lookalike = await createUser({ name: SUPERUSER_NAME });
    const admin = await createUser({ name: 'admin-user', role: 'admin' });
    const stranger = await createUser({ name: 'stranger' });

    await expect(areFriends(stranger.id, founder.id)).resolves.toBe(true);
    await expect(areFriends(founder.id, stranger.id)).resolves.toBe(true);
    await expect(areFriends(admin.id, stranger.id)).resolves.toBe(true);
    await expect(areFriends(lookalike.id, stranger.id)).resolves.toBe(false);
  });

  test('friend request and removal protections follow canonical systemIdentity', async () => {
    const founder = await createUser({ name: 'Founder Renamed', systemIdentity: 'asen' });
    const lookalike = await createUser({ name: SUPERUSER_NAME });
    const regular = await createUser({ name: 'regular-user' });

    await expect(friendsService.sendRequest(regular.id, founder.id))
      .rejects.toMatchObject({ statusCode: 400 });
    await expect(friendsService.sendRequest(regular.id, lookalike.id))
      .resolves.toHaveProperty('friendship');

    await expect(friendsService.removeFriend(regular.id, founder.id))
      .rejects.toMatchObject({ statusCode: 403 });

    await Friendship.updateOne(
      { requester: regular._id, recipient: lookalike._id },
      { $set: { status: 'accepted' } },
    );
    await expect(friendsService.removeFriend(regular.id, lookalike.id)).resolves.toEqual({});
  });
});
