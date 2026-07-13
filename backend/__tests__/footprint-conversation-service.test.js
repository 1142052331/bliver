const { comment } = require('../validators/schemas');
const express = require('express');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const request = require('supertest');
const User = require('../models/User');
const Footprint = require('../models/Footprint');
const { connectDB, disconnectDB, clearDB } = require('./setup');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-key-for-jest';

describe('footprint conversation contract', () => {
  test('accepts a top-level comment and a two-level reply', () => {
    expect(comment.parse({ content: '第一条' })).toEqual({ content: '第一条' });

    const reply = comment.parse({
      content: '回复你',
      parentCommentId: '507f1f77bcf86cd799439011',
      replyToCommentId: '507f1f77bcf86cd799439012',
    });

    expect(reply.parentCommentId).toBe('507f1f77bcf86cd799439011');
    expect(reply.replyToCommentId).toBe('507f1f77bcf86cd799439012');
  });

  test('rejects a direct reply without its top-level parent', () => {
    expect(() => comment.parse({
      content: 'broken',
      replyToCommentId: '507f1f77bcf86cd799439012',
    })).toThrow();
  });
});

describe('footprint conversation HTTP contract', () => {
  let app;
  let owner;
  let commenter;
  let footprint;

  beforeAll(async () => {
    await connectDB();
    app = express();
    app.use(express.json());
    app.use('/api', require('../routes/api'));
    app.use(require('../middleware/errorHandler'));
  });

  afterAll(disconnectDB);
  afterEach(clearDB);

  beforeEach(async () => {
    owner = await User.create({ name: 'owner', password: 'hash' });
    commenter = await User.create({ name: 'commenter', password: 'hash' });
    footprint = await Footprint.create({
      userId: owner._id,
      location: { lat: 31.23, lng: 121.47 },
      visibility: 'public',
      discoveryExpiresAt: new Date(Date.now() + 86400000),
      message: 'conversation',
    });
  });

  function auth(user) {
    return {
      Authorization: `Bearer ${jwt.sign({ id: user.id, name: user.name, role: user.role }, process.env.JWT_SECRET)}`,
    };
  }

  test('stores a reply parent and direct target', async () => {
    const root = await request(app)
      .post(`/api/footprints/${footprint.id}/comment`)
      .set(auth(commenter))
      .send({ content: 'root' });
    expect(root.status).toBe(201);
    const rootId = root.body.footprint.comments[0]._id;

    const reply = await request(app)
      .post(`/api/footprints/${footprint.id}/comment`)
      .set(auth(owner))
      .send({ content: 'reply', parentCommentId: rootId, replyToCommentId: rootId });
    expect(reply.status).toBe(201);
    expect(reply.body.footprint.comments.at(-1)).toMatchObject({
      parentCommentId: rootId,
      replyToCommentId: rootId,
    });
  });

  test('rejects a third-level reply and keeps owner deletion separate from moderation', async () => {
    const root = await request(app)
      .post(`/api/footprints/${footprint.id}/comment`)
      .set(auth(commenter))
      .send({ content: 'root' });
    const rootId = root.body.footprint.comments[0]._id;
    const reply = await request(app)
      .post(`/api/footprints/${footprint.id}/comment`)
      .set(auth(owner))
      .send({ content: 'reply', parentCommentId: rootId, replyToCommentId: rootId });
    const replyId = reply.body.footprint.comments.at(-1)._id;

    const thirdLevel = await request(app)
      .post(`/api/footprints/${footprint.id}/comment`)
      .set(auth(commenter))
      .send({ content: 'third', parentCommentId: replyId, replyToCommentId: replyId });
    expect(thirdLevel.status).toBe(400);

    const forbidden = await request(app)
      .delete(`/api/footprints/${footprint.id}/comments/${rootId}`)
      .set(auth(owner));
    expect(forbidden.status).toBe(403);
  });

  test('keeps a deleted root placeholder when replies remain', async () => {
    const root = await request(app)
      .post(`/api/footprints/${footprint.id}/comment`)
      .set(auth(commenter))
      .send({ content: 'root' });
    const rootId = root.body.footprint.comments[0]._id;
    await request(app)
      .post(`/api/footprints/${footprint.id}/comment`)
      .set(auth(owner))
      .send({ content: 'reply', parentCommentId: rootId, replyToCommentId: rootId });

    const deleted = await request(app)
      .delete(`/api/footprints/${footprint.id}/comments/${rootId}`)
      .set(auth(commenter));
    expect(deleted.status).toBe(200);
    const placeholder = deleted.body.footprint.comments.find((item) => item._id === rootId);
    expect(placeholder).toMatchObject({ isDeleted: true, username: '已删除用户', content: '' });
  });
});
