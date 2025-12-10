// frontend/upload.js
const DEFAULT_UPLOAD_URL = 'http://127.0.0.1:3000/api/upload';

export function uploadFileWithProgress(file, url = DEFAULT_UPLOAD_URL, sessionId, question, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    console.log('[upload] Sending to:', url, 'sessionId=', sessionId, 'question=', question);

    xhr.open("POST", url, true);
    xhr.withCredentials = false;

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) {
        const pct = Math.round((e.loaded / e.total) * 100);
        onProgress(pct);
      }
    };

    xhr.onload = () => {
      // Always log raw response for debugging
      console.log('[upload] xhr.onload status=', xhr.status, 'responseText length=', (xhr.responseText || '').length);
      console.log('[upload] raw responseText:', xhr.responseText);

      if (xhr.status >= 200 && xhr.status < 300) {
        // Try parse JSON, but always resolve something useful
        try {
          const parsed = JSON.parse(xhr.responseText || '{}');
          console.log('[upload] parsed response:', parsed);
          // Ensure we always include something the caller can rely on
          return resolve(parsed);
        } catch (err) {
          console.warn('[upload] response not JSON, returning raw text');
          return resolve({ ok: true, raw: xhr.responseText });
        }
      } else {
        let msg = `HTTP ${xhr.status}`;
        try {
          const body = JSON.parse(xhr.responseText || '{}');
          msg = body.message || msg;
        } catch (_) {}
        console.error('[upload] failed status', xhr.status, 'msg=', msg);
        return reject(new Error(msg));
      }
    };

    xhr.onerror = () => {
      console.error('[upload] xhr.onerror');
      return reject(new Error("Lỗi mạng khi upload"));
    };

    const form = new FormData();
    form.append("file", file, file.name);
    if (sessionId != null) form.append("sessionId", sessionId);
    if (question != null) form.append("question", String(question));

    try {
      xhr.send(form);
    } catch (err) {
      console.error('[upload] xhr.send error', err);
      reject(err);
    }
  });
}

export async function uploadWithRetry(file, url = DEFAULT_UPLOAD_URL, sessionId, question, onProgress, attempts = 3) {
  let lastErr = null;

  for (let i = 1; i <= attempts; i++) {
    try {
      console.log(`[uploadWithRetry] attempt ${i} for q${question}`);
      const res = await uploadFileWithProgress(file, url, sessionId, question, onProgress);

      // If server returns object, trust it
      if (res && typeof res === 'object') {
        console.log('[uploadWithRetry] success result:', res);
        return res;
      }

      // fallback
      console.warn('[uploadWithRetry] unexpected response type, wrapping into object', res);
      return { ok: true, raw: res };
    } catch (err) {
      lastErr = err;
      console.warn(`[uploadWithRetry] attempt ${i} failed for q${question}:`, err.message || err);
      if (i < attempts) await new Promise(r => setTimeout(r, 700));
    }
  }

  console.error('[uploadWithRetry] all attempts failed', lastErr);
  throw lastErr;
}
