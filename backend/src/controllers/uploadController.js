// backend/src/controllers/uploadController.js
const fs = require("fs");
const path = require("path");
const store = require("../models/store");

const UPLOAD_DIR = process.env.UPLOAD_DIR || "uploads/";
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

exports.uploadHandler = (req, res) => {
  try {
    const file = req.file;
    const { sessionId, question } = req.body;

    if (!file) {
      return res.status(400).json({ ok: false, message: "File required" });
    }

    // Kiểm tra session tồn tại và chưa ended
    const session = store.getSession(sessionId);
    if (!session) {
      // cleanup tmp file
      if (file && file.path && fs.existsSync(file.path)) fs.unlinkSync(file.path);
      return res.status(400).json({ ok: false, message: "SESSION_NOT_FOUND" });
    }

    if (session.endedAt) {
      // session đã kết thúc -> reject upload
      if (file && file.path && fs.existsSync(file.path)) fs.unlinkSync(file.path);
      return res.status(410).json({ ok: false, message: "SESSION_ALREADY_FINISHED" });
    }

    // Tạo file name chuẩn
    const timestamp = Date.now();
    const ext = path.extname(file.originalname) || ".webm";
    const finalFilename = `${sessionId}_q${question}_${timestamp}${ext}`;
    const finalPath = path.join(UPLOAD_DIR, finalFilename);

    // Move file từ tmp → uploads
    try {
      fs.renameSync(file.path, finalPath);
    } catch (err) {
      if (fs.existsSync(file.path)) {
        fs.unlinkSync(file.path);
      }
      throw err;
    }

    // metadata lưu trong recordings.json
    const uploadMeta = {
      filename: finalFilename,
      sessionId,
      question: Number(question),
      size: file.size,
      uploadedAt: new Date().toISOString()
    };

    // Lưu metadata (store.appendUpload sẽ cập nhật session.answers)
    store.appendUpload(uploadMeta);

    // Trả đúng format
    return res.status(200).json({
      ok: true,
      filename: finalFilename,
      sessionId,
      question: Number(question),
      size: file.size,
      uploadedAt: uploadMeta.uploadedAt
    });

  } catch (err) {
    console.error("Upload error:", err);
    return res.status(500).json({
      ok: false,
      message: "Upload failed"
    });
  }
};
