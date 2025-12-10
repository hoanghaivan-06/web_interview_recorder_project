// backend/src/middleware/validate.js
const fs = require('fs');
const path = require('path');
const store = require('../models/store'); // ĐÚNG đường dẫn tới store.js

const MAX_FILE_SIZE_DEFAULT = 200000000; // fallback nếu env không có
const DEFAULT_MAX_QUESTIONS = Number(process.env.MAX_QUESTIONS || 20);
const UPLOAD_DIR_FALLBACK = process.env.UPLOAD_DIR || path.join(__dirname, '../../uploads');

const acceptedMimes = ['video/webm', 'video/mp4'];

/**
 * helper: cleanup tmp file if exists
 */
function cleanupTmp(file) {
  try {
    if (file && file.path && fs.existsSync(file.path)) {
      fs.unlinkSync(file.path);
    }
  } catch (e) {
    // ignore
  }
}

/**
 * Extract extension from originalname (lowercase), default .webm
 */
function getExtFromOriginalName(originalName) {
  try {
    const ext = path.extname(originalName || '').toLowerCase();
    if (ext) return ext;
  } catch (e) {}
  return '.webm';
}

const validateUpload = (req, res, next) => {
  try {
    const file = req.file;
    // sessionId có thể truyền qua body hoặc header
    let sessionId =
      (req.body && req.body.sessionId) ||
      req.headers['x-session-id'] ||
      req.headers['x-sessionid'] ||
      null;
    if (typeof sessionId === 'string') sessionId = sessionId.trim();

    const questionRaw = req.body && req.body.question;
    const question = Number(questionRaw);

    const MAX_SIZE = Number(process.env.MAX_FILE_SIZE || MAX_FILE_SIZE_DEFAULT);

    // 1) Check sessionId tồn tại
    if (!sessionId) {
      cleanupTmp(file);
      return res.status(400).json({ ok: false, message: 'sessionId required' });
    }

    // 2) Check sessionId đúng format (dùng store.isValidSessionIdFormat)
    if (!store.isValidSessionIdFormat(sessionId)) {
      cleanupTmp(file);
      return res.status(400).json({ ok: false, message: 'INVALID_SESSION_ID_FORMAT' });
    }

    // 3) Check file tồn tại
    if (!file) {
      return res.status(400).json({ ok: false, message: 'file required' });
    }

    // 4) Check session có tồn tại
    const session = store.getSession(sessionId);
    if (!session) {
      cleanupTmp(file);
      return res.status(400).json({ ok: false, message: 'SESSION_NOT_FOUND' });
    }
    if (session.endedAt) {
      cleanupTmp(file);
      return res.status(410).json({ ok: false, message: 'SESSION_ALREADY_FINISHED' });
    }

    // 5) Determine max questions: prefer session.maxQuestions, fallback env or default
    const maxQuestions =
      (session && Number.isInteger(Number(session.maxQuestions)) && Number(session.maxQuestions)) ||
      DEFAULT_MAX_QUESTIONS;

    if (!Number.isInteger(question) || question < 1 || question > maxQuestions) {
      cleanupTmp(file);
      return res.status(400).json({
        ok: false,
        message: `Invalid question (must be integer 1..${maxQuestions})`
      });
    }

    // 6) Check MIME type
    if (!acceptedMimes.includes(file.mimetype)) {
      cleanupTmp(file);
      return res.status(400).json({
        ok: false,
        message: `Unsupported file type. Allowed: ${acceptedMimes.join(', ')}`
      });
    }

    // 7) Check kích thước file
    if (file.size > MAX_SIZE) {
      cleanupTmp(file);
      return res.status(413).json({
        ok: false,
        message: `File too large (${(file.size / 1_000_000).toFixed(2)}MB). Max ${(MAX_SIZE / 1_000_000).toFixed(1)}MB`
      });
    }

    // 8) (Optional) check extension roughly matches mimetype
    const ext = getExtFromOriginalName(file.originalname);
    if (file.mimetype === 'video/webm' && ext !== '.webm') {
      // không bắt buộc fail, nhưng warn — để đơn giản ta cho phép nhưng chuẩn hóa tên
      // (nếu muốn block, uncomment cleanupTmp + return error)
      // cleanupTmp(file);
      // return res.status(400).json({ ok:false, message: 'File extension must be .webm for video/webm' });
    }

    // 9) Prepare destination dir and final filename for uploadController
    const destDir = session.folderPath || UPLOAD_DIR_FALLBACK;
    const safeExt = (ext === '.mp4' || ext === '.webm') ? ext : '.webm';
    const finalFilename = `Q${question}${safeExt}`;

    // attach validated data for uploadController
    req.validated = {
      sessionId,
      question,
      file,
      destDir,
      finalFilename,
      // include some session info to help later handlers
      sessionMeta: {
        folderName: session.folderName || null,
        timeZone: session.timeZone || null,
        maxQuestions
      }
    };

    return next();
  } catch (err) {
    console.error('validateUpload error:', err);
    // try cleanup
    try { cleanupTmp(req.file); } catch (e) {}
    return res.status(500).json({ ok: false, message: 'Internal server error' });
  }
};

module.exports = { validateUpload };
