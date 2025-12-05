// backend/src/middleware/validate.js
const store = require('../models/store'); // ĐÚNG đường dẫn tới store.js
const MAX_FILE_SIZE_DEFAULT = 200000000; // fallback nếu env không có

const validateUpload = (req, res, next) => {
  try {
    const file = req.file;
    const sessionId =
      (req.body && req.body.sessionId) ||
      req.headers['x-session-id'];

    const questionRaw = req.body && req.body.question;
    const question = Number(questionRaw);

    const MAX_SIZE = Number(process.env.MAX_FILE_SIZE || MAX_FILE_SIZE_DEFAULT);
    const acceptedMimes = ['video/webm', 'video/mp4'];

    // 1) Check sessionId tồn tại
    if (!sessionId) {
      return res.status(400).json({ ok: false, message: 'sessionId required' });
    }

    // 2) Check sessionId đúng format
    if (!store.isValidSessionIdFormat(sessionId)) {
      return res.status(400).json({ ok: false, message: 'INVALID_SESSION_ID_FORMAT' });
    }

    // 3) Check file tồn tại
    if (!file) {
      return res.status(400).json({ ok: false, message: 'file required' });
    }

    // 4) Check session có tồn tại
    const session = store.getSession(sessionId);
    if (!session) {
      return res.status(400).json({ ok: false, message: 'SESSION_NOT_FOUND' });
    }

    // 5) Check question đúng (1..5)
    if (!Number.isInteger(question) || question < 1 || question > 5) {
      return res.status(400).json({
        ok: false,
        message: 'Invalid question (must be integer 1..5)'
      });
    }

    // 6) Check MIME type
    if (!acceptedMimes.includes(file.mimetype)) {
      return res.status(400).json({
        ok: false,
        message: `Unsupported file type. Allowed: ${acceptedMimes.join(', ')}`
      });
    }

    // 7) Check kích thước file
    if (file.size > MAX_SIZE) {
      return res.status(413).json({
        ok: false,
        message: `File too large (${(file.size / 1_000_000).toFixed(2)}MB). Max ${(MAX_SIZE / 1_000_000).toFixed(1)}MB`
      });
    }

    // Nếu mọi thứ OK → tiếp tục
    req.validated = {
      sessionId,
      question,
      file
    };

    return next();
  } catch (err) {
    console.error('validateUpload error:', err);
    return res.status(500).json({ ok: false, message: 'Internal server error' });
  }
};

module.exports = { validateUpload };
