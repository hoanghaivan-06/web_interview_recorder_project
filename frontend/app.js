// frontend/app.js (FULL) - token enforced, absolute API URLs, full features preserved
// Keep all legacy features: restoreFromServer, init->create session, stop media on end,
// persist full state after upload, auto-fill last session, disable UI when finished, retry upload.

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

console.log(">>> APP.JS LOADED - FINAL (token enforced, absolute API URLs)");

// ================= DOM ======================
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

// NEW: token + candidate inputs
const tokenInput = document.getElementById("tokenInput");
const candidateInput = document.getElementById("candidateInput");

// Continue DOM vars
const currentQ = document.getElementById("currentQuestionLabel");
const totalQ = document.getElementById("totalQuestionLabel");
const dots = document.getElementById("questionDots");
const answeredList = document.getElementById("answeredList");

// ================= Helpers ======================
const log = (msg) => {
  if (logEl) logEl.textContent = `[${new Date().toLocaleTimeString()}] ${msg}\n` + logEl.textContent;
  console.log("[APP]", msg);
};

let uploadedMap = {};
let sessionEnded = false;

// =====================================================================
// TOKEN validation helpers
// =====================================================================
function isValidTokenFormatClient(token) {
  if (!token || typeof token !== "string") return false;
  // require 1124 + 4 chars digits (1124xxxx where x digit) as per your examples
  return /^1124\d{4}$/.test(token.trim());
}

// Set initial disabled state for btnInit (locked until valid token or existing session validated)
try {
  if (btnInit) btnInit.disabled = true;
} catch (e) {}

// If tokenInput exists, wire up validation UI
if (tokenInput) {
  // initial evaluation - but if sessionId already present, still require token per spec
  if (isValidTokenFormatClient(tokenInput.value || "")) {
    if (btnInit) btnInit.disabled = false;
  } else {
    if (btnInit) btnInit.disabled = true;
  }

  tokenInput.addEventListener("input", (e) => {
    const v = (e.target.value || "").trim();
    if (isValidTokenFormatClient(v)) {
      if (btnInit) btnInit.disabled = false;
      tokenInput.classList.remove("error");
    } else {
      if (btnInit) btnInit.disabled = true;
    }
  });

  tokenInput.addEventListener("blur", (e) => {
    const v = (e.target.value || "").trim();
    if (!isValidTokenFormatClient(v)) tokenInput.classList.add("error");
    else tokenInput.classList.remove("error");
  });
} else {
  // no token input in DOM, keep btnInit disabled (fail-safe)
  if (btnInit) btnInit.disabled = true;
}

// ================= RENDER UI ======================
function renderState() {
  const snap = getSnapshot();

  if (currentQ) currentQ.textContent = snap.currentQuestion;
  if (totalQ) totalQ.textContent = snap.totalQuestions;

  if (dots) {
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
  }

  if (answeredList) {
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
  }

  const allAns = snap.answered.length === snap.totalQuestions;
  const upCount = Object.keys(uploadedMap).length;
  if (btnEndSession) btnEndSession.disabled = !(allAns && upCount === snap.totalQuestions);
}

renderState();

// ================= MEDIA RECORDER ======================
let mediaStream = null;
let mediaRecorder = null;
let chunks = [];
let recordedBlob = null;

function stopMediaCompletely() {
  try {
    if (mediaRecorder && mediaRecorder.state !== "inactive") {
      try { mediaRecorder.stop(); } catch (e) {}
    }
  } catch (e) {}

  try {
    if (mediaStream) {
      mediaStream.getTracks().forEach(t => { try { t.stop(); } catch (e) {} });
    }
    if (preview) preview.srcObject = null;
  } catch (e) {}

  mediaStream = null;
  mediaRecorder = null;
  chunks = [];
  recordedBlob = null;
}

// ================= restoreFromServer (robust) ======================
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

    // finished detection
    const finished = !!sess.finished || !!sess.endedAt;
    const endedAt = sess.endedAt || null;

    // normalize answered array (support multiple shapes)
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

    // totalQuestions from frontend state (should be <=5)
    const total = state.totalQuestions || 5;
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

// ========================================================
// BTN INIT — token required before camera access
// ========================================================
btnInit?.addEventListener("click", async (e) => {
  e.preventDefault();
  if (sessionEnded) {
    alert("Phiên đã kết thúc — không thể xin quyền camera.");
    return;
  }

  // token check always required
  const token = (tokenInput?.value || "").trim();
  if (!token) {
    alert("Bạn phải nhập token (1124xxxx) trước khi xin quyền camera.");
    tokenInput?.classList.add("error");
    return;
  }
  if (!isValidTokenFormatClient(token)) {
    alert("Token không hợp lệ! Định dạng đúng: 1124xxxx");
    tokenInput?.classList.add("error");
    return;
  }
  tokenInput?.classList.remove("error");

  // create session if missing
  let sid = (sessionIdInput.value || "").trim();

  if (!sid) {
    try {
      btnInit.disabled = true;
      log("Đang xác thực token và tạo session trên server...");

      const candidate = (candidateInput?.value || "").trim() || undefined;
      const res = await fetch("http://127.0.0.1:3000/api/session/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, candidate }),
      });

      const body = await (res.ok ? res.json() : res.json().catch(()=>null));

      if (!res.ok || !body || !body.ok) {
        const msg = (body && body.message) || `Server trả lỗi ${res.status}`;
        log("Tạo session thất bại: " + msg);
        alert("Token không hợp lệ hoặc server từ chối: " + msg);
        btnInit.disabled = false;
        return;
      }

      sid = body.sessionId;
      sessionIdInput.value = sid;
      try { localStorage.setItem("ivr_last_session", sid); } catch (e) {}

      log("Tạo session thành công: " + sid);
    } catch (err) {
      console.error("Error creating session before camera:", err);
      alert("Lỗi khi tạo session: " + (err.message || err));
      btnInit.disabled = false;
      return;
    } finally {
      btnInit.disabled = false;
    }
  }

  // request camera permission only AFTER session has been created/validated
  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    if (preview) preview.srcObject = mediaStream;
    if (btnStart) btnStart.disabled = false;
    log("Đã xin quyền camera thành công.");
  } catch (err) {
    console.error("camera error:", err);
    alert("Không thể truy cập camera/microphone: " + (err.message || err));
  }
});

// ========================================================
// START RECORD
// ========================================================
btnStart?.addEventListener("click", () => {
  if (sessionEnded) {
    alert("Phiên đã kết thúc — không thể bắt đầu ghi.");
    return;
  }

  if (!mediaStream) {
    alert("Chưa có stream. Bấm 'Xin quyền camera' trước.");
    return;
  }

  recordedBlob = null;
  chunks = [];

  mediaRecorder = new MediaRecorder(mediaStream);
  mediaRecorder.ondataavailable = (e) => chunks.push(e.data);

  mediaRecorder.onstop = () => {
    recordedBlob = new Blob(chunks, { type: "video/webm" });
    const url = URL.createObjectURL(recordedBlob);
    if (playback) playback.src = url;

    const a = document.createElement("a");
    a.href = url;
    a.download = `q${state.currentQuestion}.webm`;
    a.textContent = "Tải video (local)";
    if (downloadLink) {
      downloadLink.innerHTML = "";
      downloadLink.appendChild(a);
    }

    if (btnUpload) btnUpload.disabled = false;
    log("Đã dừng ghi.");
  };

  mediaRecorder.start();
  if (btnStart) btnStart.disabled = true;
  if (btnStop) btnStop.disabled = false;
  log("Bắt đầu ghi...");
});

// ========================================================
// STOP RECORD
// ========================================================
btnStop?.addEventListener("click", () => {
  if (mediaRecorder && mediaRecorder.state !== "inactive") {
    mediaRecorder.stop();
    if (btnStop) btnStop.disabled = true;
  }
});

// ========================================================
// UPLOAD (with auto-create session if empty) - absolute URL
// ========================================================
// REPLACE btnUpload handler with this robust version
btnUpload?.addEventListener("click", async (e) => {
  e.preventDefault();
  console.log("[upload] user clicked upload handler start");
  if (!recordedBlob) {
    log("Không có video để upload.");
    return;
  }

  // preserve initial DOM/session values for debug
  const beforeSid = (sessionIdInput.value || "").trim();
  const beforeLocal = (() => {
    try { return localStorage.getItem("ivr_state_" + beforeSid); } catch(e) { return null; }
  })();
  console.log("[upload] before: sessionId=", beforeSid, "local:", beforeLocal);

  let sessionId = beforeSid;

  if (sessionEnded) {
    alert("Phiên đã kết thúc — không thể upload.");
    return;
  }

  // If sessionId empty -> create one (must have token)
  if (!sessionId) {
    try {
      const token = (tokenInput?.value || "").trim();
      if (!token) { alert("Bạn phải nhập token để tạo session."); return; }
      if (!isValidTokenFormatClient(token)) { alert("Token không đúng định dạng. Định dạng hợp lệ: 1124xxxx"); return; }

      log("SessionId rỗng — Đang tạo session mới trên server...");
      const candidate = (candidateInput?.value || "").trim() || undefined;

      const res = await fetch("http://127.0.0.1:3000/api/session/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, candidate }),
      });

      if (!res.ok) {
        const bodyText = await res.text().catch(()=>null);
        throw new Error(bodyText || `HTTP ${res.status}`);
      }

      const data = await res.json();
      sessionId = data.sessionId;
      sessionIdInput.value = sessionId;

      // persist minimal state safely
      try { saveStateToStorage(sessionId, { uploadedMap }); } catch (e) { console.warn("[upload] saveStateToStorage error", e); }

      // only init from storage if ivr_state exists (do not overwrite in-memory otherwise)
      const raw = localStorage.getItem("ivr_state_" + sessionId);
      if (raw) {
        const restored = initStateFromStorage(sessionId);
        uploadedMap = restored.uploadedMap || uploadedMap || {};
        console.log("[upload] restored local ivr_state for", sessionId, restored);
      } else {
        console.log("[upload] no local ivr_state to restore for", sessionId);
      }

      try { localStorage.setItem("ivr_last_session", sessionId); } catch (e) {}
      log("Tạo session thành công: " + sessionId);
    } catch (err) {
      log("Không thể tạo session tự động: " + err.message);
      alert("Tạo session thất bại: " + err.message);
      return;
    }
  } else {
    // If sessionId exists, ensure we don't accidentally overwrite state
    try {
      const restored = initStateFromStorage(sessionId);
      uploadedMap = restored.uploadedMap || uploadedMap || {};
      console.log("[upload] initStateFromStorage on existing session ->", restored);
    } catch (e) {
      console.warn("[upload] initStateFromStorage error for existing session", e);
    }
  }

  // Now upload
  if (btnUpload) btnUpload.disabled = true;
  if (btnStart) btnStart.disabled = true;
  if (btnStop) btnStop.disabled = true;
  if (downloadLink) downloadLink.textContent = "Đang upload...";

  const file = new File([recordedBlob], `q${state.currentQuestion}.webm`, { type: "video/webm" });

  try {
    const currentQnum = state.currentQuestion;
    console.log("[upload] starting upload file q", currentQnum, "to session", sessionId);

    const result = await uploadWithRetry(
      file,
      "http://127.0.0.1:3000/api/upload",
      sessionId,
      currentQnum,
      (pct) => {
        if (downloadLink) downloadLink.textContent = `Đang upload... ${pct}%`;
      }
    );

    if (!result) throw new Error(result?.message || "Upload failed");

    log("Upload thành công!");
    markAnswered(currentQnum);
    uploadedMap[currentQnum] = true;

    // persist full snapshot safely (merge to avoid accidental wipe)
    try {
      const snap = getSnapshot();
      const payload = {
        currentQuestion: snap.currentQuestion,
        answered: snap.answered,
        uploadedMap: uploadedMap
      };
      localStorage.setItem("ivr_state_" + sessionId, JSON.stringify(payload));
      localStorage.setItem("ivr_last_session", sessionId);
      console.log("[upload] saved ivr_state", payload);
    } catch (e) {
      console.warn("[upload] cannot persist ivr_state", e);
    }

    if (result.uploadedAt) {
      if (downloadLink) downloadLink.textContent = `Uploaded at: ${formatToVietnam(result.uploadedAt)}`;
    } else {
      if (downloadLink) downloadLink.textContent = `Uploaded!`;
    }

    // move to next question (but DO NOT reset or reload)
    const snap2 = getSnapshot();
    if (snap2.currentQuestion < snap2.totalQuestions) {
      setCurrentQuestion(snap2.currentQuestion + 1);
      const snap3 = getSnapshot();
      try {
        localStorage.setItem("ivr_state_" + sessionId, JSON.stringify({
          currentQuestion: snap3.currentQuestion,
          answered: snap3.answered,
          uploadedMap
        }));
      } catch (e) { console.warn("[upload] cannot persist ivr_state after increment", e); }
      log("Chuyển sang câu tiếp theo.");
    } else {
      log("Đã hoàn tất tất cả câu!");
    }

    recordedBlob = null;
    renderState();

    // debug after-upload snapshot
    try {
      console.log("[upload] after: sessionId=", sessionId, "local=", localStorage.getItem("ivr_state_" + sessionId));
    } catch(e) { console.warn(e); }

  } catch (err) {
    log("Upload lỗi: " + (err.message || err));
    if (btnUpload) btnUpload.disabled = false;
    if (downloadLink) downloadLink.textContent = "Upload thất bại.";
  } finally {
    if (btnStart) btnStart.disabled = false;
  }
});


// ========================================================
// END SESSION
// ========================================================
const ARCHIVE_ON_END = true;

async function endSession() {
  const sessionId = (sessionIdInput.value || "").trim();

  if (!sessionId) {
    alert("Chưa có sessionId — không thể kết thúc phiên.");
    return;
  }

  if (!confirm("Bạn có chắc muốn kết thúc phiên này?")) return;

  try {
    if (btnEndSession) {
      btnEndSession.disabled = true;
      btnEndSession.textContent = "Đang kết thúc...";
    }

    const res = await fetch("http://127.0.0.1:3000/api/session/end", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId }),
    });

    let data = null;
    try {
      data = await res.json();
    } catch (e) { /* ignore */ }

    if (!res.ok) {
      const msg = (data && data.message) || res.statusText || "Lỗi khi kết thúc phiên";
      throw new Error(msg);
    }

    const endedAt = (data && data.endedAt) ? data.endedAt : new Date().toISOString();
    if (sessionEndedAtEl) sessionEndedAtEl.textContent = "Phiên kết thúc: " + new Date(endedAt).toLocaleString();

    // stop media, mark session ended locally
    try {
      if (btnStart) btnStart.disabled = true;
      if (btnStop) btnStop.disabled = true;
      if (btnUpload) btnUpload.disabled = true;
    } catch (e) {}

    sessionEnded = true;
    stopMediaCompletely();

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

    // show summary (unchanged)
    const snap = getSnapshot();
    const answeredCount = snap.answered.length;
    const uploadedCount = Object.keys(uploadedMap || {}).length;
    let msg = `Phiên ${sessionId} đã kết thúc.\nCâu đã trả lời: ${answeredCount}\nFiles uploaded: ${uploadedCount}`;
    if (data && data.exportUrl) msg += `\nTải: ${data.exportUrl}`;

    log(msg);
    alert("Kết thúc phiên thành công!\n\n" + `Câu: ${answeredCount}, Upload: ${uploadedCount}`);

    // =========================
    // NEW: prepare UI for a new session (do NOT hide btnInit)
    // =========================
    try {
      // do not hide btnInit; instead enable it so user can create a new session immediately
      if (btnInit) {
        btnInit.style.display = ""; // ensure visible
        btnInit.disabled = false;
      }
      // Clear the current sessionId input so user doesn't accidentally reuse ended session
      if (sessionIdInput) {
        sessionIdInput.value = "";
      }
      // Reset in-memory state and uploadedMap so UI becomes ready for new session
      try { resetState(); } catch (e) { console.warn("resetState error", e); }
      uploadedMap = {};
      renderState();

      // Optionally focus token input to encourage creating new session
      try { if (tokenInput) { tokenInput.focus(); } } catch (e) {}
    } catch (e) {
      console.warn("[endSession] post-end UI cleanup error", e);
    }

  } catch (err) {
    console.error("endSession error", err);
    alert("Lỗi kết thúc phiên: " + (err.message || err));
    if (btnEndSession) {
      btnEndSession.disabled = false;
      btnEndSession.textContent = "Kết thúc phiên";
    }
  }
}

// ========================================================
// ATTACH EVENTS + auto-fill last session (safe)
// ========================================================
window.addEventListener("DOMContentLoaded", () => {
  if (btnEndSession) btnEndSession.addEventListener("click", endSession);

  // Attach the session change listener FIRST so programmatic dispatch or auto-fill triggers it
  sessionIdInput?.addEventListener("change", async (e) => {
    const v = (e.target.value || "").trim();
    console.log("[session change] value=", v);

    if (!v) {
      // --- PATCH: don't resetState() on programmatic clears (only reset when user manually cleared) ---
      if (e && e.isTrusted) {
        resetState();
        uploadedMap = {};
        renderState();
        return;
      } else {
        // programmatic clear -> just clear uploadedMap but keep current state
        uploadedMap = {};
        renderState();
        return;
      }
    }

    // 1) Try server first (authoritative)
    const serverResult = await restoreFromServer(v);
    console.log("[session change] serverResult:", serverResult); // debug log to detect unexpected finished flag
    uploadedMap = serverResult.uploadedMap || {};

    // if server says finished -> ensure we load the stored state into internal state, then block recording UI
    if (serverResult.finished) {
      try {
        const restored = initStateFromStorage(v);
        uploadedMap = restored.uploadedMap || uploadedMap || {};
        console.log("[session] initStateFromStorage (finished) ->", restored);
      } catch (e) {
        console.warn("[session] cannot initStateFromStorage for finished session", e);
      }

      sessionEnded = true;
      stopMediaCompletely();

      try {
        if (btnInit) btnInit.style.display = "none";
        if (btnStart) btnStart.disabled = true;
        if (btnStop) btnStop.disabled = true;
        if (btnUpload) btnUpload.disabled = true;
        if (btnEndSession) btnEndSession.disabled = true;
      } catch (e) {}

      if (serverResult.endedAt && sessionEndedAtEl) {
        sessionEndedAtEl.textContent = "Phiên kết thúc: " + new Date(serverResult.endedAt).toLocaleString();
      } else if (sessionEndedAtEl) {
        sessionEndedAtEl.textContent = "Phiên đã kết thúc.";
      }

      renderState();
      console.log("[session] restored and blocked because finished on server", v);
      return;
    }

    // not finished -> ensure recording UI available
    sessionEnded = false;
    try {
      if (btnInit) {
        btnInit.style.display = "";
      }
    } catch (e) {}

    // 2) Load localStorage state if present (only if not finished)
    const raw = localStorage.getItem("ivr_state_" + v);
    if (raw) {
      const restored = initStateFromStorage(v);
      uploadedMap = restored.uploadedMap || uploadedMap || {};
      renderState();
      console.log("[session] restored session", v, "from server/localStorage");
    } else {
      // if server provided answered info, make sure internal state reflects it (initStateFromStorage will also write localStorage)
      if (Array.isArray(serverResult.answered) && serverResult.answered.length) {
        try {
          initStateFromStorage(v);
        } catch (e) {
          console.warn("[session] initStateFromStorage failed when server-only answered present", e);
        }
      }
      uploadedMap = serverResult.uploadedMap || {};
      renderState();
      console.log("[session] switched to session (server-only)", v);
    }
  });

  // If there's sessionId prefilled in HTML, restore local state immediately
  const sid = (sessionIdInput?.value || "").trim();
  if (sid) {
    const restored = initStateFromStorage(sid);
    uploadedMap = restored.uploadedMap || {};
    renderState();
    console.log('[init] restored prefilled session', sid);
  }

  // try auto-fill last session (but if server shows finished, don't auto-start camera)
  try {
    const last = localStorage.getItem("ivr_last_session");
    if (last && !sessionIdInput.value) {
      console.log("[init] auto-fill last session", last);
      // set value and *call the change handler* by dispatching change now that listener is attached
      sessionIdInput.value = last;
      sessionIdInput.dispatchEvent(new Event("change"));
    }
  } catch (e) {
    console.warn("[init] cannot auto-fill last session", e);
  }
});
