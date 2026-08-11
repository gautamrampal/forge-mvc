const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const { fileTypeFromFile } = require('file-type');

const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, '..', '..', 'storage', 'uploads');
const MAX_FILE_SIZE_MB = Number(process.env.MAX_FILE_SIZE_MB) || 10;

const MIME_EXT_MAP = {
  'image/jpeg': ['jpg', 'jpeg'],
  'image/png': ['png'],
  'image/gif': ['gif'],
  'image/webp': ['webp'],
  'application/pdf': ['pdf'],
  'application/zip': ['zip'],
  'application/msword': ['doc'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['docx'],
  'application/vnd.ms-excel': ['xls'],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['xlsx'],
};
const NO_SIGNATURE_EXTENSIONS = ['csv', 'txt', 'log'];

function todaySubdir() {
  const now = new Date();
  return path.join(String(now.getFullYear()), String(now.getMonth() + 1).padStart(2, '0'));
}

// Never trust the client-supplied extension or Content-Type alone — inspect the actual file
// signature (magic bytes) and cross-check it against the claimed extension.
async function validateSignature(absPath, originalName) {
  const ext = path.extname(originalName).slice(1).toLowerCase();
  if (NO_SIGNATURE_EXTENSIONS.includes(ext)) return true;
  const detected = await fileTypeFromFile(absPath);
  if (!detected) return false;
  const allowed = MIME_EXT_MAP[detected.mime];
  return !!allowed && allowed.includes(ext);
}

// createUploader({ allowedExt, maxFiles, maxFileSizeMB }) -> a configured multer instance.
// Files land under storage/uploads/<year>/<month>/<uuid>.<ext> — outside the web root, never
// served by a static route. Serve them only through an authenticated download controller that
// checks the requester actually has access to the parent record (see TUTORIAL.md "Uploads").
function createUploader({ allowedExt = ['jpg', 'jpeg', 'png', 'pdf'], maxFiles = 5, maxFileSizeMB = MAX_FILE_SIZE_MB } = {}) {
  const storage = multer.diskStorage({
    destination: (req, file, cb) => {
      const subdir = todaySubdir();
      const abs = path.join(UPLOAD_DIR, subdir);
      fs.mkdirSync(abs, { recursive: true });
      req._uploadSubdir = subdir;
      cb(null, abs);
    },
    filename: (req, file, cb) => {
      cb(null, `${crypto.randomUUID()}${path.extname(file.originalname)}`);
    },
  });

  const fileFilter = (req, file, cb) => {
    const ext = path.extname(file.originalname).slice(1).toLowerCase();
    if (!allowedExt.includes(ext)) return cb(new Error(`File type .${ext} is not allowed.`));
    cb(null, true);
  };

  return multer({ storage, fileFilter, limits: { fileSize: maxFileSizeMB * 1024 * 1024, files: maxFiles } });
}

function relativeStoredPath(subdir, filename) {
  return path.join(subdir, filename).replace(/\\/g, '/');
}

function absolutePathFor(storedPath) {
  return path.join(UPLOAD_DIR, storedPath);
}

module.exports = { createUploader, validateSignature, relativeStoredPath, absolutePathFor, UPLOAD_DIR };
