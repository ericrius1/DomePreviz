import * as THREE from 'three';
import type { TemplateAction, AudioBusLike, TweakpaneSchema, Video360SourceProjection } from '../types';
import { Video360Audio } from '../audio/templates/Video360Audio';

export interface Video360Source {
  texture: THREE.Texture;
  projection: Video360SourceProjection;
  width: number;
  height: number;
  megapixels: number;
  highRes: boolean;
  label: string;
}

export interface Video360PlaybackStats {
  droppedVideoFrames: number;
  totalVideoFrames: number;
  droppedThisInterval: number;
  dropRate: number;
  processingDurationMs: number | null;
}

type PlaybackQualityVideo = HTMLVideoElement & {
  getVideoPlaybackQuality?: () => { droppedVideoFrames: number; totalVideoFrames: number };
};

type VideoFrameMetadataLite = {
  presentedFrames: number;
  processingDuration?: number;
};

type VideoFrameCallbackVideo = HTMLVideoElement & {
  requestVideoFrameCallback?: (
    callback: (now: number, metadata: VideoFrameMetadataLite) => void,
  ) => number;
  cancelVideoFrameCallback?: (handle: number) => void;
};

export class Video360Template {
  private group = new THREE.Group();
  private audio: Video360Audio | null = null;
  private video: HTMLVideoElement;
  private videoObjectUrl: string | null = null;
  private videoTexture: THREE.VideoTexture | null = null;
  private imageTexture: THREE.Texture | null = null;
  private material: THREE.MeshBasicMaterial | null = null;
  private sphere: THREE.Mesh | null = null;
  private _bus: AudioBusLike | null = null;
  private dropzone: HTMLDivElement | null = null;
  private viewerMode = false;
  private decodeMonitorHandle: number | null = null;
  private videoFrameCallbackHandle: number | null = null;
  private lastProcessingDurationMs: number | null = null;
  currentFile: File | null = null;

  // Set by main.ts to route the loaded source texture directly into the dome material,
  // bypassing the cube-map roundtrip and using the right source projection.
  onSourceChange?: (source: Video360Source | null) => void;

  // Fired after a user-provided File is loaded into the sphere (editor mode only).
  // main.ts wires this to reveal the Share button.
  onFileLoaded?: (file: File) => void;

  // Fired when the loaded file is cleared. main.ts uses this to hide the Share button.
  onCleared?: () => void;

  onSourceResolutionChange?: (label: string) => void;
  onPlaybackStatsChange?: (stats: Video360PlaybackStats | null) => void;

  params = {
    play: true,
    loop: true,
    fileLabel: '(none loaded)',
  };

  private setSourceResolution(label: string) {
    this.onSourceResolutionChange?.(label);
  }

  private detectProjection(width: number, height: number): Video360SourceProjection {
    const aspect = width / Math.max(1, height);
    return Math.abs(aspect - 1) <= 0.12 ? 'fisheye' : 'equirect';
  }

  private isHighResSource(width: number, height: number): boolean {
    return width * height >= 24_000_000 || Math.max(width, height) >= 7680;
  }

  private configureTexture(tex: THREE.Texture, projection: Video360SourceProjection) {
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = projection === 'equirect' ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = false;
    tex.needsUpdate = true;
  }

  private publishSource(tex: THREE.Texture, width: number, height: number) {
    const projection = this.detectProjection(width, height);
    const megapixels = (width * height) / 1_000_000;
    const highRes = this.isHighResSource(width, height);
    const projectionLabel = projection === 'fisheye' ? 'fisheye dome master' : 'equirect';
    const label = `${width}×${height} ${projectionLabel}`;
    this.configureTexture(tex, projection);
    this.setSourceResolution(`${label}${highRes ? ' · performance preview' : ''}`);
    this.onSourceChange?.({ texture: tex, projection, width, height, megapixels, highRes, label });
  }

  // Surfaces decode-quality hints once playback starts. Software decode of 8K
  // HEVC/AV1 is the most common cause of "ultra choppy" reports; getVideoPlaybackQuality
  // reveals dropped frames a few seconds in.
  private monitorDecodeHealth() {
    this.stopPlaybackMonitors();
    this.monitorVideoFrames();
    const v = this.video as PlaybackQualityVideo;
    if (typeof v.getVideoPlaybackQuality !== 'function') return;
    let lastDropped = 0;
    this.decodeMonitorHandle = window.setInterval(() => {
      if (v.paused || v.ended || !v.src) return;
      const q = v.getVideoPlaybackQuality!();
      const delta = q.droppedVideoFrames - lastDropped;
      lastDropped = q.droppedVideoFrames;
      const dropRate = q.totalVideoFrames > 0 ? q.droppedVideoFrames / q.totalVideoFrames : 0;
      this.onPlaybackStatsChange?.({
        droppedVideoFrames: q.droppedVideoFrames,
        totalVideoFrames: q.totalVideoFrames,
        droppedThisInterval: delta,
        dropRate,
        processingDurationMs: this.lastProcessingDurationMs,
      });
      if (q.totalVideoFrames > 60 && delta > 5) {
        const pct = Math.round(dropRate * 100);
        const decodeMs = this.lastProcessingDurationMs === null ? 'n/a' : `${this.lastProcessingDurationMs.toFixed(1)}ms`;
        console.warn(
          `[Video360] ${delta} frames dropped in last interval (${q.droppedVideoFrames}/${q.totalVideoFrames} total). ` +
          `Drop rate ${pct}%, decode ${decodeMs} at ${v.videoWidth}×${v.videoHeight}. ` +
          'Try a 4K/6K proxy or H.264/VideoToolbox HEVC.'
        );
      }
    }, 2000);
  }

  private monitorVideoFrames() {
    const v = this.video as VideoFrameCallbackVideo;
    if (typeof v.requestVideoFrameCallback !== 'function') return;

    const update = (_now: number, metadata: VideoFrameMetadataLite) => {
      this.lastProcessingDurationMs = typeof metadata.processingDuration === 'number'
        ? metadata.processingDuration * 1000
        : null;
      this.videoFrameCallbackHandle = v.requestVideoFrameCallback?.(update) ?? null;
    };
    this.videoFrameCallbackHandle = v.requestVideoFrameCallback(update);
  }

  private stopPlaybackMonitors() {
    if (this.decodeMonitorHandle !== null) {
      window.clearInterval(this.decodeMonitorHandle);
      this.decodeMonitorHandle = null;
    }
    const v = this.video as VideoFrameCallbackVideo;
    if (this.videoFrameCallbackHandle !== null && typeof v.cancelVideoFrameCallback === 'function') {
      v.cancelVideoFrameCallback(this.videoFrameCallbackHandle);
    }
    this.videoFrameCallbackHandle = null;
    this.lastProcessingDurationMs = null;
    this.onPlaybackStatsChange?.(null);
  }

  constructor() {
    this.video = document.createElement('video');
    this.video.crossOrigin = 'anonymous';
    this.video.loop = true;
    this.video.muted = false;
    this.video.playsInline = true;
    this.video.preload = 'auto';
    this.video.disableRemotePlayback = true;
    this.video.style.display = 'none';
    document.body.appendChild(this.video);
  }

  init(scene: THREE.Scene, bus: AudioBusLike): void {
    this._bus = bus;
    scene.background = new THREE.Color(0x000000);
    scene.add(new THREE.AmbientLight(0xffffff, 1));

    this.videoTexture = new THREE.VideoTexture(this.video);
    this.videoTexture.colorSpace = THREE.SRGBColorSpace;
    this.videoTexture.wrapS = THREE.RepeatWrapping;

    const geom = new THREE.SphereGeometry(50, 128, 128);
    geom.scale(-1, 1, 1);
    this.material = new THREE.MeshBasicMaterial({ map: this.videoTexture });
    this.sphere = new THREE.Mesh(geom, this.material);
    this.group.add(this.sphere);
    scene.add(this.group);

    this.audio = new Video360Audio(bus);

    if (!this.viewerMode) {
      this.dropzone = document.createElement('div');
      this.dropzone.className = 'video360-dropzone';
      this.dropzone.textContent = 'Drop 360 video or image here';
      document.body.appendChild(this.dropzone);

      window.addEventListener('dragover', this.onDragOver);
      window.addEventListener('dragleave', this.onDragLeave);
      window.addEventListener('drop', this.onDrop);
    }
  }

  setViewerMode(on: boolean) { this.viewerMode = on; }

  loadFile(file: File) {
    this.currentFile = file;
    if (file.type.startsWith('video/')) this.loadVideoFile(file);
    else if (file.type.startsWith('image/')) this.loadImageFile(file);
    else return;
    if (!this.viewerMode) this.onFileLoaded?.(file);
  }

  loadFromUrl(url: string, kind: 'video' | 'image') {
    this.currentFile = null;
    if (kind === 'video') this.loadVideoUrl(url);
    else this.loadImageUrl(url);
  }

  private loadVideoUrl(url: string) {
    this.stopPlaybackMonitors();
    this.onSourceChange?.(null);
    if (this.videoObjectUrl) { URL.revokeObjectURL(this.videoObjectUrl); this.videoObjectUrl = null; }
    this.video.crossOrigin = 'anonymous';
    this.video.src = url;
    this.params.fileLabel = '(shared)';
    if (this.dropzone) this.dropzone.style.display = 'none';
    if (this.material && this.videoTexture && this.material.map !== this.videoTexture) {
      this.material.map = this.videoTexture;
      this.material.needsUpdate = true;
    }
    this.disposeImageTexture();
    this.video.addEventListener('loadeddata', () => {
      if (this._bus && this.audio) this.audio.attachVideo(this.video);
      if (this.params.play) this.video.play().catch(() => { /* autoplay blocked */ });
      if (this.videoTexture) this.publishSource(this.videoTexture, this.video.videoWidth, this.video.videoHeight);
      this.monitorDecodeHealth();
    }, { once: true });
  }

  private loadImageUrl(url: string) {
    this.stopPlaybackMonitors();
    this.onSourceChange?.(null);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      this.disposeImageTexture();
      const tex = new THREE.Texture(img);
      this.imageTexture = tex;
      if (this.material) {
        this.material.map = tex;
        this.material.needsUpdate = true;
      }
      if (!this.video.paused) this.video.pause();
      this.params.fileLabel = '(shared)';
      if (this.dropzone) this.dropzone.style.display = 'none';
      this.publishSource(tex, img.width, img.height);
    };
    img.src = url;
  }

  private loadVideoFile(file: File) {
    this.stopPlaybackMonitors();
    this.onSourceChange?.(null);
    if (this.videoObjectUrl) URL.revokeObjectURL(this.videoObjectUrl);
    const url = URL.createObjectURL(file);
    this.videoObjectUrl = url;
    this.video.src = url;
    this.params.fileLabel = file.name;
    if (this.dropzone) this.dropzone.style.display = 'none';
    if (this.material && this.videoTexture && this.material.map !== this.videoTexture) {
      this.material.map = this.videoTexture;
      this.material.needsUpdate = true;
    }
    this.disposeImageTexture();
    this.video.addEventListener('loadeddata', () => {
      if (this._bus && this.audio) this.audio.attachVideo(this.video);
      if (this.params.play) this.video.play().catch(() => { /* autoplay blocked */ });
      if (this.videoTexture) this.publishSource(this.videoTexture, this.video.videoWidth, this.video.videoHeight);
      this.monitorDecodeHealth();
    }, { once: true });
  }

  private loadImageFile(file: File) {
    this.stopPlaybackMonitors();
    this.onSourceChange?.(null);
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      this.disposeImageTexture();
      const tex = new THREE.Texture(img);
      this.imageTexture = tex;
      if (this.material) {
        this.material.map = tex;
        this.material.needsUpdate = true;
      }
      if (!this.video.paused) this.video.pause();
      this.params.fileLabel = file.name;
      if (this.dropzone) this.dropzone.style.display = 'none';
      this.publishSource(tex, img.width, img.height);
      URL.revokeObjectURL(url);
    };
    img.onerror = () => URL.revokeObjectURL(url);
    img.src = url;
  }

  private onDragOver = (e: DragEvent) => {
    e.preventDefault();
    this.dropzone?.classList.add('active');
  };
  private onDragLeave = (e: DragEvent) => {
    if (!e.relatedTarget) this.dropzone?.classList.remove('active');
  };
  private onDrop = (e: DragEvent) => {
    e.preventDefault();
    this.dropzone?.classList.remove('active');
    const file = e.dataTransfer?.files?.[0];
    if (!file) return;
    if (file.type.startsWith('video/') || file.type.startsWith('image/')) this.loadFile(file);
  };

  update(_dt: number, _time: number): void {
    this.video.loop = this.params.loop;
    const showingVideo = this.material?.map === this.videoTexture;
    if (!showingVideo) return;
    if (this.params.play && this.video.paused && this.video.src) this.video.play().catch(() => { /* autoplay blocked */ });
    if (!this.params.play && !this.video.paused) this.video.pause();
  }

  pauseForExternalWork(): boolean {
    const shouldResume = this.params.play && !this.video.paused && !this.video.ended;
    this.params.play = false;
    if (!this.video.paused) this.video.pause();
    return shouldResume;
  }

  setPlaybackEnabled(on: boolean) {
    this.params.play = on;
    if (on && this.video.src) this.video.play().catch(() => { /* autoplay blocked */ });
    if (!on && !this.video.paused) this.video.pause();
  }

  private disposeImageTexture() {
    if (this.imageTexture) {
      this.imageTexture.dispose();
      this.imageTexture = null;
    }
  }

  clear(): void {
    this.stopPlaybackMonitors();
    this.video.pause();
    this.video.removeAttribute('src');
    this.video.load();
    if (this.videoObjectUrl) {
      URL.revokeObjectURL(this.videoObjectUrl);
      this.videoObjectUrl = null;
    }
    this.disposeImageTexture();
    if (this.material) {
      this.material.map = null;
      this.material.needsUpdate = true;
    }
    this.audio?.detach();
    this.currentFile = null;
    this.params.fileLabel = '(none loaded)';
    this.setSourceResolution('(none)');
    if (this.dropzone) this.dropzone.style.display = '';
    this.onSourceChange?.(null);
    this.onCleared?.();
  }

  getActions(): TemplateAction[] {
    return [{ label: 'Clear', run: () => this.clear() }];
  }

  dispose(): void {
    this.stopPlaybackMonitors();
    this.onSourceChange?.(null);
    window.removeEventListener('dragover', this.onDragOver);
    window.removeEventListener('dragleave', this.onDragLeave);
    window.removeEventListener('drop', this.onDrop);
    this.dropzone?.remove();
    this.dropzone = null;
    this.audio?.dispose();
    this.video.pause();
    this.video.removeAttribute('src');
    this.video.remove();
    if (this.videoObjectUrl) {
      URL.revokeObjectURL(this.videoObjectUrl);
      this.videoObjectUrl = null;
    }
    this.videoTexture?.dispose();
    this.disposeImageTexture();
    this.group.parent?.remove(this.group);
    this.sphere?.geometry.dispose();
    if (this.sphere) (this.sphere.material as THREE.Material).dispose();
  }

  getParams(): TweakpaneSchema { return this.params as unknown as TweakpaneSchema; }
}
