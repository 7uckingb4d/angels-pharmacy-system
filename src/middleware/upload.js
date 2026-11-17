// In-memory uploads (Vercel has no writable disk). Vercel request bodies max out at ~4.5 MB.
import multer from 'multer';

const LIMIT = 4 * 1024 * 1024;

export const IMAGE_TYPES = {
  'image/avif': 'avif', 'image/gif': 'gif', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp',
};
export const RX_TYPES = { ...IMAGE_TYPES, 'application/pdf': 'pdf' };
delete RX_TYPES['image/gif'];
delete RX_TYPES['image/avif'];

function makeUpload(types, message) {
  return multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: LIMIT, files: 1 },
    fileFilter(_req, file, cb) {
      if (Object.hasOwn(types, file.mimetype)) return cb(null, true);
      const err = new Error(message);
      err.code = 'INVALID_FILE_TYPE';
      cb(err);
    },
  });
}

export const productImageUpload = makeUpload(IMAGE_TYPES, 'Only AVIF, GIF, JPEG, PNG, and WEBP images are allowed.');
export const prescriptionUpload = makeUpload(RX_TYPES, 'Only JPG, PNG, WEBP, and PDF files are allowed.');
