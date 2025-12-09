// backend/src/controllers/sessionController.js
const {
  createSession,
  getSession,
  endSession,
  isValidSessionIdFormat
} = require("../models/store");

// POST /api/session/start
function startSession(req, res) {
  try {
    const { candidate } = req.body || {};
    const session = createSession(
      typeof candidate === "string" ? candidate.trim().slice(0, 200) : null
    );

    return res.status(200).json({
      ok: true,
      sessionId: session.sessionId,
      startedAt: session.startedAt
    });
  } catch (err) {
    console.error("Error creating session:", err);
    return res.status(500).json({
      ok: false,
      message: "Cannot create session"
    });
  }
}

// GET /api/session/:id
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

  // prepare answeredNumbers as unique ints (avoid duplicates)
  const answeredNumbers = Array.isArray(session.answers)
    ? Array.from(
        new Set(
          session.answers
            .map((a) => Number(a.question))
            .filter((n) => Number.isInteger(n) && n >= 1)
        )
      )
    : [];

  const publicSession = {
    sessionId: session.sessionId,
    candidate: session.candidate || null,
    startedAt: session.startedAt,
    endedAt: session.endedAt,
    finished: !!session.endedAt,
    answered: answeredNumbers,
    metadata: session.metadata || {}
  };

  return res.status(200).json({
    ok: true,
    session: publicSession
  });
}

// POST /api/session/end
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
