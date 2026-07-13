const cloudinary = require('cloudinary').v2;
const multer = require('multer');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
});

const uploadToCloudinary = (req, res, next) => {
  if (!req.file) return next();

  const uploadStream = cloudinary.uploader.upload_stream(
    { folder: process.env.CLOUDINARY_FOLDER || 'bliver_footprints' },
    (err, result) => {
      if (err) {
        console.error('Cloudinary upload failed');
        return res.status(500).json({ error: 'Upload failed' });
      }
      req.cloudinaryUrl = result.secure_url;
      next();
    }
  );

  uploadStream.end(req.file.buffer);
};

module.exports = { upload, uploadToCloudinary };
