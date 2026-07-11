process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-key-for-jest';

jest.mock('../middleware/auth', () => ({
  auth: (req, _res, next) => {
    req.user = { id: 'user-id', name: 'publisher', role: 'user' };
    next();
  },
  admin: (_req, _res, next) => next(),
  optionalAuth: (_req, _res, next) => next(),
}));

jest.mock('../middleware/rateLimiter', () => ({
  authLimiter: (_req, _res, next) => next(),
  contentLimiter: (_req, _res, next) => next(),
}));

jest.mock('../middleware/upload', () => {
  const multer = require('multer');

  return {
    upload: multer({ storage: multer.memoryStorage() }),
    uploadToCloudinary: jest.fn((req, _res, next) => {
      req.cloudinaryUrl = 'https://cloudinary.test/checkin.jpg';
      next();
    }),
  };
});

jest.mock('../services/FootprintService', () => ({
  create: jest.fn(async (_userId, payload) => ({ id: 'footprint-id', ...payload })),
}));

const express = require('express');
const request = require('supertest');
const { uploadToCloudinary } = require('../middleware/upload');
const footprintService = require('../services/FootprintService');

describe('POST /api/checkin middleware order', () => {
  const app = express();
  app.use('/api', require('../routes/api'));

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('rejects forbidden multipart fields before uploading the file', async () => {
    const response = await request(app)
      .post('/api/checkin')
      .field('lat', '31.23')
      .field('lng', '121.47')
      .field('precise', 'false')
      .field('countryCode', 'CN')
      .attach('photo', Buffer.from('photo-bytes'), 'checkin.jpg');

    expect(response.status).toBe(400);
    expect(uploadToCloudinary).not.toHaveBeenCalled();
    expect(footprintService.create).not.toHaveBeenCalled();
  });

  test('uploads a valid multipart file and reaches the handler with normalized values', async () => {
    const response = await request(app)
      .post('/api/checkin')
      .field('lat', '31.23')
      .field('lng', '121.47')
      .field('message', 'hello')
      .field('mood', 'calm')
      .field('precise', 'false')
      .attach('photo', Buffer.from('photo-bytes'), 'checkin.jpg');

    expect(response.status).toBe(201);
    expect(uploadToCloudinary).toHaveBeenCalledTimes(1);
    expect(uploadToCloudinary.mock.calls[0][0].file).toMatchObject({
      originalname: 'checkin.jpg',
    });
    expect(footprintService.create).toHaveBeenCalledWith('user-id', {
      lat: 31.23,
      lng: 121.47,
      message: 'hello',
      mood: 'calm',
      precise: false,
      photoUrl: 'https://cloudinary.test/checkin.jpg',
    }, { isAdmin: false });
  });
});
