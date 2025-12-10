// backend/src/controllers/uploadController.js
const fs = require("fs");
const path = require("path");
const { execFile } = require("child_process");
const store = require("../models/store");

const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, "../../uploads");
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

/**
 * Optional ffprobe check: if ffprobe-static is installed, use it to validate video stream.
 * If not installed or ffprobe fails, we silently skip the check (do not block upload).
 */
async function checkHasVideoStream(filePath) {
  try {
    // try to require ffprobe-static; if not installed, skip
    const ffprobeStatic = require("ffprobe-static");
    const ffprobePath = ffprobeStatic.path;
    return await new Promise((resolve, reject) => {
      // check if there's any video stream
      execFile(
        ffprobePath,
        [
          "-v",
          "error",
          "-select_streams",
          "v",
          "-show_entries",
          "stream=codec_type",
          "-of",
          "default=noprint_wrappers=1:nokey=1",
          filePath
        ],
        (err, stdout) => {
          if (err) return reject(err);
          if (stdout && stdout.trim().length > 0) return resolve(true);
          return reject(new Error("no video stream"));
        }
      );
    });
  } catch (e) {
    // ffprobe not available or check failed — do not block upload for now
    return true;
  }
}

exports.uploadHandler = async (req, res) => {
  try {
    const file = req.file;
    const { sessionId, question } = req.body || {};

    if (!file) {
      return res.status(400).json({ ok: false, message: "File required" });
    }

    if (!sessionId) {
      // cleanup tmp file
      if (file && file.path && fs.existsSync(file.path)) fs.unlinkSync(file.path);
      return res.status(400).json({ ok: false, message: "SESSION_ID_REQUIRED" });
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

    // validate question
    const qNum = Number(question);
    if (!Number.isInteger(qNum) || qNum < 1) {
      if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
      return res.status(400).json({ ok: false, message: "INVALID_QUESTION_NUMBER" });
    }

    // check size threshold (avoid 0-byte files)
    const size = file.size || 0;
    if (size < 1000) {
      if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
      return res.status(400).json({ ok: false, message: "FILE_TOO_SMALL" });
    }

    // Destination directory: prefer session.folderPath (created in startSession). Fallback to UPLOAD_DIR.
    const destDir = session.folderPath || UPLOAD_DIR;
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }

    // final file name: Q{n}.webm (preserve ext if not webm)
    const ext = path.extname(file.originalname) || ".webm";
    const safeExt = ext || ".webm";
    const finalFilename = `Q${qNum}${safeExt}`;
    const finalPath = path.join(destDir, finalFilename);

    // idempotency: nếu file đã tồn tại và size > 0 -> trả success (xóa tmp)
    if (fs.existsSync(finalPath)) {
      try {
        const stats = fs.statSync(finalPath);
        if (stats.size > 0) {
          // remove tmp uploaded file
          if (fs.existsSync(file.path)) {
            try { fs.unlinkSync(file.path); } catch (e) {}
          }

          // Update store metadata if needed (ensure at least one record exists)
          const uploadedAtExisting = new Date(stats.mtime).toISOString();
          const uploadMetaExisting = {
            filename: finalFilename,
            sessionId,
            question: qNum,
            size: stats.size,
            uploadedAt: uploadedAtExisting,
            timeZone: session.timeZone || null
          };
          // appendUpload should be idempotent in store implementation;
          // calling it again should not duplicate but ensures metadata present.
          try {
            store.appendUpload(uploadMetaExisting);
          } catch (e) {
            // ignore store append failure here, it's non-fatal for idempotent case
            console.warn("Warning: store.appendUpload during idempotent path failed", e);
          }

          return res.status(200).json({
            ok: true,
            filename: finalFilename,
            sessionId,
            question: qNum,
            size: stats.size,
            uploadedAt: uploadedAtExisting,
            message: "already_exists"
          });
        }
      } catch (e) {
        // If stat failed, proceed to move/overwrite
      }
    }

    // Optional: validate that uploaded file contains video stream (ffprobe)
    try {
      await checkHasVideoStream(file.path);
    } catch (e) {
      // If ffprobe says no video, delete tmp and return error
      if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
      return res.status(400).json({ ok: false, message: "INVALID_VIDEO_FILE" });
    }

    // Move file từ tmp → destDir (overwrite if file existed but size 0)
    try {
      // If a zero-byte file exists, remove it first
      if (fs.existsSync(finalPath)) {
        try { fs.unlinkSync(finalPath); } catch (e) {}
      }
      fs.renameSync(file.path, finalPath);
    } catch (err) {
      // fallback: try copy then unlink
      try {
        const data = fs.readFileSync(file.path);
        fs.writeFileSync(finalPath, data);
        fs.unlinkSync(file.path);
      } catch (err2) {
        // cleanup tmp
        if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
        console.error("Upload move/copy error:", err2);
        throw err2;
      }
    }

    // metadata lưu trong recordings.json / store.appendUpload sẽ cập nhật session.answers
    const uploadedAtIso = new Date().toISOString();
    const uploadMeta = {
      filename: finalFilename,
      sessionId,
      question: qNum,
      size,
      uploadedAt: uploadedAtIso,
      timeZone: session.timeZone || null,
      folderName: session.folderName || null
    };

    try {
      store.appendUpload(uploadMeta);
    } catch (e) {
      // Nếu store append lỗi, log nhưng vẫn trả success (file đã lưu)
      console.error("Warning: store.appendUpload failed:", e);
    }

    // Trả đúng format
    return res.status(200).json({
      ok: true,
      filename: finalFilename,
      sessionId,
      question: qNum,
      size,
      uploadedAt: uploadedAtIso
    });
  } catch (err) {
    console.error("Upload error:", err);
    // cleanup tmp file if exists
    try {
      if (req.file && req.file.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    } catch (e) {}
    return res.status(500).json({
      ok: false,
      message: "Upload failed"
    });
  }
};
