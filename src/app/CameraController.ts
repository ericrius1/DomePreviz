import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';
import { EYE_HEIGHT, DOME_RADIUS } from './DomeScene';
import type { CameraMode } from '../types';

const WALK_SPEED = 2.5;
const WALL_BUFFER = 0.5;

export class CameraController {
  camera: THREE.PerspectiveCamera;
  height = EYE_HEIGHT;
  domeRadius = DOME_RADIUS;
  private orbit: OrbitControls | null = null;
  private pointerLock: PointerLockControls | null = null;
  private domElement: HTMLElement;
  private mode: CameraMode = 'orbit';
  private keysDown = new Set<string>();

  constructor(camera: THREE.PerspectiveCamera, domElement: HTMLElement) {
    this.camera = camera;
    this.domElement = domElement;
    this.setMode('orbit');
  }

  setMode(mode: CameraMode) {
    if (this.mode === mode && (this.orbit || this.pointerLock)) return;
    this.mode = mode;
    this.teardown();

    if (mode === 'orbit') {
      this.camera.position.set(18, 12, 18);
      this.camera.lookAt(0, EYE_HEIGHT, 0);
      const c = new OrbitControls(this.camera, this.domElement);
      c.enableDamping = true;
      c.target.set(0, 2, 0);
      c.maxPolarAngle = Math.PI / 2 - 0.05;
      this.orbit = c;
    } else if (mode === 'first-person') {
      this.camera.position.set(0, this.height, 0);
      const c = new PointerLockControls(this.camera, this.domElement);
      this.pointerLock = c;
      this.domElement.addEventListener('click', this.requestLock);
      window.addEventListener('keydown', this.onKeyDown);
      window.addEventListener('keyup', this.onKeyUp);
    } else if (mode === 'xr-view') {
      this.camera.position.set(0, EYE_HEIGHT, 0);
    }
  }

  setHeight(h: number) {
    this.height = h;
    if (this.mode === 'first-person') {
      this.camera.position.y = h;
    }
  }

  setDomeRadius(r: number) {
    this.domeRadius = r;
  }

  private requestLock = () => {
    this.pointerLock?.lock();
  };

  private isTypingTarget(t: EventTarget | null): boolean {
    const el = t as HTMLElement | null;
    return !!(el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable));
  }

  private onKeyDown = (ev: KeyboardEvent) => {
    if (this.isTypingTarget(ev.target)) return;
    const k = ev.key.toLowerCase();
    if (k === 'w' || k === 'a' || k === 's' || k === 'd') {
      this.keysDown.add(k);
    }
  };

  private onKeyUp = (ev: KeyboardEvent) => {
    this.keysDown.delete(ev.key.toLowerCase());
  };

  update(dt: number) {
    this.orbit?.update();
    if (this.mode === 'first-person' && this.pointerLock?.isLocked) {
      this.updateWalk(dt);
    }
  }

  private updateWalk(dt: number) {
    const fwd = (this.keysDown.has('w') ? 1 : 0) - (this.keysDown.has('s') ? 1 : 0);
    const strafe = (this.keysDown.has('d') ? 1 : 0) - (this.keysDown.has('a') ? 1 : 0);
    if (fwd === 0 && strafe === 0) return;

    const len = Math.hypot(fwd, strafe);
    const distance = WALK_SPEED * dt;
    this.pointerLock!.moveForward((fwd / len) * distance);
    this.pointerLock!.moveRight((strafe / len) * distance);

    const maxR = this.domeRadius - WALL_BUFFER;
    const px = this.camera.position.x;
    const pz = this.camera.position.z;
    const r = Math.hypot(px, pz);
    if (r > maxR) {
      this.camera.position.x = (px / r) * maxR;
      this.camera.position.z = (pz / r) * maxR;
    }
    this.camera.position.y = this.height;
  }

  private teardown() {
    if (this.orbit) {
      this.orbit.dispose();
      this.orbit = null;
    }
    if (this.pointerLock) {
      this.domElement.removeEventListener('click', this.requestLock);
      window.removeEventListener('keydown', this.onKeyDown);
      window.removeEventListener('keyup', this.onKeyUp);
      this.keysDown.clear();
      try { this.pointerLock.unlock(); } catch { /* noop */ }
      this.pointerLock.dispose();
      this.pointerLock = null;
    }
  }

  dispose() { this.teardown(); }
}
