import * as THREE from 'three';
import { MeshBasicNodeMaterial } from 'three/webgpu';
import * as TSL from 'three/tsl';
import type { Template, AudioBusLike, TweakpaneSchema } from '../types';
import { PlanetariumAudio } from '../audio/templates/PlanetariumAudio';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const T: any = TSL;
const { Fn, uniform, attribute, vec3, vec4, float, sin } = T;

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
  private uTime = uniform(0);
  private uTwinkle = uniform(1.0);
  private stars: THREE.InstancedMesh | null = null;

  params = {
    starDensity: 2000,
    cometRate: 3,
    twinkleSpeed: 1.0,
  };

  init(scene: THREE.Scene, bus: AudioBusLike): void {
    scene.background = new THREE.Color(0x02030a);

    const count = this.params.starDensity;
    const phaseArr = new Float32Array(count);
    const starGeom = new THREE.OctahedronGeometry(1, 0);
    starGeom.setAttribute(
      'aPhase',
      new THREE.InstancedBufferAttribute(phaseArr, 1),
    );

    const starMat = new MeshBasicNodeMaterial();
    starMat.transparent = true;
    starMat.depthWrite = false;
    const { uTime, uTwinkle } = this;
    starMat.colorNode = Fn(() => {
      const phase = attribute('aPhase', 'float');
      const b = float(0.6).add(float(0.4).mul(sin(uTime.mul(uTwinkle).add(phase))));
      return vec4(vec3(b), float(1.0));
    })();

    this.stars = new THREE.InstancedMesh(starGeom, starMat, count);
    this.stars.frustumCulled = false;
    const m = new THREE.Matrix4();
    const pos = new THREE.Vector3();
    const rot = new THREE.Quaternion();
    const scl = new THREE.Vector3();
    for (let i = 0; i < count; i++) {
      const u = Math.random();
      const v = Math.random();
      const theta = 2 * Math.PI * u;
      const phi = Math.acos(v);
      const r = 400;
      pos.set(
        r * Math.sin(phi) * Math.cos(theta),
        r * Math.cos(phi),
        r * Math.sin(phi) * Math.sin(theta),
      );
      const size = 1 + Math.random() * 2.5;
      scl.set(size, size, size);
      rot.set(0, 0, 0, 1);
      m.compose(pos, rot, scl);
      this.stars.setMatrixAt(i, m);
      phaseArr[i] = Math.random() * Math.PI * 2;
    }
    this.stars.instanceMatrix.needsUpdate = true;
    this.group.add(this.stars);

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
    this.uTime.value = time;
    this.uTwinkle.value = this.params.twinkleSpeed;
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
    this.stars = null;
  }

  getParams(): TweakpaneSchema {
    return this.params as unknown as TweakpaneSchema;
  }
}
