export const QUESTIONS = [
  { id: 1, text: "Câu 1" },
  { id: 2, text: "Câu 2" },
  { id: 3, text: "Câu 3" },
  { id: 4, text: "Câu 4" }
];

const DEFAULT_STATE = {
  currentQuestion: 1,
  answered: new Set()
};

let _internal = {
  ...DEFAULT_STATE
};

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
  _internal.currentQuestion = id;
}

export function markAnswered(id) {
  _internal.answered.add(id);
}

export function canRecordCurrentQuestion() {
  return !_internal.answered.has(_internal.currentQuestion);
}
