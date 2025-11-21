export const STEPS = [
  { id: 1, key: "init",   label: "Xin quyền cam/mic" },
  { id: 2, key: "record", label: "Bắt đầu ghi" },
  { id: 3, key: "stop",   label: "Dừng ghi" },
  { id: 4, key: "upload", label: "Upload" },
];

const DEFAULT_STATE = {
  currentStep: 1,              // đang ở bước mấy
  answeredSteps: new Set(),    // những bước đã hoàn thành
  canRerecord: false,          // cho phép ghi lại không
  statusText: "Chưa xin quyền camera",
};

const listeners = new Set();
let state = { ...DEFAULT_STATE };

export const getState = () => ({
  ...state,
  answeredSteps: new Set(state.answeredSteps),
});

export const subscribe = (fn) => {
  listeners.add(fn);
  fn(getState());
  return () => listeners.delete(fn);
};

const emit = () => listeners.forEach((fn) => fn(getState()));

export const setState = (patch) => {
  state = { ...state, ...patch };
  emit();
};

export const completeStep = (stepId) => {
  const next = new Set(state.answeredSteps);
  next.add(stepId);
  state = { ...state, answeredSteps: next };
  emit();
};

export const resetFlow = () => {
  state = { ...DEFAULT_STATE };
  emit();
};
