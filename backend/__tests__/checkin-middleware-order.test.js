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
  adminSetupLimiter: (_req, _res, next) => next(),
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
  comment: jest.fn(async (_footprintId, _userId, _userName, _content, ip) => ({
    footprint: { id: 'footprint-id', commentIp: ip },
  })),
}));

const express = require('express');
const request = require('supertest');
const { uploadToCloudinary } = require('../middleware/upload');
const footprintService = require('../services/FootprintService');

describe('POST /api/checkin middleware order', () => {
  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json());
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
      visibility: undefined,
      locationPrecision: undefined,
      photoUrl: 'https://cloudinary.test/checkin.jpg',
    }, { isAdmin: false });
  });

  test('forwards validated publication privacy fields to the service', async () => {
    const response = await request(app)
      .post('/api/checkin')
      .field('lat', '31.23')
      .field('lng', '121.47')
      .field('visibility', 'private')
      .field('locationPrecision', 'precise');

    expect(response.status).toBe(201);
    expect(footprintService.create).toHaveBeenCalledWith('user-id', expect.objectContaining({
      visibility: 'private',
      locationPrecision: 'precise',
    }), { isAdmin: false });
  });

  test('stores the Express-resolved rightmost client IP for comments', async () => {
    const response = await request(app)
      .post('/api/footprints/footprint-id/comment')
      .set('X-Forwarded-For', '203.0.113.43, 198.51.100.43')
      .send({ content: 'hello' });

    expect(response.status).toBe(201);
    expect(footprintService.comment).toHaveBeenCalledWith(
      'footprint-id',
      'user-id',
      'publisher',
      'hello',
      '198.51.100.43',
      expect.objectContaining({ viewer: expect.any(Object) }),
    );
  });
});
