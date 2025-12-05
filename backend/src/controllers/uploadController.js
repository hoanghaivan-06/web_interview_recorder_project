const fs = require("fs");
const path = require("path");
const store = require("../models/store");

const UPLOAD_DIR = process.env.UPLOAD_DIR || "uploads/";

// đảm bảo thư mục uploads tồn tại
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

    // generate final filename
    const timestamp = Date.now();
    const ext = path.extname(file.originalname) || ".webm";
    const finalFilename = `${sessionId}_q${question}_${timestamp}${ext}`;
    const finalPath = path.join(UPLOAD_DIR, finalFilename);

    // move file
    fs.renameSync(file.path, finalPath);

    const uploadMeta = {
      filename: finalFilename,
      sessionId,
      question: Number(question),
      size: file.size,
      uploadedAt: new Date().toISOString()
    };

    // Lưu vào recordings.json
    store.appendUpload(uploadMeta);

    // trả đúng API.md
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
