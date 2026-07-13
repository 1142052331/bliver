jest.mock('cloudinary', () => ({
  v2: {
    config: jest.fn(),
    uploader: { upload_stream: jest.fn() },
  },
}));

describe('Cloudinary upload middleware', () => {
  let cloudinary;
  let uploadToCloudinary;

  beforeEach(() => {
    jest.resetModules();
    cloudinary = require('cloudinary').v2;
    jest.clearAllMocks();
    process.env.CLOUDINARY_CLOUD_NAME = 'test-cloud';
    process.env.CLOUDINARY_API_KEY = 'test-key';
    process.env.CLOUDINARY_API_SECRET = 'test-secret';
    delete process.env.CLOUDINARY_FOLDER;
    ({ uploadToCloudinary } = require('../middleware/upload'));
  });

  test('uses CLOUDINARY_FOLDER when uploading a file', () => {
    process.env.CLOUDINARY_FOLDER = 'candidate-folder';
    cloudinary.uploader.upload_stream.mockImplementation((options, callback) => {
      callback(null, { secure_url: 'https://cdn.test/image.jpg' });
      return { end: jest.fn() };
    });
    const next = jest.fn();

    uploadToCloudinary({ file: { buffer: Buffer.from('image') } }, {}, next);

    expect(cloudinary.uploader.upload_stream).toHaveBeenCalledWith(
      expect.objectContaining({ folder: 'candidate-folder' }),
      expect.any(Function),
    );
    expect(next).toHaveBeenCalled();
  });

  test('returns a generic error without exposing provider details', () => {
    const providerSecret = 'provider-secret-value';
    const response = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    cloudinary.uploader.upload_stream.mockImplementation((_options, callback) => {
      callback(new Error(providerSecret));
      return { end: jest.fn() };
    });

    uploadToCloudinary({ file: { buffer: Buffer.from('image') } }, response, jest.fn());

    expect(response.status).toHaveBeenCalledWith(500);
    expect(response.json).toHaveBeenCalledWith({ error: 'Upload failed' });
    expect(consoleError.mock.calls.flat().join(' ')).not.toContain(providerSecret);
    consoleError.mockRestore();
  });
});
