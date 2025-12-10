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

// ==== PRESERVE TOKEN UNTIL ENDSESSION ====
// Chặn mọi gán programmatic lên tokenInput.value cho tới khi endSession gọi _disablePreserve()
// NEW: allow reattach if input is replaced in DOM
let tokenInput = document.getElementById("tokenInput");

// Attach preserve logic to a given element
function attachPreserveTo(el) {
  if (!el) return;

  // avoid double-attach
  if (el._preserveAttached) return;
  el._preserveAttached = true;

  // default preserve on this element
  el.dataset.preserve = el.dataset.preserve || "1";

  const originalDesc = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");

  // helper to seed lastValidToken safely
  try {
    const initial = (originalDesc && typeof originalDesc.get === "function") ? originalDesc.get.call(el) : (el.value || "");
    if (isValidTokenFormatClient((initial || "").trim())) el.dataset.lastValidToken = (initial || "").trim();
  } catch (e) {}

  if (!originalDesc || typeof originalDesc.get !== "function" || typeof originalDesc.set !== "function") {
    // fallback: update on input and prevent clear by restoring
    const inputHandler = () => {
      const cur = (el.value || "").trim();
      if (isValidTokenFormatClient(cur)) el.dataset.lastValidToken = cur;
      if (el.dataset.preserve === "1" && (!cur || cur === "")) {
        el.value = el.dataset.lastValidToken || "";
        console.warn("[preserveToken fallback] restored token value (input cleared)");
        console.trace();
      }
    };
    el.addEventListener("input", inputHandler);
    el._preserveCleanup = () => { el.removeEventListener("input", inputHandler); };
    return;
  }

  // defineProperty on this element only
  try {
    Object.defineProperty(el, "value", {
      configurable: true,
      enumerable: true,
      get: function() {
        return originalDesc.get.call(this);
      },
      set: function(v) {
        const incoming = (v == null) ? "" : String(v);
        const preserve = this.dataset.preserve === "1";

        if (preserve && (!incoming || incoming.trim() === "")) {
          console.warn("[preserveToken] prevented clearing token; kept lastValidToken:", this.dataset.lastValidToken || "");
          console.trace();
          originalDesc.set.call(this, this.dataset.lastValidToken || "");
          return;
        }

        if (isValidTokenFormatClient(incoming)) {
          this.dataset.lastValidToken = incoming;
          this.dataset.preserve = "1";
        }

        originalDesc.set.call(this, incoming);
      }
    });
  } catch (err) {
    console.error("[preserveToken] defineProperty failed:", err);
  }

  // input listener to update lastValidToken when user types
  const inputListener = () => {
    const cur = (el.value || "").trim();
    if (isValidTokenFormatClient(cur)) el.dataset.lastValidToken = cur;
    if (el.dataset.preserve === "1" && (!cur || cur === "")) {
      // restore visible value
      try { el.value = el.dataset.lastValidToken || ""; } catch (e) {}
      console.warn("[preserveToken input] restored token after user attempted to clear");
    }
  };
  el.addEventListener("input", inputListener);

  // MutationObserver to catch setAttribute('value', '') cases
  try {
    const mo = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.type === "attributes" && m.attributeName === "value") {
          const attrVal = el.getAttribute("value");
          if (el.dataset.preserve === "1" && (!attrVal || attrVal.trim() === "")) {
            el.setAttribute("value", el.dataset.lastValidToken || "");
            try { el.value = el.dataset.lastValidToken || ""; } catch (e) {}
            console.warn("[preserveToken MO] prevented attribute value clear");
            console.trace();
          }
        }
      }
    });
    mo.observe(el, { attributes: true, attributeFilter: ["value"] });
    el._preserveMO = mo;
  } catch (e) {}

  // cleanup method to restore original descriptor and disconnect observers/listeners
  el._disablePreserve = function() {
    try {
      if (el._preserveMO && typeof el._preserveMO.disconnect === "function") el._preserveMO.disconnect();
      el.removeEventListener("input", inputListener);
      // restore original descriptor on this element
      Object.defineProperty(el, "value", originalDesc);
      el.dataset.preserve = "0";
    } catch (e) {
      el.dataset.preserve = "0";
    } finally {
      el._preserveAttached = false;
    }
  };

  // small cleanup store
  el._preserveCleanup = () => {
    try {
      if (el._preserveMO && typeof el._preserveMO.disconnect === "function") el._preserveMO.disconnect();
      el.removeEventListener("input", inputListener);
    } catch (e) {}
  };
}

// Initial attach if element exists on load
if (tokenInput) {
  attachPreserveTo(tokenInput);
}

// Observe document for replacements/additions of the token input
try {
  const bodyObserver = new MutationObserver((mutations) => {
    // quick lookup each mutation batch instead of per-mutation heavy work
    const current = document.getElementById("tokenInput");
    if (current && current !== tokenInput) {
      // a new element appeared or old was replaced
      console.log("[preserveToken observer] detected new #tokenInput, re-attaching preserve");
      // if previous existed, try disabling it
      try { if (tokenInput && typeof tokenInput._disablePreserve === "function") tokenInput._disablePreserve(); } catch (e) {}
      tokenInput = current;
      attachPreserveTo(tokenInput);
    } else if (!current && tokenInput) {
      // tokenInput removed from DOM
      console.warn("[preserveToken observer] #tokenInput removed from DOM (will reattach when it reappears)");
    }
  });

  // observe subtree changes (childList + subtree) — we keep cheap checks
  bodyObserver.observe(document.body || document.documentElement, { childList: true, subtree: true });
  // store it so we can disconnect later if needed
  window._tokenPreserveBodyObserver = bodyObserver;
} catch (e) {
  console.warn("[preserveToken] body observer failed", e);
}

// also expose a helper to force reattach manually (for debugging)
window._reapplyTokenPreserve = function() {
  try {
    const cur = document.getElementById("tokenInput");
    if (cur && cur !== tokenInput) {
      try { if (tokenInput && typeof tokenInput._disablePreserve === "function") tokenInput._disablePreserve(); } catch (e) {}
      tokenInput = cur;
      attachPreserveTo(tokenInput);
      console.log("[preserveToken] manual reattach done");
    } else if (cur) {
      attachPreserveTo(cur);
      console.log("[preserveToken] manual attach done");
    } else {
      console.warn("[preserveToken] manual reattach: tokenInput not found");
    }
  } catch (e) { console.error(e); }
};


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
    const isValid = isValidTokenFormatClient(v);
    
    if (isValid) {
      if (btnInit) btnInit.disabled = false;
      tokenInput.classList.remove("error");
      
      // Chỉ xóa sessionId nếu token thay đổi (dùng flag để check)
      // Nếu user chỉ đang nhập token lần đầu, đừng xóa
      const oldToken = tokenInput.dataset.lastValidToken || "";
      if (oldToken && oldToken !== v && sessionIdInput && sessionIdInput.value) {
        console.log("[token input] Clearing old sessionId because token changed");
        sessionIdInput.value = "";
        sessionIdInput.dispatchEvent(new Event("change", { bubbles: true }));
        sessionEnded = false;
      }
      tokenInput.dataset.lastValidToken = v;
      tokenInput.dataset.preserve = "1";
    } else {
      if (btnInit) btnInit.disabled = true;
      tokenInput.classList.remove("error");
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

      try {
        if (tokenInput) {
          tokenInput.readOnly = true;                     // KHÓA nhưng không xóa value
          tokenInput.dataset.lastValidToken = (tokenInput.value || "").trim();
          tokenInput.classList.remove("error");
        }
      } catch (e) { console.warn("[btnInit] cannot disable tokenInput", e); }

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
// ========================================================
// UPLOAD (with auto-create session if empty) - absolute URL
// Robust handler that preserves token input until endSession()
// ========================================================
btnUpload?.addEventListener("click", async (e) => {
  e.preventDefault();
  console.log("[upload] user clicked upload handler start");

  // Preserve token at the very beginning so nothing in this flow can clear it
  const preservedToken = (tokenInput?.value || "").trim();

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

  try {
    // If sessionId empty -> create one (must have token)
    if (!sessionId) {
      // ensure preservedToken exists and is valid
      if (!preservedToken) { alert("Bạn phải nhập token để tạo session."); return; }
      if (!isValidTokenFormatClient(preservedToken)) { alert("Token không đúng định dạng. Định dạng hợp lệ: 1124xxxx"); return; }

      log("SessionId rỗng — Đang tạo session mới trên server...");
      const candidate = (candidateInput?.value || "").trim() || undefined;

      const res = await fetch("http://127.0.0.1:3000/api/session/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: preservedToken, candidate }),
      });

      if (!res.ok) {
        const bodyText = await res.text().catch(()=>null);
        throw new Error(bodyText || `HTTP ${res.status}`);
      }

      const data = await res.json();
      sessionId = data.sessionId;
      sessionIdInput.value = sessionId;

      // Lock token input (but DO NOT clear value)
      if (tokenInput) {
        tokenInput.readOnly = true;
        tokenInput.dataset.lastValidToken = preservedToken;
        tokenInput.classList.remove("error");
      }

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
    // Always restore token value & ensure it's locked (so upload flow never clears it)
    try {
      if (tokenInput) {
        tokenInput.readOnly = true;                // restore if anything accidentally cleared it                       // keep locked during session
        tokenInput.dataset.lastValidToken = preservedToken;
        
      }
    } catch (e) {
      console.warn("[upload finally] cannot restore tokenInput", e);
    }

    if (btnStart) btnStart.disabled = false;
  }
});



// ========================================================
// END SESSION
// ========================================================
const ARCHIVE_ON_END = true;

// ---------------------------
// 1) REPLACE whole endSession() with this
// ---------------------------
async function endSession() {
  const sessionId = (sessionIdInput && (sessionIdInput.value || "").trim()) || "";

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

    // lấy snapshot *trước* khi archive / reset để hiển thị summary chính xác
    const snapBefore = getSnapshot();
    const answeredCountBefore = (snapBefore && Array.isArray(snapBefore.answered)) ? snapBefore.answered.length : 0;
    const uploadedCountBefore = Object.keys(uploadedMap || {}).length;

    const res = await fetch("http://127.0.0.1:3000/api/session/end", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId }),
    });

    let data = null;
    try { data = await res.json(); } catch (e) { /* ignore */ }

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

    // --- NEW CLEANUP: ensure ended session is fully cleared and UI ready for new session ---
    try {
      // remove the last-session pointer so auto-fill won't bring back the ended session
      try { localStorage.removeItem("ivr_last_session"); } catch (e) {}

      // enable & clear sessionId input so user can create a new session immediately
      if (sessionIdInput) {
        sessionIdInput.value = "";
        sessionIdInput.disabled = false; // allow typing if it was disabled

        // dispatch programmatic change so handler knows it's programmatic (not user)
        sessionIdInput.dispatchEvent(new CustomEvent("change", { bubbles: true, composed: true, detail: { programmatic: true } }));
      }

      // make sure init button visible & enabled
      if (btnInit) {
        btnInit.style.display = "";
        btnInit.disabled = false;
      }

      // reset in-memory state (keep snapshot shown because we didn't call resetState() here)
      uploadedMap = {};
      try { resetState(); } catch (e) { console.warn("resetState error", e); }
      renderState();
    } catch (e) {
      console.warn("[endSession] new-session cleanup error", e);
    }

    // show summary (use counts from before archive to avoid 0/0 after reset)
    let msg = `Phiên ${sessionId} đã kết thúc.\nCâu đã trả lời: ${answeredCountBefore}\nFiles uploaded: ${uploadedCountBefore}`;
    if (data && data.exportUrl) msg += `\nTải: ${data.exportUrl}`;

    log(msg);
    alert("Kết thúc phiên thành công!\n\n" + `Câu: ${answeredCountBefore}, Upload: ${uploadedCountBefore}`);

    // Reset token input & focus to encourage creating a fresh session
    try {
      if (tokenInput && typeof tokenInput._disablePreserve === "function") {
        try { tokenInput._disablePreserve(); } catch (e) { console.warn("[endSession] _disablePreserve failed", e); }
      }
      if (tokenInput) {
        tokenInput.dataset.preserve = "0";                // ← disable preserve FIRST
        tokenInput.dataset.lastValidToken = "";           // ← then clear flag
        tokenInput.readOnly = false;                      // ← then unlock
        tokenInput.value = "";                            // ← finally clear value (now it can clear)
        tokenInput.classList.remove("error");
        if (btnInit && !isValidTokenFormatClient(tokenInput.value)) {
          btnInit.disabled = true;
        }
        tokenInput.focus();
      }
    } catch (e) {
      console.warn("[endSession] cannot reset token input", e);
    }

    // Reset btnEndSession button state
    try {
      if (btnEndSession) {
        btnEndSession.disabled = true;
        btnEndSession.textContent = "Kết thúc phiên";
      }
    } catch (e) {
      console.warn("[endSession] cannot reset button", e);
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
// ========================================================
// ATTACH EVENTS + auto-fill last session (safe, robust)
// ========================================================
// ---------------------------
// 2) REPLACE whole DOMContentLoaded handler with this (robust session change handler)
// ---------------------------
window.addEventListener("DOMContentLoaded", async () => {
  if (btnEndSession) btnEndSession.addEventListener("click", endSession);

  // Attach the session change listener FIRST so programmatic dispatch or auto-fill triggers it
  sessionIdInput?.addEventListener("change", async (e) => {
    // determine value robustly and detect manual vs programmatic
    const v = (e && e.target ? (e.target.value || "") : (sessionIdInput ? (sessionIdInput.value || "") : "")).trim();
    const isManual = !!(e && e.isTrusted);
    const isProgrammatic = !!(e && e.detail && e.detail.programmatic);

    console.log("[session change] value=", v, "isManual=", isManual, "isProgrammatic=", isProgrammatic);

    if (!v) {
  // user manually cleared -> reset internal state fully (fresh UI)
      if (isManual) {
        console.log("[session change] manual clear -> full reset");
        resetState();
        uploadedMap = {};
        sessionEnded = false;
        try { if (btnInit) btnInit.disabled = true; } catch (e) {}
        try { if (tokenInput) tokenInput.readOnly = false; } catch (e) {}
        renderState();
        return;
      }

  // programmatic clear -> keep snapshot visible, just clear uploadedMap to avoid mismatch
      if (isProgrammatic) {
        console.log("[session change] programmatic clear -> clear uploadedMap and reopen UI");
        uploadedMap = {};
    // IMPORTANT FIX: allow creating a new session after programmatic clear
        sessionEnded = false;
        try { if (btnInit) btnInit.disabled = false; } catch (e) {}
        try { if (tokenInput) tokenInput.readOnly = false; } catch (e) {}
        renderState();
        return;
      }

  // fallback
      console.log("[session change] clear (fallback) -> clearing uploadedMap");
      uploadedMap = {};
      sessionEnded = false;
      try { if (btnInit) btnInit.disabled = false; } catch (e) {}
      try { if (tokenInput) tokenInput.readOnly = false; } catch (e) {}
      renderState();
      return;
    }


    // 1) Try server first (authoritative)
    const serverResult = await restoreFromServer(v);
    console.log("[session change] serverResult:", serverResult);
    uploadedMap = serverResult.uploadedMap || {};

    // If server reports session finished -> do NOT auto-block UI.
    // Instead: inform user, remove the ivr_last_session so we won't auto-fill it again,
    // and load non-blocking local state if any (but don't set sessionEnded=true).
    if (serverResult.finished) {
      console.warn("[session] server says finished for", v);

      // Try to init local storage state for inspection (but do not block UI)
      try {
        const restored = initStateFromStorage(v);
        uploadedMap = restored.uploadedMap || uploadedMap || {};
        console.log("[session] initStateFromStorage (finished) ->", restored);
      } catch (e) {
        console.warn("[session] cannot initStateFromStorage for finished session", e);
      }

      // Remove the last-session pointer so we don't auto-fill again
      try { localStorage.removeItem("ivr_last_session"); } catch (e) { /* ignore */ }

      // Keep sessionEnded = false so user can create a new session
      sessionEnded = false;
      stopMediaCompletely();

      // Ensure recording UI is enabled for creating a new session
      try {
        if (btnStart) btnStart.disabled = true; // require init first
        if (btnStop) btnStop.disabled = true;
        if (btnUpload) btnUpload.disabled = true;
        if (btnEndSession) btnEndSession.disabled = true;
        if (btnInit) btnInit.disabled = false;
        if (tokenInput) tokenInput.readOnly = false;
      } catch (e) {}

      // Inform the user without blocking them
      alert("Phiên trước đã kết thúc. Bạn có thể tạo phiên mới bằng cách nhập token và bấm 'Xin quyền camera'.");

      renderState();
      console.log("[session] ignored finished session (auto-fill prevented)", v);
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
      // if server provided answered info, ensure internal state reflects it (initStateFromStorage will also write localStorage)
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

  // If there's sessionId prefilled in HTML, restore local state immediately (but avoid auto-block if finished)
  const sid = (sessionIdInput && (sessionIdInput.value || "").trim()) || "";
  if (sid) {
    try {
      const serverResult = await restoreFromServer(sid);
      if (serverResult.finished) {
        console.log('[init] prefilled session is finished, not auto-blocking', sid);
        try { localStorage.removeItem("ivr_last_session"); } catch (e) {}
        try {
          const restored = initStateFromStorage(sid);
          uploadedMap = restored.uploadedMap || {};
          renderState();
        } catch (e) { console.warn("[init] could not initStateFromStorage for finished prefilled", e); }
      } else {
        try {
          const restored = initStateFromStorage(sid);
          uploadedMap = restored.uploadedMap || {};
          renderState();
        } catch (e) {
          console.warn('[init] initStateFromStorage failed, but continuing', e);
        }
        console.log('[init] restored prefilled session', sid);
      }
    } catch (e) {
      // fallback: try local restore
      try {
        const restored = initStateFromStorage(sid);
        uploadedMap = restored.uploadedMap || {};
        renderState();
      } catch (err) {
        console.warn('[init] cannot restore prefilled session', sid, err);
      }
    }
  }

  // try auto-fill last session (but if server shows finished, don't auto-start camera)
  try {
    const last = localStorage.getItem("ivr_last_session");
    const currentToken = (tokenInput?.value || "").trim();
    // Only auto-fill if: no sessionId AND no token entered (user just opened page)
    if (last && !(sessionIdInput && sessionIdInput.value) && !currentToken) {
      console.log("[init] auto-fill last session (checking finished first)", last);
      const serverResult = await restoreFromServer(last);
      if (serverResult.finished) {
        console.log("[init] last session is finished -> clearing ivr_last_session and not auto-filling", last);
        try { localStorage.removeItem("ivr_last_session"); } catch (e) {}
      } else {
        if (sessionIdInput) {
          sessionIdInput.value = last;
          sessionIdInput.dispatchEvent(new CustomEvent("change", { bubbles: true, composed: true, detail: { programmatic: true } }));
        }
      }
    }
  } catch (e) {
    console.warn("[init] cannot auto-fill last session", e);
  }
});



