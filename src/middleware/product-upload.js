import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import multer from 'multer';

const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
const previewUploadDirectory = path.resolve(moduleDirectory, '../../uploads/previews');

const imageExtensions = {
    'image/avif': '.avif',
    'image/gif': '.gif',
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
};

const productImageUpload = multer({
    storage: multer.diskStorage({
        destination(_req, _file, callback) {
            fs.mkdir(previewUploadDirectory, { recursive: true }, error => {
                callback(error, previewUploadDirectory);
            });
        },
        filename(req, file, callback) {
            const productId = req.product_id ?? req.params.id;
            if (!productId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(productId)) {
                const error = new Error('A valid product UUID is required to upload an image.');
                error.code = 'INVALID_PRODUCT_ID';
                callback(error);
                return;
            }
            callback(null, `${productId}${imageExtensions[file.mimetype]}`);
        },
    }),
    limits: { fileSize: 5 * 1024 * 1024, files: 1 },
    fileFilter(_req, file, callback) {
        if (!Object.hasOwn(imageExtensions, file.mimetype)) {
            const error = new Error('Only AVIF, GIF, JPEG, PNG, and WEBP images are allowed.');
            error.code = 'INVALID_PRODUCT_IMAGE';
            callback(error);
            return;
        }
        callback(null, true);
    },
});

export function uploadProductImage(req, res, next) {
    productImageUpload.single('image')(req, res, error => {
        if (!error) return next();

        if (error instanceof multer.MulterError ||
            error.code === 'INVALID_PRODUCT_IMAGE' ||
            error.code === 'INVALID_PRODUCT_ID') {
            return res.status(400).json({ error: error.message });
        }

        return next(error);
    });
}
