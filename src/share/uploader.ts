const PART_SIZE = 100 * 1024 * 1024;
const MAX_CONCURRENT = 4;
const MAX_PART_RETRIES = 3;

export interface UploadProgress {
  uploaded: number;
  total: number;
  stage: 'init' | 'parts' | 'complete' | 'done' | 'error';
  message?: string;
}

export interface UploadResult {
  shareUrl: string;
  shortid: string;
}

interface InitResponse {
  shortid: string;
  key: string;
  uploadId: string;
  partUrls: string[];
}

export async function shareUpload(
  file: File,
  onProgress: (p: UploadProgress) => void,
): Promise<UploadResult> {
  const partCount = Math.ceil(file.size / PART_SIZE);
  const ext = extensionFor(file);

  onProgress({ uploaded: 0, total: file.size, stage: 'init' });

  const initRes = await fetch('/api/upload/init', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      size: file.size,
      contentType: file.type,
      ext,
      partCount,
    }),
  });
  if (!initRes.ok) {
    const msg = await safeError(initRes);
    throw new Error(`Upload init failed: ${msg}`);
  }
  const init = (await initRes.json()) as InitResponse;

  onProgress({ uploaded: 0, total: file.size, stage: 'parts' });

  const partProgress = new Array<number>(partCount).fill(0);
  const parts: { PartNumber: number; ETag: string }[] = new Array(partCount);

  const uploadPart = async (partIndex: number): Promise<void> => {
    const start = partIndex * PART_SIZE;
    const end = Math.min(start + PART_SIZE, file.size);
    const blob = file.slice(start, end);
    const url = init.partUrls[partIndex];

    let lastError: unknown = null;
    for (let attempt = 0; attempt < MAX_PART_RETRIES; attempt++) {
      try {
        const etag = await putPart(url, blob, (loaded) => {
          partProgress[partIndex] = loaded;
          const uploaded = partProgress.reduce((a, b) => a + b, 0);
          onProgress({ uploaded, total: file.size, stage: 'parts' });
        });
        parts[partIndex] = { PartNumber: partIndex + 1, ETag: etag };
        partProgress[partIndex] = blob.size;
        return;
      } catch (err) {
        lastError = err;
        await sleep(400 * Math.pow(2, attempt));
      }
    }
    throw lastError instanceof Error ? lastError : new Error(`Part ${partIndex + 1} failed`);
  };

  try {
    await runWithConcurrency(partCount, MAX_CONCURRENT, uploadPart);
  } catch (err) {
    await abortUpload(init.key, init.uploadId).catch(() => { /* best effort */ });
    const msg = err instanceof Error ? err.message : String(err);
    onProgress({ uploaded: 0, total: file.size, stage: 'error', message: msg });
    throw err;
  }

  onProgress({ uploaded: file.size, total: file.size, stage: 'complete' });

  const completeRes = await fetch('/api/upload/complete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key: init.key, uploadId: init.uploadId, parts }),
  });
  if (!completeRes.ok) {
    await abortUpload(init.key, init.uploadId).catch(() => { /* best effort */ });
    const msg = await safeError(completeRes);
    onProgress({ uploaded: 0, total: file.size, stage: 'error', message: msg });
    throw new Error(`Upload complete failed: ${msg}`);
  }
  const { shareUrl } = (await completeRes.json()) as { shareUrl: string };

  onProgress({ uploaded: file.size, total: file.size, stage: 'done' });
  return { shareUrl, shortid: init.shortid };
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

function putPart(url: string, blob: Blob, onProgress: (loaded: number) => void): Promise<string> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url, true);
    xhr.upload.onprogress = (ev) => { if (ev.lengthComputable) onProgress(ev.loaded); };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        const etag = xhr.getResponseHeader('ETag') ?? xhr.getResponseHeader('etag');
        if (!etag) return reject(new Error('No ETag on part response'));
        resolve(etag);
      } else {
        reject(new Error(`Part PUT ${xhr.status}`));
      }
    };
    xhr.onerror = () => reject(new Error('Part PUT network error'));
    xhr.onabort = () => reject(new Error('Part PUT aborted'));
    xhr.send(blob);
  });
}

async function runWithConcurrency(total: number, limit: number, run: (i: number) => Promise<void>): Promise<void> {
  let next = 0;
  const workers: Promise<void>[] = [];
  for (let w = 0; w < Math.min(limit, total); w++) {
    workers.push((async () => {
      while (true) {
        const i = next++;
        if (i >= total) return;
        await run(i);
      }
    })());
  }
  await Promise.all(workers);
}

async function abortUpload(key: string, uploadId: string): Promise<void> {
  await fetch('/api/upload/complete', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key, uploadId }),
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
