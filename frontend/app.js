// app.js (module) - FINAL (fixed)
// Tích hợp: restoreFromServer robust, honor finished, stop media on end, persist full state after upload,
// auto-fill last session on load, avoid resetting sessionId after upload.

import {
  state,
  getSnapshot,
  setCurrentQuestion,
  markAnswered,
  canRecordCurrentQuestion,
  formatToVietnam,
  initStateFromStorage,
  saveStateToStorage,
  resetState
} from "./state.js";

import { uploadWithRetry } from "./upload.js";

console.log(">>> APP.JS LOADED - FINAL");

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

const sessionIdInput = document.getElementById("sessionIdInput");
const sessionEndedAtEl = document.getElementById("sessionEndedAt");

const currentQ = document.getElementById("currentQuestionLabel");
const totalQ = document.getElementById("totalQuestionLabel");
const dots = document.getElementById("questionDots");
const answeredList = document.getElementById("answeredList");

const log = (msg) => {
  logEl.textContent = `[${new Date().toLocaleTimeString()}] ${msg}\n` + logEl.textContent;
  console.log("[APP]", msg);
};

// =============================================
// STATE + persistence helper
// =============================================
let uploadedMap = {};
let sessionEnded = false; // flag cục bộ chỉ cho chặn hành vi ghi khi cần

// =============================================
// RENDER UI
// =============================================
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
        const sid = (sessionIdInput.value || "").trim();
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

  const allAns = snap.answered.length === snap.totalQuestions;
  const upCount = Object.keys(uploadedMap).length;

  console.log("renderState: answered=", snap.answered.length, "uploadsDone=", upCount);

  btnEndSession.disabled = !(allAns && upCount === snap.totalQuestions);
}

renderState();

// =============================================
// MEDIA RECORDER
// =============================================
let mediaStream = null;
let mediaRecorder = null;
let chunks = [];
let recordedBlob = null;

function stopMediaCompletely() {
  try {
    if (mediaRecorder && mediaRecorder.state !== "inactive") {
      try { mediaRecorder.stop(); } catch (e) {}
    }
  } catch (e) { /* ignore */ }

  try {
    if (mediaStream) {
      mediaStream.getTracks().forEach(t => {
        try { t.stop(); } catch (e) {}
      });
    }
    if (preview) preview.srcObject = null;
  } catch (e) {}

  mediaStream = null;
  mediaRecorder = null;
  chunks = [];
  recordedBlob = null;
}

btnInit.onclick = async () => {
  if (sessionEnded) {
    log("Phiên đã kết thúc — không thể xin quyền camera.");
    alert("Phiên đã kết thúc, không thể bắt đầu ghi.");
    return;
  }

  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true,
    });

    preview.srcObject = mediaStream;
    btnStart.disabled = false;
    log("Đã xin quyền camera");
  } catch (err) {
    log("Lỗi camera: " + err.message);
  }
};

btnStart.onclick = () => {
  if (sessionEnded) {
    log("Phiên đã kết thúc — không thể bắt đầu ghi.");
    alert("Phiên đã kết thúc, không thể bắt đầu ghi.");
    return;
  }

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

btnStop.onclick = () => {
  if (mediaRecorder && mediaRecorder.state !== "inactive") {
    mediaRecorder.stop();
    btnStop.disabled = true;
  }
};

// =============================================
// restoreFromServer helper (robust & returns finished)
// =============================================
async function restoreFromServer(sessionId) {
  if (!sessionId) return { uploadedMap: {}, currentQuestion: 1, answered: [], finished: false, endedAt: null };

  console.log("[restoreFromServer] fetching session", sessionId);
  try {
    const res = await fetch(`http://127.0.0.1:3000/api/session/${encodeURIComponent(sessionId)}`);
    if (!res.ok) {
      console.warn("[restoreFromServer] server returned", res.status);
      return { uploadedMap: {}, currentQuestion: 1, answered: [], finished: false, endedAt: null };
    }

    const body = await res.json();
    console.log("[restoreFromServer] raw body:", body);

    if (!body || !body.ok || !body.session) {
      console.warn("[restoreFromServer] unexpected body shape");
      return { uploadedMap: {}, currentQuestion: 1, answered: [], finished: false, endedAt: null };
    }

    const sess = body.session;
    console.log("[restoreFromServer] server session =", sess);

    // detect finished/endedAt from server
    const finished = !!sess.finished || !!sess.endedAt;
    const endedAt = sess.endedAt || null;

    // normalize answered list (support session.answered or session.answers)
    let raw = [];
    if (Array.isArray(sess.answered)) raw = sess.answered;
    else if (Array.isArray(sess.answers)) raw = sess.answers;
    else if (Array.isArray(body.answered)) raw = body.answered;

    const qnums = Array.from(new Set(
      (raw || [])
        .map(a => {
          if (a == null) return NaN;
          if (typeof a === "number") return a;
          if (typeof a === "string" && /^\d+$/.test(a)) return Number(a);
          if (typeof a === "object" && a.question != null && /^\d+$/.test(String(a.question))) return Number(a.question);
          return NaN;
        })
        .filter(n => Number.isInteger(n) && n > 0)
    )).sort((a, b) => a - b);

    console.log("[restoreFromServer] parsed qnums =", qnums);

    const uploadedMapLocal = qnums.reduce((s, v) => { s[v] = true; return s; }, {});

    const total = state.totalQuestions || 4;
    let currentQuestion = 1;
    for (let i = 1; i <= total; i++) {
      if (!qnums.includes(i)) { currentQuestion = i; break; }
      if (i === total) currentQuestion = total;
    }

    const payload = {
      currentQuestion,
      answered: qnums,
      uploadedMap: uploadedMapLocal,
      finished,
      endedAt
    };

    try {
      localStorage.setItem("ivr_state_" + sessionId, JSON.stringify(payload));
      console.log("[restoreFromServer] wrote localStorage ivr_state_" + sessionId, payload);
    } catch (e) {
      console.warn("[restoreFromServer] cannot write localStorage", e);
    }

    return { uploadedMap: uploadedMapLocal, currentQuestion, answered: qnums, finished, endedAt };
  } catch (err) {
    console.error("[restoreFromServer] error", err);
    return { uploadedMap: {}, currentQuestion: 1, answered: [], finished: false, endedAt: null };
  }
}

// =============================================
// UPLOAD (auto-create session if empty)
// =============================================
btnUpload.onclick = async () => {
  if (!recordedBlob) {
    log("Không có video để upload.");
    return;
  }

  let sessionId = (sessionIdInput.value || "").trim();

  // Nếu phiên đã kết thúc ở frontend => ngăn upload
  if (sessionEnded) {
    alert("Phiên đã kết thúc — không thể upload.");
    return;
  }

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

      // Lưu trạng thái hiện có (nếu user đã ghi vài câu trước khi session đc tạo)
      saveStateToStorage(sessionId, { uploadedMap });

      // restore uploadedMap nếu storage có
      const restored = initStateFromStorage(sessionId);
      uploadedMap = restored.uploadedMap || {};

      log("Tạo session thành công: " + sessionId);
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

    if (!result) throw new Error(result?.message || "Upload failed");

    log("Upload thành công!");
    // mark answered and move next (ensure order)
    markAnswered(currentQnum);

    // Update uploadedMap
    uploadedMap[currentQnum] = true;

    // ---- IMPORTANT: persist FULL snapshot after upload so UI won't reset ----
    const snap = getSnapshot();
    const payload = {
      currentQuestion: snap.currentQuestion,
      answered: snap.answered,
      uploadedMap: uploadedMap
    };
    try {
      localStorage.setItem("ivr_state_" + sessionId, JSON.stringify(payload));
      // save last session for auto-fill on reload
      localStorage.setItem("ivr_last_session", sessionId);
      console.log("[upload] saved ivr_state and ivr_last_session", payload);
    } catch (e) {
      console.warn("[upload] cannot persist ivr_state", e);
    }
    // -----------------------------------------------------------------------

    if (result.uploadedAt) {
      downloadLink.textContent = `Uploaded at: ${formatToVietnam(result.uploadedAt)}`;
    } else {
      downloadLink.textContent = `Uploaded!`;
    }

    const snap2 = getSnapshot();
    if (snap2.currentQuestion < snap2.totalQuestions) {
      setCurrentQuestion(snap2.currentQuestion + 1);
      // update storage after advance as well
      const snap3 = getSnapshot();
      localStorage.setItem("ivr_state_" + sessionId, JSON.stringify({
        currentQuestion: snap3.currentQuestion,
        answered: snap3.answered,
        uploadedMap
      }));
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

// =============================================
// END SESSION (archive local state)
// =============================================
const ARCHIVE_ON_END = true;

async function endSession() {
  const sessionId = (sessionIdInput.value || "").trim();

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

    let data = null;
    try {
      data = await res.json();
    } catch (e) {
      // ignore parse error
    }

    if (!res.ok) {
      const msg = (data && data.message) || res.statusText || "Lỗi khi kết thúc phiên";
      throw new Error(msg);
    }

    const endedAt = (data && data.endedAt) ? data.endedAt : new Date().toISOString();
    sessionEndedAtEl.textContent = "Phiên kết thúc: " + new Date(endedAt).toLocaleString();

    // disable UI controls related to recording
    try {
      btnStart.disabled = true;
      btnStop.disabled = true;
      btnUpload.disabled = true;
      btnInit.disabled = true;
      if (btnEndSession) btnEndSession.disabled = true;
    } catch (e) {}

    // mark session ended locally + stop media
    sessionEnded = true;
    stopMediaCompletely();

    // optionally hide init button (you can comment this if prefer disabled only)
    try {
      if (btnInit) btnInit.style.display = "none";
    } catch (e) {}

    // archive local state or remove
    const keyActive = `ivr_state_${sessionId}`;
    if (ARCHIVE_ON_END) {
      const archivedKey = `ivr_state_archived_${sessionId}`;
      try {
        const raw = localStorage.getItem(keyActive);
        if (raw) localStorage.setItem(archivedKey, raw);
        localStorage.removeItem(keyActive);
        console.log(`[endSession] archived ${keyActive} -> ${archivedKey}`);
      } catch (e) {
        console.warn("[endSession] cannot archive localStorage", e);
      }
    } else {
      try {
        localStorage.removeItem(keyActive);
        console.log(`[endSession] removed local key ${keyActive}`);
      } catch (e) {
        console.warn("[endSession] cannot remove localStorage", e);
      }
    }

    // show summary
    const snap = getSnapshot();
    const answeredCount = snap.answered.length;
    const uploadedCount = Object.keys(uploadedMap || {}).length;
    let msg = `Phiên ${sessionId} đã kết thúc.\nCâu đã trả lời: ${answeredCount}\nFiles uploaded: ${uploadedCount}`;
    if (data && data.exportUrl) msg += `\nTải: ${data.exportUrl}`;

    log(msg);
    alert("Kết thúc phiên thành công!\n\n" + `Câu: ${answeredCount}, Upload: ${uploadedCount}`);
  } catch (err) {
    console.error("endSession error", err);
    alert("Lỗi kết thúc phiên: " + (err.message || err));
    btnEndSession.disabled = false;
    btnEndSession.textContent = "Kết thúc phiên";
  }
}

// =============================================
// ATTACH EVENTS + auto-fill last session
// =============================================
window.addEventListener("DOMContentLoaded", () => {
  console.log(">>> FORCE ATTACH END SESSION BUTTON");
  btnEndSession?.addEventListener("click", endSession);

  // Nếu có sessionId trên input khi load thì restore (keeps compatibility)
  const sid = (sessionIdInput?.value || "").trim();
  if (sid) {
    const restored = initStateFromStorage(sid);
    uploadedMap = restored.uploadedMap || {};
    renderState();
  }

  // AUTO-FILL last session nếu có (giữ session khi reload)
  try {
    const last = localStorage.getItem("ivr_last_session");
    if (last && !sessionIdInput.value) {
      console.log("[init] auto-fill last session", last);
      sessionIdInput.value = last;
      sessionIdInput.dispatchEvent(new Event("change"));
    }
  } catch (e) {
    console.warn("[init] cannot auto-fill last session", e);
  }

  // when user pastes/enters a sessionId, restore that session's state
  sessionIdInput?.addEventListener("change", async (e) => {
    const v = (e.target.value || "").trim();
    console.log("[session change] value=", v);

    if (!v) {
      // reset in-memory state when user clears the field
      resetState();
      uploadedMap = {};
      renderState();
      return;
    }

    // 1) Try server first (preferred) so we sync authoritative data
    const serverResult = await restoreFromServer(v);
    uploadedMap = serverResult.uploadedMap || {};

    // honor server finished flag: if session ended on server, block recording UI
    if (serverResult.finished) {
      sessionEnded = true;
      stopMediaCompletely();

      try {
        // choose to disable or hide init; currently hide to avoid re-requesting permission
        if (btnInit) btnInit.style.display = "none";
        if (btnStart) btnStart.disabled = true;
        if (btnStop) btnStop.disabled = true;
        if (btnUpload) btnUpload.disabled = true;
        if (btnEndSession) btnEndSession.disabled = true;
      } catch (e) {}

      // show ended info if provided
      if (serverResult.endedAt) {
        sessionEndedAtEl.textContent = "Phiên kết thúc: " + new Date(serverResult.endedAt).toLocaleString();
      } else {
        sessionEndedAtEl.textContent = "Phiên đã kết thúc.";
      }

      renderState();
      console.log('[session] restored and blocked because finished on server', v);
      return;
    } else {
      // not finished -> ensure recording UI available
      sessionEnded = false;
      try {
        if (btnInit) {
          btnInit.style.display = "";
          btnInit.disabled = false;
        }
      } catch (e) {}
    }

    // 2) Now try to load localStorage if present (we already wrote it in restoreFromServer)
    const raw = localStorage.getItem("ivr_state_" + v);
    if (raw) {
      const restored = initStateFromStorage(v);
      uploadedMap = restored.uploadedMap || uploadedMap || {};
      renderState();
      console.log('[session] restored session', v, 'from server/localStorage');
    } else {
      // no stored state — initialize from serverResult (restoreFromServer already wrote localStorage)
      if (Array.isArray(serverResult.answered) && serverResult.answered.length) {
        initStateFromStorage(v);
      }
      uploadedMap = serverResult.uploadedMap || {};
      renderState();
      console.log('[session] switched to session (server-only)', v);
    }
  });
});
