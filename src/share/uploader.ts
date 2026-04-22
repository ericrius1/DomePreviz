export interface UploadProgress {
  uploaded: number;
  total: number;
  stage: 'init' | 'uploading' | 'done' | 'error';
  message?: string;
}

export interface UploadResult {
  shareUrl: string;
  shortid: string;
}

interface UploadInitResponse {
  shortid: string;
  key: string;
  putUrl: string;
  shareUrl: string;
}

export async function shareUpload(
  file: File,
  onProgress: (p: UploadProgress) => void,
): Promise<UploadResult> {
  onProgress({ uploaded: 0, total: file.size, stage: 'init' });

  const initRes = await fetch('/api/upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      size: file.size,
      contentType: file.type,
      ext: extensionFor(file),
    }),
  });
  if (!initRes.ok) {
    const msg = await safeError(initRes);
    onProgress({ uploaded: 0, total: file.size, stage: 'error', message: msg });
    throw new Error(`Upload init failed: ${msg}`);
  }
  const init = (await initRes.json()) as UploadInitResponse;

  onProgress({ uploaded: 0, total: file.size, stage: 'uploading' });

  try {
    await putObject(init.putUrl, file, (loaded) => {
      onProgress({ uploaded: loaded, total: file.size, stage: 'uploading' });
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    onProgress({ uploaded: 0, total: file.size, stage: 'error', message: msg });
    throw err;
  }

  onProgress({ uploaded: file.size, total: file.size, stage: 'done' });
  return { shareUrl: init.shareUrl, shortid: init.shortid };
}

function extensionFor(file: File): string {
  const dot = file.name.lastIndexOf('.');
  if (dot >= 0 && dot < file.name.length - 1) return file.name.slice(dot + 1).toLowerCase();
  if (file.type === 'video/mp4') return 'mp4';
  if (file.type === 'video/webm') return 'webm';
  if (file.type === 'image/jpeg') return 'jpg';
  if (file.type === 'image/png') return 'png';
  return 'bin';
}

function putObject(url: string, file: File, onProgress: (loaded: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url, true);
    xhr.setRequestHeader('Content-Type', file.type);
    xhr.upload.onprogress = (ev) => { if (ev.lengthComputable) onProgress(ev.loaded); };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`PUT ${xhr.status}${xhr.responseText ? `: ${xhr.responseText}` : ''}`));
    };
    xhr.onerror = () => reject(new Error('Network error during upload (check R2 CORS)'));
    xhr.onabort = () => reject(new Error('Upload aborted'));
    xhr.send(file);
  });
}

async function safeError(res: Response): Promise<string> {
  try {
    const text = await res.text();
    return text || `${res.status}`;
  } catch {
    return `${res.status}`;
  }
}
