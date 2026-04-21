import * as THREE from 'three';
import type { Template, AudioBusLike, TweakpaneSchema } from '../types';
import { MusicVizAudio } from '../audio/templates/MusicVizAudio';

export class MusicVizTemplate implements Template {
  id = 'musicviz' as const;
  private group = new THREE.Group();
  private audio: MusicVizAudio | null = null;
  private analyser: AnalyserNode | null = null;
  private fft: Uint8Array<ArrayBuffer> | null = null;
  private bars: THREE.Mesh[] = [];
  private icos: THREE.Mesh | null = null;
  private icosBase: Float32Array | null = null;

  params = {
    barCount: 64,
    reactivity: 1.0,
    rotationRate: 0.2,
  };

  init(scene: THREE.Scene, bus: AudioBusLike): void {
    scene.background = new THREE.Color(0x05020a);
    scene.add(new THREE.AmbientLight(0xffffff, 0.4));
    const dl = new THREE.DirectionalLight(0xffddff, 0.8);
    dl.position.set(0, 10, 0);
    scene.add(dl);

    for (let i = 0; i < this.params.barCount; i++) {
      const bar = new THREE.Mesh(
        new THREE.BoxGeometry(0.25, 1, 0.25),
        new THREE.MeshStandardMaterial({
          color: new THREE.Color().setHSL(i / this.params.barCount, 0.85, 0.55),
          emissive: new THREE.Color().setHSL(i / this.params.barCount, 0.85, 0.35),
        }),
      );
      const a = (i / this.params.barCount) * Math.PI * 2;
      const r = 6;
      bar.position.set(Math.cos(a) * r, 0.5, Math.sin(a) * r);
      bar.lookAt(0, 0.5, 0);
      this.bars.push(bar);
      this.group.add(bar);
    }

    const icosGeom = new THREE.IcosahedronGeometry(1.5, 3);
    this.icosBase = (icosGeom.attributes.position.array as Float32Array).slice();
    this.icos = new THREE.Mesh(
      icosGeom,
      new THREE.MeshStandardMaterial({
        color: 0xff77cc, emissive: 0x4400ff, emissiveIntensity: 0.8, flatShading: true,
      }),
    );
    this.icos.position.set(0, 2, 0);
    this.group.add(this.icos);

    scene.add(this.group);

    this.audio = new MusicVizAudio(bus);
    this.analyser = bus.analyser;
    this.fft = new Uint8Array(this.analyser.frequencyBinCount);
  }

  update(dt: number, _time: number): void {
    if (!this.analyser || !this.fft) return;
    this.analyser.getByteFrequencyData(this.fft);

    const reactivity = this.params.reactivity;
    for (let i = 0; i < this.bars.length; i++) {
      const bin = Math.floor((i / this.bars.length) * (this.fft.length * 0.5));
      const v = this.fft[bin] / 255;
      const target = 0.2 + v * 6 * reactivity;
      const s = this.bars[i].scale;
      s.y += (target - s.y) * 0.25;
      this.bars[i].position.y = s.y / 2;
    }

    const bass = avg(this.fft, 0, 8) / 255;
    const mid = avg(this.fft, 8, 64) / 255;
    const treble = avg(this.fft, 64, 256) / 255;
    if (this.icos && this.icosBase) {
      const pos = this.icos.geometry.attributes.position as THREE.BufferAttribute;
      const arr = pos.array as Float32Array;
      for (let v = 0; v < arr.length; v += 3) {
        const bx = this.icosBase[v], by = this.icosBase[v + 1], bz = this.icosBase[v + 2];
        const nlen = Math.sqrt(bx * bx + by * by + bz * bz) || 1;
        const nx = bx / nlen, ny = by / nlen, nz = bz / nlen;
        const displace = (bass * 0.5 + mid * 0.3 + treble * 0.2) * reactivity;
        arr[v + 0] = bx + nx * displace;
        arr[v + 1] = by + ny * displace;
        arr[v + 2] = bz + nz * displace;
      }
      pos.needsUpdate = true;
      this.icos.geometry.computeVertexNormals();
      this.icos.rotation.y += dt * this.params.rotationRate * (1 + bass * 2);
      this.icos.rotation.x += dt * this.params.rotationRate * 0.5;
    }

    this.group.rotation.y += dt * this.params.rotationRate * 0.1;
  }

  dispose(): void {
    this.audio?.dispose();
    this.group.parent?.remove(this.group);
    this.group.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      const m = mesh.material;
      if (Array.isArray(m)) m.forEach((mm) => mm.dispose());
      else if (m) (m as THREE.Material).dispose();
    });
    this.bars = [];
    this.icos = null;
    this.icosBase = null;
  }

  getParams(): TweakpaneSchema {
    return this.params as unknown as TweakpaneSchema;
  }
}

function avg(arr: Uint8Array<ArrayBuffer>, a: number, b: number): number {
  let s = 0, n = 0;
  const end = Math.min(b, arr.length);
  for (let i = a; i < end; i++) { s += arr[i]; n++; }
  return n === 0 ? 0 : s / n;
}
