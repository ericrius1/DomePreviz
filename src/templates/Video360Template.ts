import * as THREE from 'three';
import type { Template, AudioBusLike, TweakpaneSchema } from '../types';
import { Video360Audio } from '../audio/templates/Video360Audio';

export class Video360Template implements Template {
  id = 'video360' as const;
  private group = new THREE.Group();
  private audio: Video360Audio | null = null;
  private video: HTMLVideoElement;
  private texture: THREE.VideoTexture | null = null;
  private sphere: THREE.Mesh | null = null;
  private _bus: AudioBusLike | null = null;

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

    this.texture = new THREE.VideoTexture(this.video);
    this.texture.colorSpace = THREE.SRGBColorSpace;

    const geom = new THREE.SphereGeometry(50, 64, 64);
    geom.scale(-1, 1, 1);
    const mat = new THREE.MeshBasicMaterial({ map: this.texture, color: 0x888888 });
    this.sphere = new THREE.Mesh(geom, mat);
    this.group.add(this.sphere);
    scene.add(this.group);

    this.audio = new Video360Audio(bus);

    window.addEventListener('dragover', this.onDragOver);
    window.addEventListener('drop', this.onDrop);
  }

  loadFile(file: File) {
    const url = URL.createObjectURL(file);
    this.video.src = url;
    this.params.fileLabel = file.name;
    this.video.addEventListener('loadeddata', () => {
      if (this._bus && this.audio) this.audio.attachVideo(this.video);
      if (this.params.play) this.video.play().catch(() => { /* autoplay blocked */ });
    }, { once: true });
  }

  private onDragOver = (e: DragEvent) => { e.preventDefault(); };
  private onDrop = (e: DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer?.files?.[0];
    if (file && file.type.startsWith('video/')) this.loadFile(file);
  };

  update(_dt: number, _time: number): void {
    this.video.loop = this.params.loop;
    if (this.params.play && this.video.paused && this.video.src) this.video.play().catch(() => { /* autoplay blocked */ });
    if (!this.params.play && !this.video.paused) this.video.pause();
  }

  dispose(): void {
    window.removeEventListener('dragover', this.onDragOver);
    window.removeEventListener('drop', this.onDrop);
    this.audio?.dispose();
    this.video.pause();
    this.video.removeAttribute('src');
    this.video.remove();
    this.texture?.dispose();
    this.group.parent?.remove(this.group);
    this.sphere?.geometry.dispose();
    if (this.sphere) (this.sphere.material as THREE.Material).dispose();
  }

  getParams(): TweakpaneSchema { return this.params as unknown as TweakpaneSchema; }
}
