import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';
import { EYE_HEIGHT } from './DomeScene';
import type { CameraMode } from '../types';

export class CameraController {
  camera: THREE.PerspectiveCamera;
  private orbit: OrbitControls | null = null;
  private pointerLock: PointerLockControls | null = null;
  private domElement: HTMLElement;
  private mode: CameraMode = 'orbit';

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
      this.camera.position.set(0, EYE_HEIGHT, 0);
      const c = new PointerLockControls(this.camera, this.domElement);
      this.pointerLock = c;
      this.domElement.addEventListener('click', this.requestLock);
    } else if (mode === 'xr-view') {
      this.camera.position.set(0, EYE_HEIGHT, 0);
    }
  }

  private requestLock = () => {
    this.pointerLock?.lock();
  };

  update() {
    this.orbit?.update();
  }

  private teardown() {
    if (this.orbit) {
      this.orbit.dispose();
      this.orbit = null;
    }
    if (this.pointerLock) {
      this.domElement.removeEventListener('click', this.requestLock);
      try { this.pointerLock.unlock(); } catch { /* noop */ }
      this.pointerLock.dispose();
      this.pointerLock = null;
    }
  }

  dispose() { this.teardown(); }
}
