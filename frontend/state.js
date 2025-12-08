// state.js
// Quản lý state cho app + persistence (localStorage) theo sessionId

export const QUESTIONS = [
  { id: 1, text: "Câu 1" },
  { id: 2, text: "Câu 2" },
  { id: 3, text: "Câu 3" },
  { id: 4, text: "Câu 4" }
];

const DEFAULT_STATE = {
  currentQuestion: 1,
  answered: [] // lưu dưới dạng mảng để dễ serialize
};

const STORAGE_KEY_PREFIX = "ivr_state_"; // lưu theo sessionId => ivr_state_<sessionId>

let _internal = {
  currentQuestion: DEFAULT_STATE.currentQuestion,
  answered: [] // mảng số
};

function storageKey(sessionId) {
  return `${STORAGE_KEY_PREFIX}${sessionId || "default"}`;
}

/**
 * initStateFromStorage(sessionId)
 * - Thử load state (currentQuestion, answered, uploadedMap) từ localStorage.
 * - Trả về object { uploadedMap } (uploadedMap có thể undefined nếu không có).
 */
export function initStateFromStorage(sessionId) {
  try {
    const raw = localStorage.getItem(storageKey(sessionId));
    if (!raw) {
      _internal = { ...DEFAULT_STATE, answered: [] };
      return { uploadedMap: {} };
    }
    const parsed = JSON.parse(raw);
    _internal = {
      currentQuestion:
        typeof parsed.currentQuestion === "number"
          ? parsed.currentQuestion
          : DEFAULT_STATE.currentQuestion,
      answered: Array.isArray(parsed.answered) ? parsed.answered : []
    };
    const uploadedMap = parsed.uploadedMap && typeof parsed.uploadedMap === "object"
      ? parsed.uploadedMap
      : {};
    return { uploadedMap };
  } catch (e) {
    console.warn("initStateFromStorage error", e);
    _internal = { ...DEFAULT_STATE, answered: [] };
    return { uploadedMap: {} };
  }
}

/**
 * saveStateToStorage(sessionId, extra = { uploadedMap })
 * - Lưu currentQuestion, answered, uploadedMap vào localStorage
 */
export function saveStateToStorage(sessionId, extra = {}) {
  try {
    const payload = {
      currentQuestion: _internal.currentQuestion,
      answered: Array.isArray(_internal.answered) ? _internal.answered : [],
      uploadedMap: extra.uploadedMap || {}
    };
    localStorage.setItem(storageKey(sessionId), JSON.stringify(payload));
  } catch (e) {
    console.warn("saveStateToStorage error", e);
  }
}

// Public API (tương tự API cũ)
export const state = {
  get currentQuestion() {
    return _internal.currentQuestion;
  },
  get totalQuestions() {
    return QUESTIONS.length;
  },
  get answered() {
    return Array.from(_internal.answered);
  }
};

export function getSnapshot() {
  return {
    currentQuestion: _internal.currentQuestion,
    totalQuestions: QUESTIONS.length,
    answered: Array.from(_internal.answered)
  };
}

export function setCurrentQuestion(id) {
  const num = Number(id);
  if (!Number.isInteger(num)) return;
  const min = 1;
  const max = QUESTIONS.length;
  if (num < min) _internal.currentQuestion = min;
  else if (num > max) _internal.currentQuestion = max;
  else _internal.currentQuestion = num;
}

export function markAnswered(id) {
  const num = Number(id);
  if (!Number.isInteger(num)) return false;
  if (!_internal.answered.includes(num)) _internal.answered.push(num);
  return true;
}

export function canRecordCurrentQuestion() {
  return !_internal.answered.includes(_internal.currentQuestion);
}

export function isAllAnswered() {
  return _internal.answered.length >= QUESTIONS.length;
}

export function resetState() {
  _internal.currentQuestion = DEFAULT_STATE.currentQuestion;
  _internal.answered = [];
}

// helper format time
export function formatToVietnam(isoString) {
  if (!isoString) return "";
  try {
    return new Date(isoString).toLocaleString("vi-VN", {
      timeZone: "Asia/Ho_Chi_Minh",
      hour12: false
    });
  } catch (e) {
    return isoString;
  }
}
