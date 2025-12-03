const fs = require("fs");
const path = require("path");

const DATA_FILE = path.join(__dirname, "..", "..", "recordings.json");

// đảm bảo recordings.json tồn tại
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

// ===============================
//      API CHO CONTROLLER
// ===============================

// format sessionId giống kiểu: sess_ab12cd
function isValidSessionIdFormat(id) {
  return typeof id === "string" && /^sess_[a-zA-Z0-9_]+$/.test(id);
}

// tạo session
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

// lấy session
function getSession(sessionId) {
  const data = readStore();
  return data.sessions[sessionId] || null;
}

// kết thúc session
function endSession(sessionId) {
  const data = readStore();
  const session = data.sessions[sessionId];

  if (!session) return null;

  session.endedAt = new Date().toISOString();
  data.sessions[sessionId] = session;

  writeStore(data);
  return session;
}

module.exports = {
  createSession,
  getSession,
  endSession,
  isValidSessionIdFormat
};
