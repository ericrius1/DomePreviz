import * as THREE from 'three';
import { MeshBasicNodeMaterial } from 'three/webgpu';
import * as TSL from 'three/tsl';
import type { Template, AudioBusLike, TweakpaneSchema } from '../types';
import { TerrainAudio } from '../audio/templates/TerrainAudio';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const T: any = TSL;
const {
  Fn,
  uniform,
  vec2,
  vec3,
  vec4,
  float,
  sin,
  cos,
  mix,
  smoothstep,
  clamp,
  max,
  dot,
  normalize,
  length,
  pow,
  exp,
  oneMinus,
  positionLocal,
  mx_fractal_noise_float,
} = T;

export class TerrainSunsetTemplate implements Template {
  id = 'terrain' as const;
  private group = new THREE.Group();
  private audio: TerrainAudio | null = null;
  private terrainMat: MeshBasicNodeMaterial | null = null;
  private skyMat: MeshBasicNodeMaterial | null = null;

  params = {
    sunAngle: 0.08,
    terrainAmplitude: 8.0,
    fogDensity: 0.015,
    windSpeed: 0.3,
  };

  private uTime = uniform(0);
  private uAmp = uniform(this.params.terrainAmplitude);
  private uSunAngle = uniform(this.params.sunAngle);
  private uFogDensity = uniform(this.params.fogDensity);
  private uWind = uniform(this.params.windSpeed);

  init(scene: THREE.Scene, bus: AudioBusLike): void {
    scene.background = null;

    const { uTime, uAmp, uSunAngle, uFogDensity, uWind } = this;

    this.skyMat = new MeshBasicNodeMaterial();
    this.skyMat.side = THREE.BackSide;
    this.skyMat.depthWrite = false;
    this.skyMat.colorNode = Fn(() => {
      const dir = normalize(positionLocal);
      const h = clamp(dir.y, float(-1), float(1));
      const horizon = vec3(1.0, 0.45, 0.15);
      const zenith = vec3(0.05, 0.08, 0.35);
      const base = mix(horizon, zenith, smoothstep(0.0, 0.6, h));
      const sunDir = normalize(vec3(cos(uSunAngle), sin(uSunAngle).sub(0.02), 0.0));
      const sun = pow(max(float(0), dot(dir, sunDir)), 80.0);
      const col = base.add(vec3(1.4, 0.9, 0.6).mul(sun)).mul(smoothstep(-0.3, 0.05, h));
      return vec4(col, 1.0);
    })();

    const sky = new THREE.Mesh(new THREE.SphereGeometry(400, 64, 64), this.skyMat);
    this.group.add(sky);

    const seg = 256;
    const terrainGeom = new THREE.PlaneGeometry(200, 200, seg, seg);
    terrainGeom.rotateX(-Math.PI / 2);

    // Shared height value: computed in vertex stage via FBM, passed through as a varying
    // so the color ramp in the fragment stage matches the displaced geometry.
    const heightNode = Fn(() => {
      const q = positionLocal.xz.mul(0.04).add(vec2(uTime.mul(uWind).mul(0.05), 0.0));
      return mx_fractal_noise_float(q, 5, 2.02, 0.5, 1.0).mul(uAmp);
    })().toVarying('vTerrainHeight');

    this.terrainMat = new MeshBasicNodeMaterial();
    this.terrainMat.positionNode = positionLocal.add(vec3(0, heightNode, 0));
    this.terrainMat.colorNode = Fn(() => {
      const low = vec3(0.12, 0.08, 0.18);
      const mid = vec3(0.55, 0.30, 0.20);
      const hi = vec3(0.95, 0.85, 0.7);
      const t = clamp(heightNode.div(10.0), 0.0, 1.0);
      const base = mix(
        mix(low, mid, smoothstep(0.0, 0.5, t)),
        hi,
        smoothstep(0.5, 1.0, t),
      );
      const sunDir = normalize(vec3(cos(uSunAngle), sin(uSunAngle), 0.0));
      const warmth = max(float(0), dot(vec3(0, 1, 0), sunDir));
      const warmed = mix(base, base.mul(vec3(1.3, 0.9, 0.7)), warmth.mul(0.5));
      // Terrain has no horizontal translation/scale, so local xz == world xz.
      const d = length(positionLocal.xz);
      const f = oneMinus(exp(d.mul(uFogDensity).negate()));
      const fogCol = vec3(1.0, 0.5, 0.3);
      return vec4(mix(warmed, fogCol, f), 1.0);
    })();

    const terrain = new THREE.Mesh(terrainGeom, this.terrainMat);
    terrain.position.y = -2;
    this.group.add(terrain);

    scene.add(this.group);
    this.audio = new TerrainAudio(bus);
  }

  update(dt: number, time: number): void {
    this.uTime.value = time;
    this.uAmp.value = this.params.terrainAmplitude;
    this.uSunAngle.value = this.params.sunAngle;
    this.uFogDensity.value = this.params.fogDensity;
    this.uWind.value = this.params.windSpeed;
    void dt;
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
    this.terrainMat?.dispose();
    this.skyMat?.dispose();
    this.terrainMat = null;
    this.skyMat = null;
  }

  getParams(): TweakpaneSchema {
    return this.params as unknown as TweakpaneSchema;
  }
}
