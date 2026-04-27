import * as THREE from 'three';
import type { TemplateAction, AudioBusLike, TweakpaneSchema } from '../types';
import { Video360Audio } from '../audio/templates/Video360Audio';

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
  currentFile: File | null = null;

  // Set by main.ts to route the loaded equirect texture directly into the dome material,
  // bypassing the cube-map roundtrip that otherwise produces visible face-boundary seams.
  onEquirectSource?: (tex: THREE.Texture | null) => void;

  // Fired after a user-provided File is loaded into the sphere (editor mode only).
  // main.ts wires this to auto-start the share upload.
  onFileLoaded?: (file: File) => void;

  onSourceResolutionChange?: (label: string) => void;

  params = {
    play: true,
    loop: true,
    fileLabel: '(none loaded)',
  };

  private setSourceResolution(label: string) {
    this.onSourceResolutionChange?.(label);
  }

  // Surfaces decode-quality hints once playback starts. Software decode of 8K
  // HEVC/AV1 is the most common cause of "ultra choppy" reports; getVideoPlaybackQuality
  // reveals dropped frames a few seconds in.
  private monitorDecodeHealth() {
    const v = this.video as HTMLVideoElement & {
      getVideoPlaybackQuality?: () => { droppedVideoFrames: number; totalVideoFrames: number };
    };
    if (typeof v.getVideoPlaybackQuality !== 'function') return;
    let lastDropped = 0;
    const handle = window.setInterval(() => {
      if (v.paused || v.ended || !v.src) return;
      const q = v.getVideoPlaybackQuality!();
      const delta = q.droppedVideoFrames - lastDropped;
      lastDropped = q.droppedVideoFrames;
      if (q.totalVideoFrames > 60 && delta > 5) {
        console.warn(
          `[Video360] ${delta} frames dropped in last interval (${q.droppedVideoFrames}/${q.totalVideoFrames} total). ` +
          `Likely software decode at ${v.videoWidth}×${v.videoHeight} — try H.264 or HW-accelerated HEVC/AV1.`
        );
      }
    }, 2000);
    this.video.addEventListener('emptied', () => window.clearInterval(handle), { once: true });
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
      this.setSourceResolution(`${this.video.videoWidth}×${this.video.videoHeight}`);
      if (this.videoTexture) this.onEquirectSource?.(this.videoTexture);
      this.monitorDecodeHealth();
    }, { once: true });
  }

  private loadImageUrl(url: string) {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      this.disposeImageTexture();
      const tex = new THREE.Texture(img);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.wrapS = THREE.RepeatWrapping;
      tex.minFilter = THREE.LinearFilter;
      tex.magFilter = THREE.LinearFilter;
      tex.generateMipmaps = false;
      tex.needsUpdate = true;
      this.imageTexture = tex;
      if (this.material) {
        this.material.map = tex;
        this.material.needsUpdate = true;
      }
      if (!this.video.paused) this.video.pause();
      this.params.fileLabel = '(shared)';
      this.setSourceResolution(`${img.width}×${img.height}`);
      if (this.dropzone) this.dropzone.style.display = 'none';
      this.onEquirectSource?.(tex);
    };
    img.src = url;
  }

  private loadVideoFile(file: File) {
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
      this.setSourceResolution(`${this.video.videoWidth}×${this.video.videoHeight}`);
      if (this.videoTexture) this.onEquirectSource?.(this.videoTexture);
      this.monitorDecodeHealth();
    }, { once: true });
  }

  private loadImageFile(file: File) {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      this.disposeImageTexture();
      const tex = new THREE.Texture(img);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.wrapS = THREE.RepeatWrapping;
      tex.minFilter = THREE.LinearFilter;
      tex.magFilter = THREE.LinearFilter;
      tex.generateMipmaps = false;
      tex.needsUpdate = true;
      this.imageTexture = tex;
      if (this.material) {
        this.material.map = tex;
        this.material.needsUpdate = true;
      }
      if (!this.video.paused) this.video.pause();
      this.params.fileLabel = file.name;
      this.setSourceResolution(`${img.width}×${img.height}`);
      if (this.dropzone) this.dropzone.style.display = 'none';
      this.onEquirectSource?.(tex);
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

  private disposeImageTexture() {
    if (this.imageTexture) {
      this.imageTexture.dispose();
      this.imageTexture = null;
    }
  }

  clear(): void {
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
    this.onEquirectSource?.(null);
  }

  getActions(): TemplateAction[] {
    return [{ label: 'Clear', run: () => this.clear() }];
  }

  dispose(): void {
    this.onEquirectSource?.(null);
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
