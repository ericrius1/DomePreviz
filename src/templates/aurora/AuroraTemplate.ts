import * as THREE from 'three';
import type { Template, AudioBusLike, TweakpaneSchema } from '../../types';
import { EYE_HEIGHT } from '../../app/DomeScene';
import { SkyMaterial } from './SkyMaterial';
import { AmbientEngine } from '../../audio/music/AmbientEngine';

export class AuroraTemplate implements Template {
  id = 'aurora' as const;
  private group = new THREE.Group();
  private sky: THREE.Mesh | null = null;
  private material: SkyMaterial | null = null;
  private audio: AmbientEngine | null = null;
  private bus: AudioBusLike | null = null;
  private tDay = 0;

  params = {
    audioReactive: true,
    reactivity: 1.0,
    nightAmount: 1.0,
    autoCycle: false,
    cycleMinutes: 8,
    auroraIntensity: 1.4,
    auroraSpeed: 0.8,
    auroraScale: 0.55,
    auroraSmoothness: 0.35,
    auroraHeight: 0.42,
    starDensity: 1.0,
    starBrightness: 1.0,
    starWarmth: 0.3,
    starTwinkleSpeed: 1.0,
  };

  init(scene: THREE.Scene, bus: AudioBusLike): void {
    this.bus = bus;
    scene.background = null;

    this.material = new SkyMaterial();
    const geom = new THREE.SphereGeometry(800, 64, 48);
    this.sky = new THREE.Mesh(geom, this.material);
    this.sky.position.set(0, EYE_HEIGHT, 0);
    this.sky.frustumCulled = false;
    this.group.add(this.sky);

    scene.add(this.group);

    this.audio = new AmbientEngine(bus);
  }

  update(dt: number, _time: number): void {
    if (!this.material || !this.bus) return;
    const m = this.material;
    const p = this.params;
    const f = this.bus.features;

    if (p.autoCycle) {
      this.tDay += dt / (Math.max(1, p.cycleMinutes) * 60);
      const cycle = 0.5 + 0.5 * Math.cos(this.tDay * Math.PI * 2);
      m.uNightAmount.value = cycle;
      const sunY = Math.sin(this.tDay * Math.PI * 2 + Math.PI) * 0.6 - 0.1;
      const sunX = Math.cos(this.tDay * Math.PI * 2 + Math.PI);
      m.uSunDir.value.set(sunX, sunY, 0.3).normalize();
    } else {
      m.uNightAmount.value = p.nightAmount;
    }

    const reactive = p.audioReactive ? p.reactivity : 0;
    const bass = f.bassEnv;
    const treble = f.trebleEnv;
    const onsetBoost = f.onset ? 0.6 : 0;
    const energy = Math.min(1, f.rms * 2.5);

    m.uAuroraIntensity.value = p.auroraIntensity * (1 + reactive * (bass * 1.8 + onsetBoost));
    m.uAuroraSpeed.value     = p.auroraSpeed     * (1 + reactive * (treble * 2.0 + energy * 0.5));
    m.uAuroraScale.value     = p.auroraScale     * (1 + reactive * (0.25 - f.centroid * 0.4));
    m.uAuroraSmoothness.value = THREE.MathUtils.clamp(
      p.auroraSmoothness - reactive * bass * 0.25,
      0, 1,
    );
    m.uAuroraHeight.value = p.auroraHeight + reactive * bass * 0.08;

    m.uStarDensity.value      = p.starDensity;
    m.uStarBrightness.value   = p.starBrightness * (1 + reactive * energy * 0.8);
    m.uStarWarmth.value       = p.starWarmth;
    m.uStarTwinkleSpeed.value = p.starTwinkleSpeed * (1 + reactive * treble * 1.2);
  }

  dispose(): void {
    this.audio?.dispose();
    this.group.parent?.remove(this.group);
    this.sky?.geometry.dispose();
    this.material?.dispose();
    this.material = null;
    this.sky = null;
    this.audio = null;
  }

  getParams(): TweakpaneSchema {
    return this.params as unknown as TweakpaneSchema;
  }
}
