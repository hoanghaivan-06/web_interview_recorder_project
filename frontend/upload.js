// frontend/upload.js
// Minimal safe uploader — default URL ép cứng về backend port 3000
const DEFAULT_UPLOAD_URL = 'http://127.0.0.1:3000/api/upload';

export function uploadFileWithProgress(file, url = DEFAULT_UPLOAD_URL, sessionId, question, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    // debug: chắc chắn URL đang dùng
    console.log('[upload] Sending to:', url, 'sessionId=', sessionId, 'question=', question);

    // Mở POST tới URL tuyệt đối; true = async
    xhr.open("POST", url, true);

    // tránh một số cross-site credential behaviors (không cần cookies)
    xhr.withCredentials = false;

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) {
        const pct = Math.round((e.loaded / e.total) * 100);
        onProgress(pct);
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const parsed = JSON.parse(xhr.responseText);
          resolve(parsed);
        } catch (err) {
          resolve({ ok: true, raw: xhr.responseText });
        }
      } else {
        let msg = `HTTP ${xhr.status}`;
        try {
          msg = JSON.parse(xhr.responseText).message || msg;
        } catch (_) {}
        reject(new Error(msg));
      }
    };

    xhr.onerror = () => reject(new Error("Lỗi mạng khi upload"));

    const form = new FormData();
    form.append("file", file, file.name);
    if (sessionId != null) form.append("sessionId", sessionId);
    if (question != null) form.append("question", String(question));

    xhr.send(form);
  });
}

export async function uploadWithRetry(file, url = DEFAULT_UPLOAD_URL, sessionId, question, onProgress, attempts = 3) {
  let lastErr = null;

  for (let i = 1; i <= attempts; i++) {
    try {
      const res = await uploadFileWithProgress(file, url, sessionId, question, onProgress);
      // small validation: server nên trả { ok: true, filename, uploadedAt, ... }
      if (res && typeof res === 'object') {
        return res;
      }
      // nếu không đúng format thì vẫn trả về success wrapper
      return { ok: true, raw: res };
    } catch (err) {
      lastErr = err;
      console.warn(`Upload attempt ${i} failed for q${question}:`, err.message || err);
      if (i < attempts) await new Promise(r => setTimeout(r, 700));
    }
  }

  throw lastErr;
}
