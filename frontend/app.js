// app.js (module)
import {
  state,
  getSnapshot,
  setCurrentQuestion,
  markAnswered,
  canRecordCurrentQuestion,
  formatToVietnam,
  initStateFromStorage,
  saveStateToStorage
} from "./state.js";

import { uploadWithRetry } from "./upload.js";

console.log(">>> APP.JS LOADED - VERSION: 2025-12-09");

// DOM
const logEl = document.getElementById("log");
const btnInit = document.getElementById("btnInit");
const btnStart = document.getElementById("btnStart");
const btnStop = document.getElementById("btnStop");
const btnUpload = document.getElementById("btnUpload");
const btnEndSession = document.getElementById("btnEndSession");

const preview = document.getElementById("preview");
const playback = document.getElementById("playback");
const downloadLink = document.getElementById("downloadLink");

// NEW: input sessionId
const sessionIdInput = document.getElementById("sessionIdInput");
const sessionEndedAtEl = document.getElementById("sessionEndedAt");

const currentQ = document.getElementById("currentQuestionLabel");
const totalQ = document.getElementById("totalQuestionLabel");
const dots = document.getElementById("questionDots");
const answeredList = document.getElementById("answeredList");

// Log helper
const log = (msg) => {
  logEl.textContent = `[${new Date().toLocaleTimeString()}] ${msg}\n` + logEl.textContent;
  console.log("[APP]", msg);
};

// ==================================================
// STATE RENDERING
// ==================================================
let uploadedMap = {}; // track mỗi câu đã upload hay chưa

function restoreUploadedMapFromStorage(sessionId) {
  try {
    // initStateFromStorage trả về uploadedMap
    const r = initStateFromStorage(sessionId);
    if (r && r.uploadedMap) uploadedMap = r.uploadedMap;
    else uploadedMap = {};
  } catch (e) {
    uploadedMap = {};
  }
}

function renderState() {
  const snap = getSnapshot();

  currentQ.textContent = snap.currentQuestion;
  totalQ.textContent = snap.totalQuestions;

  dots.innerHTML = "";
  for (let i = 1; i <= snap.totalQuestions; i++) {
    const d = document.createElement("div");
    d.className =
      "dot" +
      (i === snap.currentQuestion ? " current" : "") +
      (snap.answered.includes(i) ? " answered" : "");
    d.textContent = i;
    d.onclick = () => {
      if (canRecordCurrentQuestion()) {
        setCurrentQuestion(i);
        // if sessionId present, persist currentQuestion
        const sid = (sessionIdInput?.value || "").trim();
        if (sid) saveStateToStorage(sid, { uploadedMap });
        renderState();
      }
    };
    dots.appendChild(d);
  }

  answeredList.innerHTML = "";
  if (!snap.answered.length) {
    answeredList.innerHTML = `<span class="chip">Chưa có</span>`;
  } else {
    snap.answered.forEach((q) => {
      const c = document.createElement("span");
      c.className = "chip done";
      c.textContent = "Câu " + q;
      answeredList.appendChild(c);
    });
  }

  // BẬT nút kết thúc phiên khi:
  // 1) answered đủ
  // 2) uploadedMap đủ
  const allAns = snap.answered.length === snap.totalQuestions;
  const upCount = Object.keys(uploadedMap).length;

  console.log("renderState: answered=", snap.answered.length, "uploadsDone=", upCount);

  if (btnEndSession) {
    btnEndSession.disabled = !(allAns && upCount === snap.totalQuestions);
  }
}

renderState();

// ==================================================
// MEDIA RECORDER
// ==================================================
let mediaStream = null;
let mediaRecorder = null;
let chunks = [];
let recordedBlob = null;

// Xin quyền camera
btnInit.onclick = async () => {
  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true,
    });

    preview.srcObject = mediaStream;
    log("Đã xin quyền camera");
    btnStart.disabled = false;
  } catch (err) {
    log("Lỗi camera: " + err.message);
  }
};

// Bắt đầu ghi
btnStart.onclick = () => {
  recordedBlob = null;
  chunks = [];

  mediaRecorder = new MediaRecorder(mediaStream);
  mediaRecorder.ondataavailable = (e) => chunks.push(e.data);

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

// Dừng ghi
btnStop.onclick = () => {
  if (mediaRecorder && mediaRecorder.state !== "inactive") {
    mediaRecorder.stop();
    btnStop.disabled = true;
  }
};

// ==================================================
// UPLOAD (AUTO-CREATE SESSION IF EMPTY)
// ==================================================
btnUpload.onclick = async () => {
  if (!recordedBlob) {
    log("Không có video để upload.");
    return;
  }

  let sessionId = (sessionIdInput?.value || "").trim();

  // Nếu rỗng -> tạo session mới
  if (!sessionId) {
    try {
      log("SessionId rỗng — Đang tạo session mới trên server...");
      const res = await fetch("http://127.0.0.1:3000/api/session/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      if (!res.ok) throw new Error("Tạo session thất bại: HTTP " + res.status);

      const data = await res.json();
      sessionId = data.sessionId;
      sessionIdInput.value = sessionId;

      // restore any saved state for that session
      const restored = initStateFromStorage(sessionId);
      uploadedMap = restored.uploadedMap || {};

      log("Tạo session thành công: " + sessionId);
      // render restored
      renderState();
    } catch (err) {
      log("Không thể tạo session tự động: " + err.message);
      alert("Tạo session thất bại: " + err.message);
      return;
    }
  } else {
    // if user supplied sessionId, try restoring uploadedMap/state for that session
    const restored = initStateFromStorage(sessionId);
    uploadedMap = restored.uploadedMap || {};
    renderState();
  }

  // Upload
  btnUpload.disabled = true;
  btnStart.disabled = true;
  btnStop.disabled = true;
  downloadLink.textContent = "Đang upload...";

  const file = new File([recordedBlob], `q${state.currentQuestion}.webm`, {
    type: "video/webm",
  });

  try {
    const currentQnum = state.currentQuestion; // save snapshot
    const result = await uploadWithRetry(
      file,
      "http://127.0.0.1:3000/api/upload",
      sessionId,
      currentQnum,
      (pct) => {
        downloadLink.textContent = `Đang upload... ${pct}%`;
      }
    );

    if (!result || !result.ok) throw new Error(result?.message || "Upload failed");

    log("Upload thành công!");
    uploadedMap[currentQnum] = true;

    // save to storage (persist answered + uploadedMap)
    saveStateToStorage(sessionId, { uploadedMap });

    if (result.uploadedAt) {
      downloadLink.textContent = `Uploaded at: ${formatToVietnam(result.uploadedAt)}`;
    } else {
      downloadLink.textContent = `Uploaded!`;
    }

    // mark answered and move next
    markAnswered(currentQnum);

    const snap = getSnapshot();
    if (snap.currentQuestion < snap.totalQuestions) {
      setCurrentQuestion(snap.currentQuestion + 1);
      // save currentQuestion change
      saveStateToStorage(sessionId, { uploadedMap });
      log("Chuyển sang câu tiếp theo.");
    } else {
      log("Đã hoàn tất tất cả câu!");
    }

    recordedBlob = null;
    renderState();
  } catch (err) {
    log("Upload lỗi: " + err.message);
    btnUpload.disabled = false;
    downloadLink.textContent = "Upload thất bại.";
  } finally {
    btnStart.disabled = false;
  }
};

// ==================================================
// END SESSION
// ==================================================
async function endSession() {
  const sessionId = (sessionIdInput?.value || "").trim();

  if (!sessionId) {
    alert("Chưa có sessionId — không thể kết thúc phiên.");
    return;
  }

  if (!confirm("Bạn có chắc muốn kết thúc phiên này?")) return;

  try {
    btnEndSession.disabled = true;
    btnEndSession.textContent = "Đang kết thúc...";

    const res = await fetch("http://127.0.0.1:3000/api/session/end", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId }),
    });

    const data = await res.json();

    if (!res.ok) throw new Error(data.message || res.statusText);

    log(`Phiên ${data.sessionId} đã kết thúc.`);
    alert("Kết thúc phiên thành công!");

    sessionEndedAtEl.textContent =
      "Phiên kết thúc: " + new Date(data.endedAt).toLocaleString();

    // optionally disable controls after end
    try {
      btnStart.disabled = true;
      btnStop.disabled = true;
      btnUpload.disabled = true;
      btnInit.disabled = true;
      if (btnEndSession) btnEndSession.disabled = true;
    } catch (e) {}
  } catch (err) {
    console.error("endSession error", err);
    alert("Lỗi kết thúc phiên: " + err.message);
    btnEndSession.disabled = false;
    btnEndSession.textContent = "Kết thúc phiên";
  }
}

// attach event
window.addEventListener("DOMContentLoaded", () => {
  console.log(">>> FORCE ATTACH END SESSION BUTTON");
  btnEndSession?.addEventListener("click", endSession);

  // if sessionId present on load, restore
  const sid = (sessionIdInput?.value || "").trim();
  if (sid) {
    const restored = initStateFromStorage(sid);
    uploadedMap = restored.uploadedMap || {};
    renderState();
  }

  // when user pastes/enters a sessionId, restore that session's state
  sessionIdInput?.addEventListener("change", (e) => {
    const v = (e.target.value || "").trim();
    if (v) {
      const restored = initStateFromStorage(v);
      uploadedMap = restored.uploadedMap || {};
      renderState();
    }
  });
});
