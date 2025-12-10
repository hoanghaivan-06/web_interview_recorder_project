// backend/src/controllers/sessionController.js

const fs = require("fs");
const path = require("path");

const {
  createSession,
  getSession,
  endSession,
  isValidSessionIdFormat,
  updateSession
} = require("../models/store");

// -------------------------------
// TOKEN FORMAT CHECK (simple version)
// -------------------------------
function isValidTokenFormat(token) {
  if (!token || typeof token !== "string") return false;
  // Format: 1124xxxx (4 digits). If you want variable length → change \d{4} to \d+
  return /^1124\d{4}$/.test(token.trim());
}

// -------------------------------
// TIMEZONE FOLDER FORMAT
// -------------------------------
function formatFolderNameForTZ(date = new Date(), tz = "Asia/Bangkok") {
  const dtf = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });

  const parts = dtf.formatToParts(date).reduce((acc, p) => {
    acc[p.type] = p.value;
    return acc;
  }, {});

  return {
    DD: parts.day,
    MM: parts.month,
    YYYY: parts.year,
    HH: parts.hour,
    mm: parts.minute
  };
}

function sanitizeNameForFolder(name = "") {
  if (!name || typeof name !== "string") return "unknown";
  const ascii = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9 _-]/g, "");
  const compact = ascii.trim().replace(/\s+/g, "_");
  return compact.slice(0, 30) || "unknown";
}

// -------------------------------
// POST /api/session/start
// -------------------------------
function startSession(req, res) {
  try {
    const { candidate, token } = req.body || {};

    // 1) Token format check
    if (!isValidTokenFormat(token)) {
      return res.status(401).json({
        ok: false,
        message: "INVALID_TOKEN_FORMAT"
      });
    }

    const cleanName =
      typeof candidate === "string" ? candidate.trim().slice(0, 200) : null;

    // Create blank session in store
    const session = createSession(cleanName);

    // -------------------------------
    // 2) CREATE FOLDER
    // -------------------------------
    try {
      const tz = "Asia/Bangkok";
      const { DD, MM, YYYY, HH, mm } = formatFolderNameForTZ(new Date(), tz);
      const safeName = sanitizeNameForFolder(cleanName);
      const folderName = `${DD}_${MM}_${YYYY}_${HH}_${mm}_${safeName}`;

      const uploadRoot =
        process.env.UPLOAD_ROOT ||
        path.join(__dirname, "../../uploads");

      const folderPath = path.join(uploadRoot, folderName);

      // ensure create
      fs.mkdirSync(folderPath, { recursive: true });

      // Save folder info into session object
      session.folderName = folderName;
      session.folderPath = folderPath;
      session.timeZone = tz;

      // -------------------------------
      // 3) PERSIST folder info in store.json
      // -------------------------------
      updateSession(session.sessionId, {
        folderName,
        folderPath,
        timeZone: tz,
        maxQuestions: 5
      });

      // -------------------------------
      // 4) CREATE INITIAL metadata.json
      // -------------------------------
      const metadata = {
        sessionId: session.sessionId,
        userName: cleanName || null,
        timeZone: tz,
        folderName,
        receivedQuestions: [],
        videoFiles: [],
        startedAt: session.startedAt || new Date().toISOString(),
        completed: false
      };

      const metaFile = path.join(folderPath, "metadata.json");
      const tmp = metaFile + ".tmp";
      fs.writeFileSync(tmp, JSON.stringify(metadata, null, 2));
      fs.renameSync(tmp, metaFile);
    } catch (errFolder) {
      console.error("Warning: Failed to create session folder:", errFolder);
    }

    return res.status(200).json({
      ok: true,
      sessionId: session.sessionId,
      startedAt: session.startedAt,
      folderName: session.folderName || null
    });
  } catch (err) {
    console.error("Error creating session:", err);
    return res.status(500).json({
      ok: false,
      message: "Cannot create session"
    });
  }
}

// -------------------------------
// GET /api/session/:id
// -------------------------------
function getSessionStatus(req, res) {
  const { id } = req.params;

  if (!isValidSessionIdFormat(id)) {
    return res.status(400).json({
      ok: false,
      message: "INVALID_SESSION_ID_FORMAT"
    });
  }

  const session = getSession(id);
  if (!session) {
    return res.status(404).json({
      ok: false,
      message: "SESSION_NOT_FOUND"
    });
  }

  const answeredNumbers = Array.isArray(session.answers)
    ? Array.from(
        new Set(
          session.answers
            .map((a) => Number(a.question))
            .filter((n) => Number.isInteger(n) && n >= 1)
        )
      )
    : [];

  return res.status(200).json({
    ok: true,
    session: {
      sessionId: session.sessionId,
      candidate: session.candidate || null,
      startedAt: session.startedAt,
      endedAt: session.endedAt,
      finished: !!session.endedAt,
      answered: answeredNumbers,
      metadata: session.metadata || {}
    }
  });
}

// -------------------------------
// POST /api/session/end
// -------------------------------
function endSessionController(req, res) {
  const { sessionId } = req.body || {};

  if (!sessionId) {
    return res.status(400).json({
      ok: false,
      message: "SESSION_ID_REQUIRED"
    });
  }

  if (!isValidSessionIdFormat(sessionId)) {
    return res.status(400).json({
      ok: false,
      message: "INVALID_SESSION_ID_FORMAT"
    });
  }

  const session = endSession(sessionId);
  if (!session) {
    return res.status(404).json({
      ok: false,
      message: "SESSION_NOT_FOUND"
    });
  }

  return res.status(200).json({
    ok: true,
    sessionId: session.sessionId,
    startedAt: session.startedAt,
    endedAt: session.endedAt
  });
}

module.exports = {
  startSession,
  getSessionStatus,
  endSessionController
};
