// state.js
// Quản lý state cho app + persistence (localStorage) theo sessionId

export const QUESTIONS = [
  { id: 1, text: "Câu 1" },
  { id: 2, text: "Câu 2" },
  { id: 3, text: "Câu 3" },
  { id: 4, text: "Câu 4" },
  { id: 5, text: "Câu 5" } // <-- Thêm câu 5 để totalQuestions = 5
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
 * - Trả về object { uploadedMap, currentQuestion, answered }.
 * - Nếu không có dữ liệu cho session này, KHÔNG reset _internal (giữ state hiện tại).
 */
export function initStateFromStorage(sessionId) {
  try {
    const raw = localStorage.getItem(storageKey(sessionId));
    if (!raw) {
      // Nếu không có dữ liệu trong localStorage cho session này,
      // không reset _internal — giữ state hiện có.
      // Trả về empty uploadedMap để caller biết không có uploadedMap lưu sẵn.
      return {
        uploadedMap: {},
        currentQuestion: _internal.currentQuestion,
        answered: Array.from(_internal.answered)
      };
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
    return {
      uploadedMap,
      currentQuestion: _internal.currentQuestion,
      answered: Array.from(_internal.answered)
    };
  } catch (e) {
    console.warn("initStateFromStorage error", e);

    return {
      uploadedMap: {},
      currentQuestion: _internal.currentQuestion,
      answered: Array.from(_internal.answered)
    };
  }
}


/**
 * saveStateToStorage(sessionId, extra = { uploadedMap })
 * - Lưu currentQuestion, answered, uploadedMap vào localStorage
 * - Nếu extra.uploadedMap không được truyền, giữ uploadedMap hiện có trong storage (nếu có).
 */
export function saveStateToStorage(sessionId, extra = {}) {
  try {
    // load existing stored payload (if any) to preserve uploadedMap when caller omits it
    let existingUploadedMap = {};
    try {
      const raw = localStorage.getItem(storageKey(sessionId));
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.uploadedMap && typeof parsed.uploadedMap === "object") {
          existingUploadedMap = parsed.uploadedMap;
        }
      }
    } catch (e) {
      // ignore parse errors and fallback to {}
    }

    const payload = {
      currentQuestion: _internal.currentQuestion,
      answered: Array.isArray(_internal.answered) ? _internal.answered : [],
      uploadedMap: (extra && typeof extra.uploadedMap === "object") ? extra.uploadedMap : existingUploadedMap
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
      timeZone: "Asia/Bangkok", // thống nhất với backend
      hour12: false
    });
  } catch (e) {
    return isoString;
  }
}
