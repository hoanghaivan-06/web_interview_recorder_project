const {
  createSession,
  getSession,
  endSession,
  isValidSessionIdFormat
} = require("../models/store");

async function startSession(req, res) {
  try {
    const { candidate } = req.body || {};

    const session = createSession(candidate);

    return res.status(200).json({
      ok: true,
      sessionId: session.id,
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

async function getSessionStatus(req, res) {
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

  return res.status(200).json({
    ok: true,
    session
  });
}

async function endSessionController(req, res) {
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
    sessionId: session.id,
    startedAt: session.startedAt,
    endedAt: session.endedAt
  });
}

module.exports = {
  startSession,
  getSessionStatus,
  endSessionController
};
