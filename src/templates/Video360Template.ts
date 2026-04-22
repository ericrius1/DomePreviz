import * as THREE from 'three';
import type { Template, AudioBusLike, TweakpaneSchema } from '../types';
import { Video360Audio } from '../audio/templates/Video360Audio';

export class Video360Template implements Template {
  id = 'video360' as const;
  private group = new THREE.Group();
  private audio: Video360Audio | null = null;
  private video: HTMLVideoElement;
  private videoTexture: THREE.VideoTexture | null = null;
  private imageTexture: THREE.Texture | null = null;
  private material: THREE.MeshBasicMaterial | null = null;
  private sphere: THREE.Mesh | null = null;
  private _bus: AudioBusLike | null = null;
  private dropzone: HTMLDivElement | null = null;

  params = {
    play: true,
    loop: true,
    fileLabel: '(none loaded)',
  };

  constructor() {
    this.video = document.createElement('video');
    this.video.crossOrigin = 'anonymous';
    this.video.loop = true;
    this.video.muted = false;
    this.video.playsInline = true;
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
    this.videoTexture.minFilter = THREE.LinearFilter;
    this.videoTexture.magFilter = THREE.LinearFilter;
    this.videoTexture.generateMipmaps = false;

    const geom = new THREE.SphereGeometry(50, 128, 128);
    geom.scale(-1, 1, 1);
    this.material = new THREE.MeshBasicMaterial({ map: this.videoTexture });
    this.sphere = new THREE.Mesh(geom, this.material);
    this.group.add(this.sphere);
    scene.add(this.group);

    this.audio = new Video360Audio(bus);

    this.dropzone = document.createElement('div');
    this.dropzone.className = 'video360-dropzone';
    this.dropzone.textContent = 'Drop 360 video or image here';
    document.body.appendChild(this.dropzone);

    window.addEventListener('dragover', this.onDragOver);
    window.addEventListener('dragleave', this.onDragLeave);
    window.addEventListener('drop', this.onDrop);
  }

  loadFile(file: File) {
    if (file.type.startsWith('video/')) this.loadVideoFile(file);
    else if (file.type.startsWith('image/')) this.loadImageFile(file);
  }

  private loadVideoFile(file: File) {
    const url = URL.createObjectURL(file);
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
      if (this.dropzone) this.dropzone.style.display = 'none';
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

  dispose(): void {
    window.removeEventListener('dragover', this.onDragOver);
    window.removeEventListener('dragleave', this.onDragLeave);
    window.removeEventListener('drop', this.onDrop);
    this.dropzone?.remove();
    this.dropzone = null;
    this.audio?.dispose();
    this.video.pause();
    this.video.removeAttribute('src');
    this.video.remove();
    this.videoTexture?.dispose();
    this.disposeImageTexture();
    this.group.parent?.remove(this.group);
    this.sphere?.geometry.dispose();
    if (this.sphere) (this.sphere.material as THREE.Material).dispose();
  }

  getParams(): TweakpaneSchema { return this.params as unknown as TweakpaneSchema; }
}
