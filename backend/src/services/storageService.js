const multer = require('multer');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const uploadDir = process.env.UPLOAD_DIR || 'uploads';
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const sessionId = req.body.sessionId || 'unknown-session';
        const question = req.body.question || '0';
        const timestamp = Date.now();
        
        const filename = `${sessionId}_q${question}_${timestamp}.webm`;
        cb(null, filename);
    }
});

const upload = multer({ storage: storage });

module.exports = upload;
