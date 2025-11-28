import {
  state,
  getSnapshot,
  setCurrentQuestion,
  markAnswered,
  canRecordCurrentQuestion
} from "./state.js";

import {
  uploadWithRetry
} from "./upload.js";

// DOM
const logEl = document.getElementById("log");
const btnInit = document.getElementById("btnInit");
const btnStart = document.getElementById("btnStart");
const btnStop = document.getElementById("btnStop");
const btnUpload = document.getElementById("btnUpload");

const preview = document.getElementById("preview");
const playback = document.getElementById("playback");
const downloadLink = document.getElementById("downloadLink");

const currentQ = document.getElementById("currentQuestionLabel");
const totalQ = document.getElementById("totalQuestionLabel");
const dots = document.getElementById("questionDots");
const answeredList = document.getElementById("answeredList");

const log = (msg) => {
  logEl.textContent = `[${new Date().toLocaleTimeString()}] ${msg}\n` + logEl.textContent;
};

// render UI state
function renderState() {
  const snap = getSnapshot();
  currentQ.textContent = snap.currentQuestion;
  totalQ.textContent = snap.totalQuestions;

  dots.innerHTML = "";
  for (let i = 1; i <= snap.totalQuestions; i++) {
    const d = document.createElement("div");
    d.className = "dot" +
      (i === snap.currentQuestion ? " current" : "") +
      (snap.answered.includes(i) ? " answered" : "");
    d.textContent = i;
    d.onclick = () => {
      if (canRecordCurrentQuestion()) {
        setCurrentQuestion(i);
        renderState();
      }
    };
    dots.appendChild(d);
  }

  // answered list
  answeredList.innerHTML = "";
  if (!snap.answered.length) {
    answeredList.innerHTML = `<span class="chip">Chưa có</span>`;
  } else {
    snap.answered.forEach(q => {
      const c = document.createElement("span");
      c.className = "chip done";
      c.textContent = "Câu " + q;
      answeredList.appendChild(c);
    });
  }
}

renderState();

let mediaStream = null;
let mediaRecorder = null;
let chunks = [];
let recordedBlob = null;

btnInit.onclick = async () => {
  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true
    });

    preview.srcObject = mediaStream;
    log("Đã xin quyền camera");
    btnStart.disabled = false;
  } catch (err) {
    log("Lỗi camera: " + err.message);
  }
};

btnStart.onclick = () => {
  recordedBlob = null;
  chunks = [];

  mediaRecorder = new MediaRecorder(mediaStream);
  mediaRecorder.ondataavailable = e => chunks.push(e.data);

  mediaRecorder.onstop = () => {
    recordedBlob = new Blob(chunks, { type: "video/webm" });
    const url = URL.createObjectURL(recordedBlob);
    playback.src = url;

    const a = document.createElement("a");
    a.href = url;
    a.download = `q${state.currentQuestion}.webm`;
    a.textContent = "Tải video (local)";
    downloadLink.innerHTML = "";
    downloadLink.appendChild(a);

    btnUpload.disabled = false;
    log("Đã dừng ghi.");
  };

  mediaRecorder.start();
  btnStart.disabled = true;
  btnStop.disabled = false;

  log("Bắt đầu ghi...");
};

btnStop.onclick = () => {
  mediaRecorder.stop();
  btnStop.disabled = true;
};

btnUpload.onclick = async () => {
  if (!recordedBlob) {
    log("Không có video để upload.");
    return;
  }

  btnUpload.disabled = true;
  btnStart.disabled = true;
  btnStop.disabled = true;

  downloadLink.textContent = "Đang upload..."

  const file = new File([recordedBlob], `q${state.currentQuestion}.webm`, {
    type: "video/webm",
  });

  try {
    await uploadWithRetry(file, "/api/upload", (pct) => {
      downloadLink.textContent = `Đang upload... ${pct}%`;
    });

    log("Upload thành công!");

    markAnswered(state.currentQuestion);

    const snap = getSnapshot();
    if (snap.currentQuestion < snap.totalQuestions) {
      setCurrentQuestion(snap.currentQuestion + 1);
      log("Chuyển sang câu tiếp theo.");
    } else {
      log("Đã hoàn tất tất cả!");
    }

    recordedBlob = null;
    downloadLink.textContent = "Chưa có video.";
    renderState();

  } catch (err) {
    log("Upload lỗi: " + err.message);
    btnUpload.disabled = false;
  }
};
