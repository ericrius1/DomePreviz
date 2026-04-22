import type { TweakpaneUI } from '../ui/TweakpaneUI';
import { shareUpload, type UploadProgress } from './uploader';

export function mountShareUI(ui: TweakpaneUI, getFile: () => File | null) {
  const folder = ui.pane.addFolder({ title: 'Share' });

  const state = {
    status: 'Drop a video or image, then click Share.',
    progress: 0,
    shareUrl: '',
  };

  folder.addBinding(state, 'status', { readonly: true });
  folder.addBinding(state, 'progress', { readonly: true, view: 'graph', min: 0, max: 1 });
  folder.addBinding(state, 'shareUrl', { readonly: true, label: 'URL' });

  let uploading = false;

  const shareBtn = folder.addButton({ title: 'Share' }).on('click', async () => {
    if (uploading) return;
    const file = getFile();
    if (!file) {
      state.status = 'No file loaded. Drop one first.';
      ui.pane.refresh();
      return;
    }
    uploading = true;
    state.shareUrl = '';
    state.progress = 0;
    state.status = 'Starting upload…';
    ui.pane.refresh();

    try {
      const onProgress = (p: UploadProgress) => {
        if (p.stage === 'init') state.status = 'Requesting upload URLs…';
        else if (p.stage === 'parts') {
          state.progress = p.total > 0 ? p.uploaded / p.total : 0;
          state.status = `Uploading… ${formatBytes(p.uploaded)} / ${formatBytes(p.total)}`;
        } else if (p.stage === 'complete') {
          state.progress = 1;
          state.status = 'Finalizing…';
        } else if (p.stage === 'done') {
          state.progress = 1;
          state.status = 'Done.';
        } else if (p.stage === 'error') {
          state.progress = 0;
          state.status = `Error: ${p.message ?? 'unknown'}`;
        }
        ui.pane.refresh();
      };

      const { shareUrl } = await shareUpload(file, onProgress);
      const full = new URL(shareUrl, window.location.origin).toString();
      state.shareUrl = full;
      state.status = 'Done — click Copy Link.';
      ui.pane.refresh();
    } catch (err) {
      state.status = `Error: ${err instanceof Error ? err.message : String(err)}`;
      ui.pane.refresh();
    } finally {
      uploading = false;
    }
  });

  folder.addButton({ title: 'Copy Link' }).on('click', async () => {
    if (!state.shareUrl) return;
    try {
      await navigator.clipboard.writeText(state.shareUrl);
      state.status = 'Link copied.';
      ui.pane.refresh();
    } catch {
      state.status = 'Copy failed — select the URL field manually.';
      ui.pane.refresh();
    }
  });

  void shareBtn;
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
