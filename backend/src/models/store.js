const fs = require("fs");
const path = require("path");

const DATA_FILE = path.join(__dirname, "..", "..", "recordings.json");


function ensureFile() {
  if (!fs.existsSync(DATA_FILE)) {
    const init = { sessions: {}, uploads: [] };
    fs.writeFileSync(DATA_FILE, JSON.stringify(init, null, 2));
  }
}

function readStore() {
  ensureFile();
  const raw = fs.readFileSync(DATA_FILE, "utf8");
  return JSON.parse(raw);
}

function writeStore(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}


function isValidSessionIdFormat(id) {
  return typeof id === "string" && /^sess_[a-zA-Z0-9_]+$/.test(id);
}


function createSession(candidate) {
  const data = readStore();

  const sessionId =
    "sess_" +
    Date.now().toString(36) +
    "_" +
    Math.random().toString(36).slice(2, 8);

  const session = {
    sessionId,
    candidate: candidate || null,
    startedAt: new Date().toISOString(),
    endedAt: null,
    answers: [],
    metadata: {}
  };

  data.sessions[sessionId] = session;
  writeStore(data);

  return session;
}


function getSession(sessionId) {
  const data = readStore();
  return data.sessions[sessionId] || null;
}


function endSession(sessionId) {
  const data = readStore();
  const session = data.sessions[sessionId];

  if (!session) return null;

  session.endedAt = new Date().toISOString();
  data.sessions[sessionId] = session;

  writeStore(data);
  return session;
}


function appendUpload(upload) {
  const data = readStore();
  data.uploads.push(upload);

  if (data.sessions[upload.sessionId]) {
    // ensure answers array exists
    if (!Array.isArray(data.sessions[upload.sessionId].answers)) {
      data.sessions[upload.sessionId].answers = [];
    }

    // if already answered that question, replace the record or ignore
    const existingIndex = data.sessions[upload.sessionId].answers.findIndex(a => {
      if (a && typeof a === 'object' && 'question' in a) return Number(a.question) === Number(upload.question);
      if (typeof a === 'number') return Number(a) === Number(upload.question);
      return false;
    });

    const record = {
      question: upload.question,
      filename: upload.filename,
      size: upload.size,
      uploadedAt: upload.uploadedAt
    };

    if (existingIndex >= 0) {
      // replace previous record for that question
      data.sessions[upload.sessionId].answers[existingIndex] = record;
    } else {
      data.sessions[upload.sessionId].answers.push(record);
    }
  }

  writeStore(data);
}


module.exports = {
  createSession,
  getSession,
  endSession,
  isValidSessionIdFormat,
  readStore,
  writeStore,
  appendUpload
};
