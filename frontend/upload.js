export function uploadFileWithProgress(file, url, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) {
        const pct = Math.round((e.loaded / e.total) * 100);
        onProgress(pct);
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(xhr.responseText);
      } else {
        reject(new Error(`HTTP ${xhr.status}`));
      }
    };

    xhr.onerror = () => reject(new Error("Lỗi mạng khi upload"));

    const form = new FormData();
    form.append("file", file, file.name);

    xhr.send(form);
  });
}

export async function uploadWithRetry(file, url, onProgress, attempts = 3) {
  let lastErr = null;

  for (let i = 1; i <= attempts; i++) {
    try {
      return await uploadFileWithProgress(file, url, onProgress);
    } catch (err) {
      lastErr = err;
      await new Promise(r => setTimeout(r, 700));
    }
  }

  throw lastErr;
}
