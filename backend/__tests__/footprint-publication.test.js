const express = require('express');
const multer = require('multer');
const request = require('supertest');
const User = require('../models/User');
const validate = require('../middleware/validate');
const { checkin: checkinSchema } = require('../validators/schemas');

describe('User footprint publication preference', () => {
  test('defaults lastFootprintVisibility to public', () => {
    const user = new User({ name: 'publisher', password: 'hash' });

    expect(user.lastFootprintVisibility).toBe('public');
  });

  test.each(['public', 'friends', 'private'])('accepts %s as lastFootprintVisibility', async (visibility) => {
    const user = new User({
      name: `publisher-${visibility}`,
      password: 'hash',
      lastFootprintVisibility: visibility,
    });

    await expect(user.validate()).resolves.toBeUndefined();
  });

  test('rejects an unsupported lastFootprintVisibility', async () => {
    const user = new User({
      name: 'publisher-invalid',
      password: 'hash',
      lastFootprintVisibility: 'followers',
    });

    await expect(user.validate()).rejects.toMatchObject({
      errors: { lastFootprintVisibility: expect.anything() },
    });
  });
});

describe('check-in request validation', () => {
  const app = express();
  app.use(express.json());
  app.post('/checkin', validate(checkinSchema), (req, res) => res.json(req.body));

  const multipartApp = express();
  const multipartUpload = multer({ storage: multer.memoryStorage() });
  multipartApp.post('/checkin', multipartUpload.single('photo'), validate(checkinSchema), (req, res) => {
    res.json({
      body: req.body,
      file: {
        originalname: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size,
      },
    });
  });

  test('preserves the existing check-in request contract', async () => {
    const response = await request(app)
      .post('/checkin')
      .send({ lat: '31.23', lng: '121.47', message: 'hello', mood: 'calm', precise: 'true' });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      lat: 31.23,
      lng: 121.47,
      message: 'hello',
      mood: 'calm',
      precise: true,
    });
  });

  test.each([
    [true, true],
    [false, false],
    ['true', true],
    ['false', false],
  ])('normalizes precise value %p to %p', async (input, expected) => {
    const response = await request(app)
      .post('/checkin')
      .send({ lat: 31.23, lng: 121.47, precise: input });

    expect(response.status).toBe(200);
    expect(response.body.precise).toBe(expected);
  });

  test.each(['yes', 'FALSE', 1, 0, null])('rejects unsupported precise value %p', async (precise) => {
    const response = await request(app)
      .post('/checkin')
      .send({ lat: 31.23, lng: 121.47, precise });

    expect(response.status).toBe(400);
    expect(response.body.details).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: 'precise' }),
    ]));
  });

  test('normalizes a production-shaped multipart check-in and keeps the file separate', async () => {
    const photo = Buffer.from('photo-bytes');
    const response = await request(multipartApp)
      .post('/checkin')
      .field('lat', '31.23')
      .field('lng', '121.47')
      .field('message', 'hello')
      .field('mood', 'calm')
      .field('precise', 'false')
      .field('visibility', 'friends')
      .field('locationPrecision', 'approximate')
      .attach('photo', photo, { filename: 'checkin.jpg', contentType: 'image/jpeg' });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      body: {
        lat: 31.23,
        lng: 121.47,
        message: 'hello',
        mood: 'calm',
        precise: false,
        visibility: 'friends',
        locationPrecision: 'approximate',
      },
      file: {
        originalname: 'checkin.jpg',
        mimetype: 'image/jpeg',
        size: photo.length,
      },
    });
  });

  test('rejects server-owned fields after multipart parsing', async () => {
    const response = await request(multipartApp)
      .post('/checkin')
      .field('lat', '31.23')
      .field('lng', '121.47')
      .field('precise', 'false')
      .field('countryCode', 'CN')
      .attach('photo', Buffer.from('photo-bytes'), 'checkin.jpg');

    expect(response.status).toBe(400);
  });

  test.each(['public', 'friends', 'private'])('accepts %s visibility', async (visibility) => {
    const response = await request(app)
      .post('/checkin')
      .send({ lat: 31.23, lng: 121.47, visibility });

    expect(response.status).toBe(200);
    expect(response.body.visibility).toBe(visibility);
  });

  test.each(['approximate', 'precise'])('accepts %s location precision', async (locationPrecision) => {
    const response = await request(app)
      .post('/checkin')
      .send({ lat: 31.23, lng: 121.47, locationPrecision });

    expect(response.status).toBe(200);
    expect(response.body.locationPrecision).toBe(locationPrecision);
  });

  test.each([
    ['visibility', 'followers'],
    ['locationPrecision', 'city'],
  ])('rejects unsupported %s values', async (field, value) => {
    const response = await request(app)
      .post('/checkin')
      .send({ lat: 31.23, lng: 121.47, [field]: value });

    expect(response.status).toBe(400);
    expect(response.body.details).toEqual(expect.arrayContaining([
      expect.objectContaining({ field }),
    ]));
  });

  test.each([
    'placeName',
    'countryCode',
    'countryName',
    'regionCode',
    'regionName',
    'discoveryExpiresAt',
  ])('rejects server-owned %s', async (field) => {
    const response = await request(app)
      .post('/checkin')
      .send({ lat: 31.23, lng: 121.47, [field]: 'client-value' });

    expect(response.status).toBe(400);
  });
});
