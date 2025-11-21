export const QUESTIONS = [
  {
    id: 1,
    key: "camera",
    text: "Yêu cầu bật camera",
    hint: "Xin quyền camera/micro từ trình duyệt",
  },
  {
    id: 2,
    key: "audio",
    text: "Thu âm",
    hint: "Bắt đầu ghi video + audio",
  },
  {
    id: 3,
    key: "stop",
    text: "Dừng ghi",
    hint: "Ngưng MediaRecorder và chốt dữ liệu",
  },
  {
    id: 4,
    key: "file",
    text: "Tạo file",
    hint: "Ghép chunks thành Blob và tạo link xem/tải",
  },
];

// alias để file index.html dùng lại tên STEPS như cũ
export const STEPS = QUESTIONS;

// ====== Default state ======
const DEFAULT_STATE = {
  currentQuestion: 1,         
  answeredQuestions: new Set(),
  canRerecord: false,      
  statusText: "Chưa yêu cầu bật camera",
};

// ====== Internal store ======
let state = { ...DEFAULT_STATE };
const listeners = new Set();

// ====== Get state (immutable-ish) ======
export const getState = () => ({
  ...state,
  answeredQuestions: new Set(state.answeredQuestions),
});

// ====== Subscribe UI renderer ======
export const subscribe = (fn) => {
  listeners.add(fn);
  fn(getState());
  return () => listeners.delete(fn);
};

const emit = () => {
  const snapshot = getState();
  listeners.forEach((fn) => fn(snapshot));
};

// ====== Core setters ======
export const setState = (patch) => {
  state = { ...state, ...patch };
  emit();
};

export const setCurrentQuestion = (id, statusText) => {
  state = {
    ...state,
    currentQuestion: id,
    statusText: statusText ?? state.statusText,
  };
  emit();
};

export const answerQuestion = (id) => {
  const next = new Set(state.answeredQuestions);
  next.add(id);
  state = { ...state, answeredQuestions: next };
  emit();
};

// ====== Helpers for flow ======
export const allowRerecord = (yes = true) => {
  state = { ...state, canRerecord: yes };
  emit();
};

export const resetFlow = (keepCameraPermission = false) => {
  if (keepCameraPermission) {
    // giữ lại câu 1 như đã xong nếu user đã cấp quyền
    state = {
      ...DEFAULT_STATE,
      currentQuestion: 2,
      statusText: "Đã có quyền camera, sẵn sàng thu âm",
      answeredQuestions: new Set([1]),
    };
  } else {
    state = { ...DEFAULT_STATE };
  }
  emit();
};

// ====== Utility: map key -> id ======
export const getQuestionIdByKey = (key) => {
  const q = QUESTIONS.find((x) => x.key === key);
  return q ? q.id : null;
};
