// backend/src/models/store.js
const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, '..', '..', 'recordings.json');
const UPLOAD_ROOT = process.env.UPLOAD_ROOT || path.join(__dirname, '..', '..', 'uploads');

function ensureFile() {
  if (!fs.existsSync(DATA_FILE)) {
    const init = { sessions: {}, uploads: [], tokens: [] };
    fs.writeFileSync(DATA_FILE, JSON.stringify(init, null, 2));
  } else {
    // ensure tokens exists (backward compat)
    try {
      const raw = fs.readFileSync(DATA_FILE, 'utf8') || '';
      const parsed = raw ? JSON.parse(raw) : {};
      if (!parsed.tokens) {
        parsed.tokens = [];
        fs.writeFileSync(DATA_FILE, JSON.stringify(parsed, null, 2));
      }
    } catch (e) {
      // If parse fails, reinitialize to safe shape (best-effort)
      const init = { sessions: {}, uploads: [], tokens: [] };
      fs.writeFileSync(DATA_FILE, JSON.stringify(init, null, 2));
    }
  }
}

function readStore() {
  ensureFile();
  const raw = fs.readFileSync(DATA_FILE, 'utf8');
  return JSON.parse(raw);
}

function writeStore(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// Validate session id format
function isValidSessionIdFormat(id) {
  return typeof id === 'string' && /^sess_[a-zA-Z0-9_]+$/.test(id);
}

// Create session (unchanged behavior mostly)
function createSession(candidate) {
  const data = readStore();

  const sessionId =
    'sess_' +
    Date.now().toString(36) +
    '_' +
    Math.random().toString(36).slice(2, 8);

  const session = {
    sessionId,
    candidate: candidate || null,
    startedAt: new Date().toISOString(),
    endedAt: null,
    answers: [],
    metadata: {}
    // NOTE: folderName/folderPath/timeZone can be persisted via updateSession()
  };

  data.sessions[sessionId] = session;
  writeStore(data);
  return session;
}

function getSession(sessionId) {
  const data = readStore();
  return data.sessions[sessionId] || null;
}

/**
 * updateSession(sessionId, updates)
 * Merges updates into session and persists (use for storing folderName, folderPath, timeZone, maxQuestions, etc.)
 */
function updateSession(sessionId, updates = {}) {
  if (!sessionId) return null;
  const data = readStore();
  const session = data.sessions[sessionId];
  if (!session) return null;

  // shallow merge allowed keys
  const allowedKeys = ['folderName', 'folderPath', 'timeZone', 'maxQuestions', 'metadata', 'candidate'];
  for (const k of Object.keys(updates)) {
    if (allowedKeys.includes(k)) {
      session[k] = updates[k];
    } else {
      // also allow arbitrary metadata under metadata key
      if (k === 'metadata' && typeof updates[k] === 'object') {
        session.metadata = Object.assign({}, session.metadata || {}, updates[k]);
      }
    }
  }

  data.sessions[sessionId] = session;
  writeStore(data);
  return session;
}

/**
 * appendUpload(upload)
 * - Ensures data.uploads does not contain duplicates for same sessionId+question (replaces existing)
 * - Updates sessions[sessionId].answers: replace existing question record or push new
 */
function appendUpload(upload) {
  if (!upload || !upload.sessionId) throw new Error('upload requires sessionId');

  const data = readStore();

  // normalize upload fields
  const record = {
    filename: upload.filename,
    sessionId: upload.sessionId,
    question: Number(upload.question),
    size: Number(upload.size) || 0,
    uploadedAt: upload.uploadedAt || new Date().toISOString(),
    timeZone: upload.timeZone || null,
    folderName: upload.folderName || null
  };

  // replace or insert into data.uploads (idempotent by sessionId+question)
  const existingIndex = data.uploads.findIndex(u => {
    return u.sessionId === record.sessionId && Number(u.question) === Number(record.question);
  });

  if (existingIndex >= 0) {
    data.uploads[existingIndex] = record;
  } else {
    data.uploads.push(record);
  }

  // ensure session exists and answers updated
  if (data.sessions[record.sessionId]) {
    if (!Array.isArray(data.sessions[record.sessionId].answers)) {
      data.sessions[record.sessionId].answers = [];
    }

    const ansIndex = data.sessions[record.sessionId].answers.findIndex(a => {
      if (a && typeof a === 'object' && 'question' in a) return Number(a.question) === Number(record.question);
      if (typeof a === 'number') return Number(a) === Number(record.question);
      return false;
    });

    const answerRecord = {
      question: record.question,
      filename: record.filename,
      size: record.size,
      uploadedAt: record.uploadedAt
    };

    if (ansIndex >= 0) {
      data.sessions[record.sessionId].answers[ansIndex] = answerRecord;
    } else {
      data.sessions[record.sessionId].answers.push(answerRecord);
    }
  }

  writeStore(data);
  return record;
}

/**
 * endSession(sessionId)
 * - sets endedAt
 * - writes metadata.json into session.folderPath (if exists) or fallback into uploads/<folderName>
 * - returns session or null
 */
function endSession(sessionId) {
  const data = readStore();
  const session = data.sessions[sessionId];

  if (!session) return null;

  session.endedAt = new Date().toISOString();
  data.sessions[sessionId] = session;

  writeStore(data);

  // build metadata object and write to filesystem
  try {
    // determine folder path
    let folderPath = session.folderPath;
    if (!folderPath) {
      // fallback: use session.folderName under UPLOAD_ROOT
      const folderName = session.folderName || `${session.startedAt ? session.startedAt.replace(/[:.]/g, "_") : session.sessionId}`;
      folderPath = path.join(UPLOAD_ROOT, folderName);
    }

    // ensure dir exists
    if (!fs.existsSync(folderPath)) fs.mkdirSync(folderPath, { recursive: true });

    // collect receivedQuestions and videoFiles from session.answers (or data.uploads)
    const receivedQuestions = Array.isArray(session.answers)
      ? session.answers.map(a => (typeof a === 'object' ? a.question : a))
      : [];

    // videoFiles: map from data.uploads filtered by sessionId and order by question asc
    const uploadsForSession = (data.uploads || []).filter(u => u.sessionId === sessionId);
    uploadsForSession.sort((a, b) => Number(a.question) - Number(b.question));
    const videoFiles = uploadsForSession.map(u => ({
      fileName: u.filename,
      uploadedAt: u.uploadedAt,
      sizeBytes: u.size
    }));

    const metadata = {
      sessionId: session.sessionId,
      userName: session.candidate || null,
      timeZone: session.timeZone || null,
      folderName: session.folderName || path.basename(folderPath),
      startedAt: session.startedAt || null,
      endedAt: session.endedAt || null,
      uploadedAt: new Date().toISOString(),
      receivedQuestions,
      videoFiles,
      completed: true,
      browserInfo: session.metadata && session.metadata.browserInfo ? session.metadata.browserInfo : null
    };

    const metaPath = path.join(folderPath, 'metadata.json');
    const tmpMetaPath = metaPath + '.tmp';
    fs.writeFileSync(tmpMetaPath, JSON.stringify(metadata, null, 2));
    fs.renameSync(tmpMetaPath, metaPath);
  } catch (e) {
    // non-fatal: metadata write failure should not break endSession
    console.error('Warning: failed to write metadata.json on endSession:', e);
  }

  return session;
}

/**
 * Token helpers (file-backed)
 * - tokens stored as array of { token: "1124...", used: false, expiresAt: "ISO"|null }
 * - verifyAndMarkToken(token): checks presence & not used & not expired, marks used = true atomically (writeStore)
 * - addToken(token, expiresAt): helper to insert test tokens
 */
function verifyAndMarkToken(token) {
  if (!token || typeof token !== 'string') return { valid: false, reason: 'NO_TOKEN' };
  const data = readStore();
  data.tokens = data.tokens || [];

  const idx = data.tokens.findIndex(t => t.token === token);
  if (idx === -1) return { valid: false, reason: 'TOKEN_NOT_FOUND' };

  const record = data.tokens[idx];
  if (record.used) return { valid: false, reason: 'TOKEN_ALREADY_USED' };

  if (record.expiresAt) {
    const exp = new Date(record.expiresAt);
    if (isNaN(exp.getTime()) === false && exp < new Date()) {
      return { valid: false, reason: 'TOKEN_EXPIRED' };
    }
  }

  // mark used and write
  data.tokens[idx] = Object.assign({}, record, { used: true, usedAt: new Date().toISOString() });
  writeStore(data);
  return { valid: true, token: data.tokens[idx] };
}

function addToken(token, expiresAt = null) {
  if (!token || typeof token !== 'string') throw new Error('token string required');
  const data = readStore();
  data.tokens = data.tokens || [];
  // avoid duplicate tokens
  if (data.tokens.find(t => t.token === token)) return data.tokens.find(t => t.token === token);
  const rec = { token, used: false, expiresAt: expiresAt || null, createdAt: new Date().toISOString() };
  data.tokens.push(rec);
  writeStore(data);
  return rec;
}

module.exports = {
  createSession,
  getSession,
  endSession,
  isValidSessionIdFormat,
  readStore,
  writeStore,
  appendUpload,
  updateSession,
  verifyAndMarkToken,
  addToken
};
