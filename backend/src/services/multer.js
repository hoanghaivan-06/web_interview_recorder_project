// backend/src/services/multer.js
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const TMP_DIR = path.join(__dirname, '..', '..', 'tmp_uploads');

// ensure tmp dir exists
if (!fs.existsSync(TMP_DIR)) {
  fs.mkdirSync(TMP_DIR, { recursive: true });
}

// max file size (bytes)
const maxSize = Number(process.env.MAX_FILE_SIZE || 200000000);

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, TMP_DIR);
  },
  filename: (req, file, cb) => {
    // sanitize original name
    const safe = (file.originalname || '')
      .replace(/[^\w.\-]+/g, '_')  
      .slice(0, 80);

    // timestamp prefix to avoid collisions
    cb(null, `${Date.now()}_${safe}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: maxSize }
});

module.exports = { upload };
