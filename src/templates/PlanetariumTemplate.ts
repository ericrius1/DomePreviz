import * as THREE from 'three';
import type { Template, AudioBusLike, TweakpaneSchema } from '../types';
import { PlanetariumAudio } from '../audio/templates/PlanetariumAudio';

interface Comet {
  line: THREE.Line;
  head: THREE.Mesh;
  trail: THREE.Vector3[];
  velocity: THREE.Vector3;
  life: number;
}

export class PlanetariumTemplate implements Template {
  id = 'planetarium' as const;
  private group = new THREE.Group();
  private audio: PlanetariumAudio | null = null;
  private comets: Comet[] = [];
  private starMaterial: THREE.ShaderMaterial | null = null;

  params = {
    starDensity: 2000,
    cometRate: 3,
    twinkleSpeed: 1.0,
  };

  init(scene: THREE.Scene, bus: AudioBusLike): void {
    scene.background = new THREE.Color(0x02030a);

    const count = this.params.starDensity;
    const pos = new Float32Array(count * 3);
    const phase = new Float32Array(count);
    const sz = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const u = Math.random();
      const v = Math.random();
      const theta = 2 * Math.PI * u;
      const phi = Math.acos(v);
      const r = 400;
      pos[i * 3 + 0] = r * Math.sin(phi) * Math.cos(theta);
      pos[i * 3 + 1] = r * Math.cos(phi);
      pos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
      phase[i] = Math.random() * Math.PI * 2;
      sz[i] = 1 + Math.random() * 2.5;
    }
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geom.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
    geom.setAttribute('aSize', new THREE.BufferAttribute(sz, 1));

    this.starMaterial = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uTwinkle: { value: this.params.twinkleSpeed } },
      vertexShader: /* glsl */ `
        attribute float aPhase;
        attribute float aSize;
        uniform float uTime;
        uniform float uTwinkle;
        varying float vBrightness;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = aSize * (300.0 / -mv.z);
          vBrightness = 0.6 + 0.4 * sin(uTime * uTwinkle + aPhase);
        }
      `,
      fragmentShader: /* glsl */ `
        varying float vBrightness;
        void main() {
          vec2 p = gl_PointCoord - 0.5;
          float d = length(p);
          float a = smoothstep(0.5, 0.0, d);
          gl_FragColor = vec4(vec3(vBrightness), a);
        }
      `,
      transparent: true,
      depthWrite: false,
    });
    const stars = new THREE.Points(geom, this.starMaterial);
    this.group.add(stars);

    for (let i = 0; i < this.params.cometRate; i++) this.comets.push(this.spawnComet());
    this.comets.forEach((c) => { this.group.add(c.line); this.group.add(c.head); });

    scene.add(this.group);

    this.audio = new PlanetariumAudio(bus);
  }

  private spawnComet(): Comet {
    const start = new THREE.Vector3(
      (Math.random() - 0.5) * 300,
      50 + Math.random() * 100,
      (Math.random() - 0.5) * 300,
    );
    const dir = new THREE.Vector3(Math.random() - 0.5, -0.2 - Math.random() * 0.3, Math.random() - 0.5).normalize();
    const velocity = dir.multiplyScalar(30 + Math.random() * 20);

    const trailLen = 20;
    const trail: THREE.Vector3[] = [];
    for (let i = 0; i < trailLen; i++) trail.push(start.clone());

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(trailLen * 3), 3));
    const mat = new THREE.LineBasicMaterial({ color: 0xffeeaa, transparent: true, opacity: 0.7 });
    const line = new THREE.Line(geom, mat);

    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.6, 12, 12),
      new THREE.MeshBasicMaterial({ color: 0xffffcc }),
    );
    head.position.copy(start);
    return { line, head, trail, velocity, life: 0 };
  }

  update(dt: number, time: number): void {
    if (this.starMaterial) {
      this.starMaterial.uniforms.uTime.value = time;
      this.starMaterial.uniforms.uTwinkle.value = this.params.twinkleSpeed;
    }
    for (let i = 0; i < this.comets.length; i++) {
      const c = this.comets[i];
      c.life += dt;
      const head = c.trail[c.trail.length - 1].clone().addScaledVector(c.velocity, dt);
      c.trail.shift();
      c.trail.push(head);
      c.head.position.copy(head);

      const posAttr = c.line.geometry.attributes.position as THREE.BufferAttribute;
      const arr = posAttr.array as Float32Array;
      for (let j = 0; j < c.trail.length; j++) {
        arr[j * 3 + 0] = c.trail[j].x;
        arr[j * 3 + 1] = c.trail[j].y;
        arr[j * 3 + 2] = c.trail[j].z;
      }
      posAttr.needsUpdate = true;

      if (head.length() > 600 || head.y < -20) {
        this.group.remove(c.line);
        this.group.remove(c.head);
        c.line.geometry.dispose();
        (c.line.material as THREE.Material).dispose();
        c.head.geometry.dispose();
        (c.head.material as THREE.Material).dispose();
        this.comets[i] = this.spawnComet();
        this.group.add(this.comets[i].line);
        this.group.add(this.comets[i].head);
      }
    }
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
    this.comets = [];
    this.starMaterial?.dispose();
    this.starMaterial = null;
  }

  getParams(): TweakpaneSchema {
    return this.params as unknown as TweakpaneSchema;
  }
}
