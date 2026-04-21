import * as THREE from 'three';
import type { Template, AudioBusLike, TweakpaneSchema } from '../types';
import { TerrainAudio } from '../audio/templates/TerrainAudio';

export class TerrainSunsetTemplate implements Template {
  id = 'terrain' as const;
  private group = new THREE.Group();
  private audio: TerrainAudio | null = null;
  private terrainMat: THREE.ShaderMaterial | null = null;
  private skyMat: THREE.ShaderMaterial | null = null;

  params = {
    sunAngle: 0.08,
    terrainAmplitude: 8.0,
    fogDensity: 0.015,
    windSpeed: 0.3,
  };

  init(scene: THREE.Scene, bus: AudioBusLike): void {
    scene.background = null;

    this.skyMat = new THREE.ShaderMaterial({
      uniforms: { uSunAngle: { value: this.params.sunAngle } },
      side: THREE.BackSide,
      depthWrite: false,
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec3 vDir;
        uniform float uSunAngle;
        void main() {
          float h = clamp(vDir.y, -1.0, 1.0);
          vec3 horizon = vec3(1.0, 0.45, 0.15);
          vec3 zenith = vec3(0.05, 0.08, 0.35);
          vec3 col = mix(horizon, zenith, smoothstep(0.0, 0.6, h));
          vec3 sunDir = normalize(vec3(cos(uSunAngle), sin(uSunAngle) - 0.02, 0.0));
          float sun = pow(max(0.0, dot(normalize(vDir), sunDir)), 80.0);
          col += vec3(1.4, 0.9, 0.6) * sun;
          col *= smoothstep(-0.3, 0.05, h);
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });
    const sky = new THREE.Mesh(new THREE.SphereGeometry(400, 64, 64), this.skyMat);
    this.group.add(sky);

    const seg = 256;
    const terrainGeom = new THREE.PlaneGeometry(200, 200, seg, seg);
    terrainGeom.rotateX(-Math.PI / 2);

    this.terrainMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uAmp: { value: this.params.terrainAmplitude },
        uSunAngle: { value: this.params.sunAngle },
        uFogDensity: { value: this.params.fogDensity },
        uWind: { value: this.params.windSpeed },
      },
      vertexShader: /* glsl */ `
        uniform float uTime;
        uniform float uAmp;
        uniform float uWind;
        varying float vHeight;
        varying vec3 vPosWorld;

        float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
        float noise(vec2 p){
          vec2 i = floor(p); vec2 f = fract(p);
          float a = hash(i); float b = hash(i+vec2(1.0,0.0));
          float c = hash(i+vec2(0.0,1.0)); float d = hash(i+vec2(1.0,1.0));
          vec2 u = f*f*(3.0-2.0*f);
          return mix(a,b,u.x) + (c-a)*u.y*(1.0-u.x) + (d-b)*u.x*u.y;
        }
        float fbm(vec2 p){
          float v = 0.0; float amp = 0.5;
          for (int i=0;i<5;i++){ v += amp * noise(p); p *= 2.02; amp *= 0.5; }
          return v;
        }

        void main(){
          vec3 pos = position;
          vec2 q = pos.xz * 0.04 + vec2(uTime * uWind * 0.05, 0.0);
          float h = fbm(q) * uAmp;
          pos.y += h;
          vHeight = h;
          vec4 wp = modelMatrix * vec4(pos, 1.0);
          vPosWorld = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uSunAngle;
        uniform float uFogDensity;
        varying float vHeight;
        varying vec3 vPosWorld;
        void main(){
          vec3 low = vec3(0.12, 0.08, 0.18);
          vec3 mid = vec3(0.55, 0.30, 0.20);
          vec3 hi = vec3(0.95, 0.85, 0.7);
          float h = clamp(vHeight / 10.0, 0.0, 1.0);
          vec3 col = mix(mix(low, mid, smoothstep(0.0, 0.5, h)), hi, smoothstep(0.5, 1.0, h));
          vec3 sunDir = normalize(vec3(cos(uSunAngle), sin(uSunAngle), 0.0));
          float warmth = max(0.0, dot(normalize(vec3(0.0,1.0,0.0)), sunDir));
          col = mix(col, col * vec3(1.3, 0.9, 0.7), warmth * 0.5);
          float d = length(vPosWorld.xz);
          float f = 1.0 - exp(-d * uFogDensity);
          vec3 fogCol = vec3(1.0, 0.5, 0.3);
          col = mix(col, fogCol, f);
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });

    const terrain = new THREE.Mesh(terrainGeom, this.terrainMat);
    terrain.position.y = -2;
    this.group.add(terrain);

    scene.add(this.group);
    this.audio = new TerrainAudio(bus);
  }

  update(dt: number, time: number): void {
    if (this.terrainMat) {
      this.terrainMat.uniforms.uTime.value = time;
      this.terrainMat.uniforms.uAmp.value = this.params.terrainAmplitude;
      this.terrainMat.uniforms.uSunAngle.value = this.params.sunAngle;
      this.terrainMat.uniforms.uFogDensity.value = this.params.fogDensity;
      this.terrainMat.uniforms.uWind.value = this.params.windSpeed;
    }
    if (this.skyMat) this.skyMat.uniforms.uSunAngle.value = this.params.sunAngle;
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
