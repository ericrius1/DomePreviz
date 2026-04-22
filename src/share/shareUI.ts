import { shareUpload, type UploadProgress } from './uploader';

interface UploadUI {
  startUpload(file: File): void;
}

export function createUploadUI(): UploadUI {
  const bar = document.createElement('div');
  bar.className = 'upload-bar';
  bar.innerHTML = `
    <div class="upload-bar-label">Uploading…</div>
    <div class="upload-bar-track"><div class="upload-bar-fill"></div></div>
  `;
  document.body.appendChild(bar);

  const label = bar.querySelector('.upload-bar-label') as HTMLDivElement;
  const fill = bar.querySelector('.upload-bar-fill') as HTMLDivElement;

  let activeUploadToken = 0;

  const hideBar = () => { bar.classList.remove('visible'); };
  const showBar = () => { bar.classList.add('visible'); };

  function showSuccessModal(shareUrl: string) {
    const fullUrl = new URL(shareUrl, window.location.origin).toString();

    const overlay = document.createElement('div');
    overlay.className = 'upload-modal-overlay';
    overlay.innerHTML = `
      <div class="upload-modal">
        <div class="upload-modal-title">Video successfully uploaded</div>
        <div class="upload-modal-url" tabindex="0"></div>
        <div class="upload-modal-actions">
          <button class="upload-modal-btn upload-modal-copy">Copy link</button>
          <button class="upload-modal-btn upload-modal-open">Open</button>
          <button class="upload-modal-btn upload-modal-close">Close</button>
        </div>
        <div class="upload-modal-status"></div>
      </div>
    `;
    const urlEl = overlay.querySelector('.upload-modal-url') as HTMLDivElement;
    urlEl.textContent = fullUrl;
    const copyBtn = overlay.querySelector('.upload-modal-copy') as HTMLButtonElement;
    const openBtn = overlay.querySelector('.upload-modal-open') as HTMLButtonElement;
    const closeBtn = overlay.querySelector('.upload-modal-close') as HTMLButtonElement;
    const statusEl = overlay.querySelector('.upload-modal-status') as HTMLDivElement;

    const close = () => overlay.remove();

    copyBtn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(fullUrl);
        statusEl.textContent = 'Link copied to clipboard.';
      } catch {
        statusEl.textContent = 'Copy failed — select the URL manually.';
        selectText(urlEl);
      }
    });
    openBtn.addEventListener('click', () => window.open(fullUrl, '_blank', 'noopener'));
    closeBtn.addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    document.addEventListener('keydown', function onKey(e) {
      if (e.key === 'Escape') { close(); document.removeEventListener('keydown', onKey); }
    });

    document.body.appendChild(overlay);
    copyBtn.focus();
  }

  function showErrorModal(message: string, retry: () => void) {
    const overlay = document.createElement('div');
    overlay.className = 'upload-modal-overlay';
    overlay.innerHTML = `
      <div class="upload-modal">
        <div class="upload-modal-title upload-modal-title-error">Upload failed</div>
        <div class="upload-modal-error"></div>
        <div class="upload-modal-actions">
          <button class="upload-modal-btn upload-modal-retry">Retry</button>
          <button class="upload-modal-btn upload-modal-close">Close</button>
        </div>
      </div>
    `;
    (overlay.querySelector('.upload-modal-error') as HTMLDivElement).textContent = message;
    const retryBtn = overlay.querySelector('.upload-modal-retry') as HTMLButtonElement;
    const closeBtn = overlay.querySelector('.upload-modal-close') as HTMLButtonElement;
    const close = () => overlay.remove();
    retryBtn.addEventListener('click', () => { close(); retry(); });
    closeBtn.addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    document.body.appendChild(overlay);
    retryBtn.focus();
  }

  function startUpload(file: File) {
    const token = ++activeUploadToken;
    fill.style.width = '0%';
    label.textContent = `Uploading ${file.name}…`;
    showBar();

    const onProgress = (p: UploadProgress) => {
      if (token !== activeUploadToken) return;
      if (p.stage === 'init') {
        label.textContent = `Preparing upload…`;
        fill.style.width = '2%';
      } else if (p.stage === 'uploading') {
        const pct = p.total > 0 ? (p.uploaded / p.total) * 100 : 0;
        fill.style.width = `${pct.toFixed(1)}%`;
        label.textContent = `Uploading ${formatBytes(p.uploaded)} / ${formatBytes(p.total)}`;
      } else if (p.stage === 'done') {
        fill.style.width = '100%';
        label.textContent = 'Upload complete.';
      } else if (p.stage === 'error') {
        label.textContent = `Upload failed: ${p.message ?? 'unknown'}`;
      }
    };

    shareUpload(file, onProgress)
      .then(({ shareUrl }) => {
        if (token !== activeUploadToken) return;
        setTimeout(hideBar, 400);
        showSuccessModal(shareUrl);
      })
      .catch((err) => {
        if (token !== activeUploadToken) return;
        hideBar();
        const msg = err instanceof Error ? err.message : String(err);
        showErrorModal(msg, () => startUpload(file));
      });
  }

  return { startUpload };
}

function selectText(el: HTMLElement) {
  const range = document.createRange();
  range.selectNodeContents(el);
  const sel = window.getSelection();
  if (!sel) return;
  sel.removeAllRanges();
  sel.addRange(range);
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
