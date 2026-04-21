# Dome Previs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Three.js + Vite + TypeScript dome-show previsualization app with 3 sample content templates + 360 video, 5-channel spatial audio, orbit/first-person/WebXR camera modes, and a Tweakpane control panel.

**Architecture:** Content templates render into a `CubeCamera` at dome center; the dome mesh samples that cubemap on its interior to simulate real fulldome projection. Templates are pluggable via a `Template` interface. Audio uses Web Audio `PannerNode`s for 5 speakers on the base ring. Camera modes swap controls cleanly. WebXR uses Three's built-in XR rig.

**Tech Stack:** Three.js (r160+), Vite, TypeScript, Tweakpane, Web Audio API, WebXR Device API.

**Validation:** No unit tests — spec explicitly calls for interactive browser validation. Each task ends with a dev-server check: load the page, perform an action, confirm visible/audible/behavior. Type-check (`npm run check`) gates each commit.

---

## Task 1: Scaffold Vite + TypeScript project

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `src/main.ts`
- Create: `src/style.css`

- [ ] **Step 1: Scaffold project**

Run from `/Users/eric/codeprojects/dome_previz/`:
```bash
npm create vite@latest . -- --template vanilla-ts
```
If it prompts about existing files (README etc.) choose "Ignore files and continue." It should produce `package.json`, `tsconfig.json`, `index.html`, `src/main.ts`, `src/style.css`, and a `public/` folder.

- [ ] **Step 2: Install runtime deps**

```bash
npm install three tweakpane
npm install -D @types/three
```

- [ ] **Step 3: Replace generated `src/main.ts` with an empty bootstrap**

```ts
import './style.css';

const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = '<canvas id="view"></canvas>';
```

- [ ] **Step 4: Replace `src/style.css`**

```css
:root { color-scheme: dark; font-family: system-ui, sans-serif; }
html, body, #app { margin: 0; padding: 0; height: 100%; background: #0a0a0f; }
#view { display: block; width: 100vw; height: 100vh; }
```

- [ ] **Step 5: Replace `index.html` body with the app div and set a title**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Dome Previs</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

- [ ] **Step 6: Add `check` script to `package.json`**

In `package.json`, ensure `scripts` contains:
```json
"dev": "vite",
"build": "tsc --noEmit && vite build",
"preview": "vite preview",
"check": "tsc --noEmit"
```

- [ ] **Step 7: Run dev server and verify**

```bash
npm run dev
```
Open the printed URL. Expected: empty dark page, no console errors. Stop the dev server.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "chore: scaffold Vite + TS + three + tweakpane project"
```

---

## Task 2: Renderer bootstrap, outer scene, orbit camera, placeholder dome

**Files:**
- Create: `src/types.ts`, `src/app/DomeScene.ts`
- Modify: `src/main.ts`

- [ ] **Step 1: Create `src/types.ts`**

```ts
import type * as THREE from 'three';
import type { AudioBus } from './audio/AudioBus';

export type CameraMode = 'orbit' | 'first-person' | 'xr-view';
export type TemplateId = 'planetarium' | 'terrain' | 'musicviz' | 'video360';

export interface TweakpaneSchema {
  [key: string]: unknown;
}

export interface Template {
  id: TemplateId;
  init(scene: THREE.Scene, bus: AudioBus): void;
  update(dt: number, time: number): void;
  dispose(): void;
  getParams(): TweakpaneSchema;
}

export interface AppState {
  cameraMode: CameraMode;
  templateId: TemplateId;
  domeOpacity: number;
  showFrustums: boolean;
  showFisheyeInset: boolean;
  cubemapResolution: 256 | 512 | 1024 | 2048;
  fov: number;
}
```

Note: `AudioBus` is imported but not yet created — TS will error until Task 7 wires it. That's expected. Leave a stub:

```ts
// TEMP until Task 7
export type AudioBusStub = unknown;
```

Actually revise — don't let compile break. Remove the `AudioBus` import for now and define a forward-declared interface placeholder:

```ts
import type * as THREE from 'three';

export type CameraMode = 'orbit' | 'first-person' | 'xr-view';
export type TemplateId = 'planetarium' | 'terrain' | 'musicviz' | 'video360';

export interface TweakpaneSchema {
  [key: string]: unknown;
}

export interface AudioBusLike {
  analyser: AnalyserNode | null;
  context: AudioContext;
}

export interface Template {
  id: TemplateId;
  init(scene: THREE.Scene, bus: AudioBusLike): void;
  update(dt: number, time: number): void;
  dispose(): void;
  getParams(): TweakpaneSchema;
}

export interface AppState {
  cameraMode: CameraMode;
  templateId: TemplateId;
  domeOpacity: number;
  showFrustums: boolean;
  showFisheyeInset: boolean;
  cubemapResolution: 256 | 512 | 1024 | 2048;
  fov: number;
}
```

- [ ] **Step 2: Create `src/app/DomeScene.ts`**

```ts
import * as THREE from 'three';

export const DOME_RADIUS = 10;
export const EYE_HEIGHT = 1.6;

export class DomeScene {
  outerScene = new THREE.Scene();
  templateScene = new THREE.Scene();
  dome: THREE.Mesh;
  floor: THREE.Mesh;

  constructor() {
    this.outerScene.background = new THREE.Color(0x0a0a0f);

    // Placeholder dome: translucent wireframe hemisphere (replaced in Task 3)
    const domeGeom = new THREE.SphereGeometry(
      DOME_RADIUS, 96, 64, 0, Math.PI * 2, 0, Math.PI / 2,
    );
    const domeMat = new THREE.MeshBasicMaterial({
      color: 0x66aadd,
      wireframe: true,
      transparent: true,
      opacity: 0.25,
      side: THREE.DoubleSide,
    });
    this.dome = new THREE.Mesh(domeGeom, domeMat);
    this.outerScene.add(this.dome);

    // Floor disc
    const floorGeom = new THREE.CircleGeometry(DOME_RADIUS, 64);
    floorGeom.rotateX(-Math.PI / 2);
    const floorMat = new THREE.MeshBasicMaterial({ color: 0x1a1a22 });
    this.floor = new THREE.Mesh(floorGeom, floorMat);
    this.outerScene.add(this.floor);

    // Simple grid for orientation
    const grid = new THREE.GridHelper(DOME_RADIUS * 2, 20, 0x333344, 0x22222a);
    (grid.material as THREE.Material).opacity = 0.4;
    (grid.material as THREE.Material).transparent = true;
    this.outerScene.add(grid);
  }
}
```

- [ ] **Step 3: Replace `src/main.ts`**

```ts
import './style.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { DomeScene, EYE_HEIGHT } from './app/DomeScene';

const canvas = document.createElement('canvas');
canvas.id = 'view';
document.querySelector<HTMLDivElement>('#app')!.appendChild(canvas);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.05, 1000);
camera.position.set(18, 12, 18);
camera.lookAt(0, EYE_HEIGHT, 0);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.target.set(0, 2, 0);
controls.maxPolarAngle = Math.PI / 2 - 0.05;

const dome = new DomeScene();

window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
});

const clock = new THREE.Clock();
function tick() {
  const dt = clock.getDelta();
  void dt;
  controls.update();
  renderer.render(dome.outerScene, camera);
  requestAnimationFrame(tick);
}
tick();
```

- [ ] **Step 4: Run typecheck**

```bash
npm run check
```
Expected: no errors.

- [ ] **Step 5: Run dev server and verify**

```bash
npm run dev
```
Expected: wireframe blue dome with dark floor, orbitable with mouse. Confirm you can orbit around and the dome renders. Stop server.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add outer scene with orbit camera and placeholder wireframe dome"
```

---

## Task 3: Dome projection (CubeCamera + shader-sampled dome interior)

**Files:**
- Create: `src/app/DomeProjection.ts`
- Modify: `src/main.ts`, `src/app/DomeScene.ts`

- [ ] **Step 1: Create `src/app/DomeProjection.ts`**

```ts
import * as THREE from 'three';
import { DOME_RADIUS, EYE_HEIGHT } from './DomeScene';

const vertexShader = /* glsl */ `
  varying vec3 vWorldPos;
  varying vec3 vNormal;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorldPos = wp.xyz;
    vNormal = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const fragmentShader = /* glsl */ `
  uniform samplerCube uCube;
  uniform vec3 uCenter;
  uniform float uOpacity;
  varying vec3 vWorldPos;
  varying vec3 vNormal;
  void main() {
    // Direction from dome center to surface point = "which way the projected pixel came from".
    vec3 dir = normalize(vWorldPos - uCenter);
    vec3 color = textureCube(uCube, dir).rgb;
    // When viewing from outside, dim the surface a little so orbit mode still reads clearly.
    float facing = dot(normalize(vNormal), normalize(cameraPosition - vWorldPos));
    float exterior = step(facing, 0.0); // 1 when we see the backside (outside looking in)
    float mul = mix(1.0, uOpacity, exterior);
    gl_FragColor = vec4(color * mul, 1.0);
  }
`;

export class DomeProjection {
  cubeRT: THREE.WebGLCubeRenderTarget;
  cubeCamera: THREE.CubeCamera;
  material: THREE.ShaderMaterial;

  constructor(resolution: number) {
    this.cubeRT = new THREE.WebGLCubeRenderTarget(resolution, {
      generateMipmaps: false,
      type: THREE.HalfFloatType,
    });
    this.cubeCamera = new THREE.CubeCamera(0.05, 200, this.cubeRT);
    this.cubeCamera.position.set(0, EYE_HEIGHT, 0);

    this.material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        uCube: { value: this.cubeRT.texture },
        uCenter: { value: new THREE.Vector3(0, EYE_HEIGHT, 0) },
        uOpacity: { value: 0.55 },
      },
      side: THREE.DoubleSide,
    });
  }

  setOpacity(v: number) {
    this.material.uniforms.uOpacity.value = v;
  }

  setResolution(resolution: number) {
    const old = this.cubeRT;
    this.cubeRT = new THREE.WebGLCubeRenderTarget(resolution, {
      generateMipmaps: false,
      type: THREE.HalfFloatType,
    });
    this.cubeCamera.renderTarget = this.cubeRT;
    this.material.uniforms.uCube.value = this.cubeRT.texture;
    old.dispose();
  }

  render(renderer: THREE.WebGLRenderer, templateScene: THREE.Scene) {
    this.cubeCamera.update(renderer, templateScene);
  }

  dispose() {
    this.cubeRT.dispose();
    this.material.dispose();
  }
}

export { DOME_RADIUS };
```

- [ ] **Step 2: Update `src/app/DomeScene.ts` to accept an injected dome material**

Replace the full file with:

```ts
import * as THREE from 'three';

export const DOME_RADIUS = 10;
export const EYE_HEIGHT = 1.6;

export class DomeScene {
  outerScene = new THREE.Scene();
  templateScene = new THREE.Scene();
  dome: THREE.Mesh;
  floor: THREE.Mesh;
  grid: THREE.GridHelper;

  constructor(domeMaterial: THREE.Material) {
    this.outerScene.background = new THREE.Color(0x0a0a0f);

    const domeGeom = new THREE.SphereGeometry(
      DOME_RADIUS, 96, 64, 0, Math.PI * 2, 0, Math.PI / 2,
    );
    this.dome = new THREE.Mesh(domeGeom, domeMaterial);
    this.outerScene.add(this.dome);

    const floorGeom = new THREE.CircleGeometry(DOME_RADIUS, 64);
    floorGeom.rotateX(-Math.PI / 2);
    const floorMat = new THREE.MeshBasicMaterial({ color: 0x1a1a22 });
    this.floor = new THREE.Mesh(floorGeom, floorMat);
    this.outerScene.add(this.floor);

    this.grid = new THREE.GridHelper(DOME_RADIUS * 2, 20, 0x333344, 0x22222a);
    (this.grid.material as THREE.Material).opacity = 0.4;
    (this.grid.material as THREE.Material).transparent = true;
    this.outerScene.add(this.grid);
  }
}
```

- [ ] **Step 3: Update `src/main.ts` to wire the projection with a test scene**

Replace `src/main.ts`:

```ts
import './style.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { DomeScene, EYE_HEIGHT } from './app/DomeScene';
import { DomeProjection } from './app/DomeProjection';

const canvas = document.createElement('canvas');
canvas.id = 'view';
document.querySelector<HTMLDivElement>('#app')!.appendChild(canvas);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.05, 1000);
camera.position.set(18, 12, 18);
camera.lookAt(0, EYE_HEIGHT, 0);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.target.set(0, 2, 0);
controls.maxPolarAngle = Math.PI / 2 - 0.05;

const projection = new DomeProjection(1024);
const dome = new DomeScene(projection.material);

// Temporary test content in templateScene: colored cubes + ambient sphere, so we can see the projection working.
{
  const s = dome.templateScene;
  s.background = new THREE.Color(0x111133);
  s.add(new THREE.AmbientLight(0xffffff, 0.6));
  const dl = new THREE.DirectionalLight(0xffffff, 0.8);
  dl.position.set(5, 10, 5);
  s.add(dl);
  const colors = [0xff4466, 0x44ff66, 0x4466ff, 0xffdd44, 0xff44ff, 0x44ffff];
  colors.forEach((c, i) => {
    const m = new THREE.Mesh(
      new THREE.BoxGeometry(1.5, 1.5, 1.5),
      new THREE.MeshStandardMaterial({ color: c }),
    );
    const a = (i / colors.length) * Math.PI * 2;
    m.position.set(Math.cos(a) * 4, 1 + Math.sin(a) * 0.5, Math.sin(a) * 4);
    s.add(m);
  });
}

window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
});

const clock = new THREE.Clock();
function tick() {
  const dt = clock.getDelta();
  void dt;
  controls.update();

  dome.dome.visible = false;
  projection.render(renderer, dome.templateScene);
  dome.dome.visible = true;

  renderer.render(dome.outerScene, camera);
  requestAnimationFrame(tick);
}
tick();
```

- [ ] **Step 4: Typecheck**

```bash
npm run check
```
Expected: no errors.

- [ ] **Step 5: Run dev server and verify**

```bash
npm run dev
```
Expected: orbiting view shows a dome with colored squares/cubes projected onto its interior (visible as curved patches of color on the inside of the dome). Orbit around — as you look at the dome from different angles, the projected image shifts correctly (you're seeing the cubemap projected). Confirm no console errors. Stop server.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add cubemap-based dome projection pipeline with test content"
```

---

## Task 4: Template interface + registry + null template

**Files:**
- Create: `src/templates/Template.ts`, `src/templates/registry.ts`, `src/templates/NullTemplate.ts`
- Modify: `src/main.ts`

- [ ] **Step 1: Create `src/templates/Template.ts`**

```ts
export type { Template, TemplateId, TweakpaneSchema, AudioBusLike } from '../types';
```

- [ ] **Step 2: Create `src/templates/NullTemplate.ts`**

Used as a fallback / initial template. Shows colored reference cubes so the projection is always visible even before we build real templates.

```ts
import * as THREE from 'three';
import type { Template, AudioBusLike } from './Template';

export class NullTemplate implements Template {
  id = 'planetarium' as const; // temporarily uses planetarium id; swapped in Task 8
  private group = new THREE.Group();
  private t = 0;

  init(scene: THREE.Scene, _bus: AudioBusLike): void {
    scene.background = new THREE.Color(0x0b0b1a);
    scene.add(new THREE.AmbientLight(0xffffff, 0.4));
    const dl = new THREE.DirectionalLight(0xffffff, 0.9);
    dl.position.set(5, 10, 5);
    scene.add(dl);

    const colors = [0xff4466, 0x44ff66, 0x4466ff, 0xffdd44, 0xff44ff, 0x44ffff];
    colors.forEach((c, i) => {
      const m = new THREE.Mesh(
        new THREE.BoxGeometry(1.2, 1.2, 1.2),
        new THREE.MeshStandardMaterial({ color: c }),
      );
      const a = (i / colors.length) * Math.PI * 2;
      m.position.set(Math.cos(a) * 4, 1.5 + Math.sin(a) * 0.5, Math.sin(a) * 4);
      m.userData.baseY = m.position.y;
      m.userData.phase = a;
      this.group.add(m);
    });
    scene.add(this.group);
  }

  update(dt: number, _time: number): void {
    this.t += dt;
    this.group.children.forEach((c, i) => {
      c.rotation.y += dt * 0.5;
      const phase = (c.userData.phase as number) ?? i;
      c.position.y = (c.userData.baseY as number) + Math.sin(this.t * 1.2 + phase) * 0.25;
    });
  }

  dispose(): void {
    this.group.parent?.remove(this.group);
    this.group.traverse((o) => {
      if ((o as THREE.Mesh).geometry) (o as THREE.Mesh).geometry.dispose();
      const m = (o as THREE.Mesh).material;
      if (Array.isArray(m)) m.forEach((mm) => mm.dispose());
      else if (m) (m as THREE.Material).dispose();
    });
  }

  getParams() { return {}; }
}
```

- [ ] **Step 3: Create `src/templates/registry.ts`**

```ts
import type { Template, TemplateId } from './Template';
import { NullTemplate } from './NullTemplate';

export type TemplateFactory = () => Template;

export const templateRegistry: Record<TemplateId, TemplateFactory> = {
  planetarium: () => new NullTemplate(),
  terrain:     () => new NullTemplate(),
  musicviz:    () => new NullTemplate(),
  video360:    () => new NullTemplate(),
};

export function createTemplate(id: TemplateId): Template {
  return templateRegistry[id]();
}
```

- [ ] **Step 4: Update `src/main.ts` to use the registry**

Replace the temporary test content block with registry-driven initialization. Replace the entire `src/main.ts` with:

```ts
import './style.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { DomeScene, EYE_HEIGHT } from './app/DomeScene';
import { DomeProjection } from './app/DomeProjection';
import { createTemplate } from './templates/registry';
import type { AudioBusLike, Template, TemplateId } from './types';

const canvas = document.createElement('canvas');
canvas.id = 'view';
document.querySelector<HTMLDivElement>('#app')!.appendChild(canvas);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.05, 1000);
camera.position.set(18, 12, 18);
camera.lookAt(0, EYE_HEIGHT, 0);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.target.set(0, 2, 0);
controls.maxPolarAngle = Math.PI / 2 - 0.05;

const projection = new DomeProjection(1024);
const dome = new DomeScene(projection.material);

const bus: AudioBusLike = { analyser: null, context: new (window.AudioContext || (window as any).webkitAudioContext)() };

let current: Template | null = null;
function setTemplate(id: TemplateId) {
  if (current) current.dispose();
  while (dome.templateScene.children.length) dome.templateScene.remove(dome.templateScene.children[0]);
  current = createTemplate(id);
  current.init(dome.templateScene, bus);
}
setTemplate('planetarium');

window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
});

const clock = new THREE.Clock();
function tick() {
  const dt = clock.getDelta();
  const time = clock.elapsedTime;
  controls.update();
  current?.update(dt, time);

  dome.dome.visible = false;
  projection.render(renderer, dome.templateScene);
  dome.dome.visible = true;

  renderer.render(dome.outerScene, camera);
  requestAnimationFrame(tick);
}
tick();
```

- [ ] **Step 5: Typecheck and verify**

```bash
npm run check
```
Expected: no errors.

```bash
npm run dev
```
Expected: dome with floating, bobbing colored cubes projected on its interior. Confirm cubes animate (they're now driven by the NullTemplate's update loop). Stop server.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add template interface, registry, and null/test template"
```

---

## Task 5: Camera controller (orbit / first-person)

**Files:**
- Create: `src/app/CameraController.ts`
- Modify: `src/main.ts`

- [ ] **Step 1: Create `src/app/CameraController.ts`**

```ts
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
      // Request lock on canvas click
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
      this.pointerLock.unlock();
      this.pointerLock.dispose();
      this.pointerLock = null;
    }
  }

  dispose() { this.teardown(); }
}
```

- [ ] **Step 2: Wire into `src/main.ts`**

Replace the OrbitControls import and usage with `CameraController`. New `src/main.ts`:

```ts
import './style.css';
import * as THREE from 'three';
import { DomeScene, EYE_HEIGHT } from './app/DomeScene';
import { DomeProjection } from './app/DomeProjection';
import { CameraController } from './app/CameraController';
import { createTemplate } from './templates/registry';
import type { AudioBusLike, Template, TemplateId, CameraMode } from './types';

const canvas = document.createElement('canvas');
canvas.id = 'view';
document.querySelector<HTMLDivElement>('#app')!.appendChild(canvas);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.05, 1000);
const cameraController = new CameraController(camera, canvas);

const projection = new DomeProjection(1024);
const dome = new DomeScene(projection.material);

const bus: AudioBusLike = { analyser: null, context: new (window.AudioContext || (window as any).webkitAudioContext)() };

let current: Template | null = null;
function setTemplate(id: TemplateId) {
  if (current) current.dispose();
  while (dome.templateScene.children.length) dome.templateScene.remove(dome.templateScene.children[0]);
  current = createTemplate(id);
  current.init(dome.templateScene, bus);
}
setTemplate('planetarium');

// Dev-mode: press 1 for orbit, 2 for first-person, to verify mode switching before we add UI
window.addEventListener('keydown', (e) => {
  if (e.key === '1') cameraController.setMode('orbit');
  if (e.key === '2') cameraController.setMode('first-person');
});

window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
});

const clock = new THREE.Clock();
function tick() {
  const dt = clock.getDelta();
  const time = clock.elapsedTime;
  cameraController.update();
  current?.update(dt, time);

  dome.dome.visible = false;
  projection.render(renderer, dome.templateScene);
  dome.dome.visible = true;

  renderer.render(dome.outerScene, camera);
  requestAnimationFrame(tick);
}
tick();

// Re-export EYE_HEIGHT consumer to silence unused import if needed
void EYE_HEIGHT;
void (null as unknown as CameraMode);
```

- [ ] **Step 3: Typecheck**

```bash
npm run check
```
Expected: no errors.

- [ ] **Step 4: Run dev and verify both modes**

```bash
npm run dev
```
- Orbit (default): drag to rotate. Confirm works as before.
- Press `2`: click canvas to lock pointer. Mouse now looks around from dome center. Press ESC to release.
- Press `1`: back to orbit. Confirm orbit still works after switching back.

Stop server.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add camera controller with orbit and first-person pointer-lock modes"
```

---

## Task 6: AudioBus + 5 speakers with visual proxies

**Files:**
- Create: `src/audio/AudioBus.ts`, `src/audio/Speaker.ts`
- Modify: `src/app/DomeScene.ts`, `src/main.ts`, `src/types.ts`

- [ ] **Step 1: Create `src/audio/AudioBus.ts`**

```ts
import { Speaker } from './Speaker';

export class AudioBus {
  context: AudioContext;
  master: GainNode;
  speakers: Speaker[] = [];
  analyser: AnalyserNode;

  constructor() {
    this.context = new (window.AudioContext || (window as any).webkitAudioContext)();
    this.master = this.context.createGain();
    this.master.gain.value = 0.8;

    this.analyser = this.context.createAnalyser();
    this.analyser.fftSize = 1024;
    this.master.connect(this.analyser);
    this.analyser.connect(this.context.destination);

    for (let i = 0; i < 5; i++) {
      const azimuth = (i / 5) * Math.PI * 2;
      this.speakers.push(new Speaker(this.context, this.master, azimuth, i));
    }
  }

  async resume() {
    if (this.context.state !== 'running') await this.context.resume();
  }
}
```

- [ ] **Step 2: Create `src/audio/Speaker.ts`**

```ts
import * as THREE from 'three';

export const SPEAKER_RING_RADIUS = 10;
const SPEAKER_COLORS = [0xff4466, 0xffaa44, 0x44ff88, 0x44aaff, 0xaa66ff];

export class Speaker {
  context: AudioContext;
  panner: PannerNode;
  channelGain: GainNode;
  azimuth: number;
  index: number;
  color: number;

  // Visuals
  group = new THREE.Group();
  box: THREE.Mesh;
  frustum: THREE.Mesh;

  constructor(context: AudioContext, destination: AudioNode, azimuth: number, index: number) {
    this.context = context;
    this.azimuth = azimuth;
    this.index = index;
    this.color = SPEAKER_COLORS[index % SPEAKER_COLORS.length];

    this.channelGain = context.createGain();
    this.channelGain.gain.value = 1;

    this.panner = context.createPanner();
    this.panner.panningModel = 'HRTF';
    this.panner.distanceModel = 'inverse';
    this.panner.refDistance = 1;

    const x = Math.cos(azimuth) * SPEAKER_RING_RADIUS;
    const z = Math.sin(azimuth) * SPEAKER_RING_RADIUS;
    const y = 0.25;
    this.panner.positionX.value = x;
    this.panner.positionY.value = y;
    this.panner.positionZ.value = z;

    // Cone pointing inward toward origin
    const inward = new THREE.Vector3(-x, 0, -z).normalize();
    this.panner.orientationX.value = inward.x;
    this.panner.orientationY.value = inward.y;
    this.panner.orientationZ.value = inward.z;
    this.panner.coneInnerAngle = 60;
    this.panner.coneOuterAngle = 180;
    this.panner.coneOuterGain = 0.4;

    this.channelGain.connect(this.panner).connect(destination);

    // Visual: box at position + frustum cone pointing inward
    this.box = new THREE.Mesh(
      new THREE.BoxGeometry(0.3, 0.5, 0.3),
      new THREE.MeshStandardMaterial({ color: this.color, emissive: this.color, emissiveIntensity: 0.4 }),
    );
    this.box.position.set(x, y, z);

    const frustumLength = 6;
    const frustumGeom = new THREE.ConeGeometry(1.5, frustumLength, 24, 1, true);
    // Cone's default axis is +Y; we want it to point from speaker toward origin (inward, slightly up).
    frustumGeom.translate(0, -frustumLength / 2, 0); // move cone tip to origin
    const frustumMat = new THREE.MeshBasicMaterial({
      color: this.color,
      transparent: true,
      opacity: 0.12,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.frustum = new THREE.Mesh(frustumGeom, frustumMat);
    this.frustum.position.set(x, y, z);
    // Rotate to aim inward-upward (45° upward tilt to suggest coverage of dome interior)
    const target = new THREE.Vector3(0, 3, 0);
    this.frustum.lookAt(target);
    // Cone local axis is +Y; lookAt aligns -Z by default. Rotate -90° on X to align +Y with target dir.
    this.frustum.rotateX(-Math.PI / 2);

    this.group.add(this.box);
    this.group.add(this.frustum);
  }

  setGain(v: number) { this.channelGain.gain.value = v; }
  setMuted(m: boolean) { this.channelGain.gain.value = m ? 0 : 1; }
  input(): AudioNode { return this.channelGain; }

  updateVisual() {
    const g = this.channelGain.gain.value;
    const scale = 0.5 + g * 1.5;
    this.frustum.scale.set(scale, 1, scale);
    (this.frustum.material as THREE.MeshBasicMaterial).opacity = 0.05 + g * 0.2;
  }

  dispose() {
    this.box.geometry.dispose();
    (this.box.material as THREE.Material).dispose();
    this.frustum.geometry.dispose();
    (this.frustum.material as THREE.Material).dispose();
  }
}
```

- [ ] **Step 3: Update `src/types.ts`** to keep `AudioBusLike` compatible with the real class

```ts
import type * as THREE from 'three';

export type CameraMode = 'orbit' | 'first-person' | 'xr-view';
export type TemplateId = 'planetarium' | 'terrain' | 'musicviz' | 'video360';

export interface TweakpaneSchema {
  [key: string]: unknown;
}

export interface AudioBusLike {
  context: AudioContext;
  master: GainNode;
  analyser: AnalyserNode;
  speakers: { input(): AudioNode; index: number; color: number }[];
}

export interface Template {
  id: TemplateId;
  init(scene: THREE.Scene, bus: AudioBusLike): void;
  update(dt: number, time: number): void;
  dispose(): void;
  getParams(): TweakpaneSchema;
}

export interface AppState {
  cameraMode: CameraMode;
  templateId: TemplateId;
  domeOpacity: number;
  showFrustums: boolean;
  showFisheyeInset: boolean;
  cubemapResolution: 256 | 512 | 1024 | 2048;
  fov: number;
}
```

- [ ] **Step 4: Add speakers to `DomeScene`**

Update `src/app/DomeScene.ts`:

```ts
import * as THREE from 'three';
import type { Speaker } from '../audio/Speaker';

export const DOME_RADIUS = 10;
export const EYE_HEIGHT = 1.6;

export class DomeScene {
  outerScene = new THREE.Scene();
  templateScene = new THREE.Scene();
  dome: THREE.Mesh;
  floor: THREE.Mesh;
  grid: THREE.GridHelper;
  speakerGroup = new THREE.Group();

  constructor(domeMaterial: THREE.Material) {
    this.outerScene.background = new THREE.Color(0x0a0a0f);

    const domeGeom = new THREE.SphereGeometry(
      DOME_RADIUS, 96, 64, 0, Math.PI * 2, 0, Math.PI / 2,
    );
    this.dome = new THREE.Mesh(domeGeom, domeMaterial);
    this.outerScene.add(this.dome);

    const floorGeom = new THREE.CircleGeometry(DOME_RADIUS, 64);
    floorGeom.rotateX(-Math.PI / 2);
    const floorMat = new THREE.MeshBasicMaterial({ color: 0x1a1a22 });
    this.floor = new THREE.Mesh(floorGeom, floorMat);
    this.outerScene.add(this.floor);

    this.grid = new THREE.GridHelper(DOME_RADIUS * 2, 20, 0x333344, 0x22222a);
    (this.grid.material as THREE.Material).opacity = 0.4;
    (this.grid.material as THREE.Material).transparent = true;
    this.outerScene.add(this.grid);

    // Ambient light so speaker boxes are visible
    this.outerScene.add(new THREE.AmbientLight(0xffffff, 0.6));
    const dl = new THREE.DirectionalLight(0xffffff, 0.5);
    dl.position.set(5, 10, 5);
    this.outerScene.add(dl);

    this.outerScene.add(this.speakerGroup);
  }

  addSpeakers(speakers: Speaker[]) {
    speakers.forEach((s) => this.speakerGroup.add(s.group));
  }

  setFrustumsVisible(v: boolean) {
    this.speakerGroup.traverse((o) => {
      if ((o as THREE.Mesh).geometry?.type === 'ConeGeometry') o.visible = v;
    });
  }
}
```

- [ ] **Step 5: Wire into `src/main.ts`**

Replace the `bus` construction and add a speaker visual update. New `src/main.ts`:

```ts
import './style.css';
import * as THREE from 'three';
import { DomeScene, EYE_HEIGHT } from './app/DomeScene';
import { DomeProjection } from './app/DomeProjection';
import { CameraController } from './app/CameraController';
import { AudioBus } from './audio/AudioBus';
import { createTemplate } from './templates/registry';
import type { Template, TemplateId } from './types';

const canvas = document.createElement('canvas');
canvas.id = 'view';
document.querySelector<HTMLDivElement>('#app')!.appendChild(canvas);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.05, 1000);
const cameraController = new CameraController(camera, canvas);

const projection = new DomeProjection(1024);
const dome = new DomeScene(projection.material);

const bus = new AudioBus();
dome.addSpeakers(bus.speakers);

// Keep Web Audio listener synced to camera each frame
function updateAudioListener() {
  const l = bus.context.listener;
  const p = camera.position;
  if (l.positionX) {
    l.positionX.value = p.x; l.positionY.value = p.y; l.positionZ.value = p.z;
  } else {
    (l as any).setPosition?.(p.x, p.y, p.z);
  }
  const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
  if (l.forwardX) {
    l.forwardX.value = fwd.x; l.forwardY.value = fwd.y; l.forwardZ.value = fwd.z;
    l.upX.value = up.x; l.upY.value = up.y; l.upZ.value = up.z;
  } else {
    (l as any).setOrientation?.(fwd.x, fwd.y, fwd.z, up.x, up.y, up.z);
  }
}

// Resume audio on first user gesture
const resumeOnce = async () => {
  await bus.resume();
  document.removeEventListener('pointerdown', resumeOnce);
  document.removeEventListener('keydown', resumeOnce);
};
document.addEventListener('pointerdown', resumeOnce);
document.addEventListener('keydown', resumeOnce);

let current: Template | null = null;
function setTemplate(id: TemplateId) {
  if (current) current.dispose();
  while (dome.templateScene.children.length) dome.templateScene.remove(dome.templateScene.children[0]);
  current = createTemplate(id);
  current.init(dome.templateScene, bus);
}
setTemplate('planetarium');

window.addEventListener('keydown', (e) => {
  if (e.key === '1') cameraController.setMode('orbit');
  if (e.key === '2') cameraController.setMode('first-person');
});

window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
});

const clock = new THREE.Clock();
function tick() {
  const dt = clock.getDelta();
  const time = clock.elapsedTime;
  cameraController.update();
  current?.update(dt, time);
  updateAudioListener();
  bus.speakers.forEach((s) => s.updateVisual());

  dome.dome.visible = false;
  projection.render(renderer, dome.templateScene);
  dome.dome.visible = true;

  renderer.render(dome.outerScene, camera);
  requestAnimationFrame(tick);
}
tick();

void EYE_HEIGHT;
```

- [ ] **Step 6: Typecheck**

```bash
npm run check
```
Expected: no errors.

- [ ] **Step 7: Run dev and verify**

```bash
npm run dev
```
Expected: orbit view shows 5 colored boxes at the dome's base ring, each with a colored translucent cone pointing inward-upward. Floor still visible. No audio yet (no template sources). Stop server.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: add audio bus and 5-speaker ring with visual proxies"
```

---

## Task 7: PlanetariumTemplate (stars + comets + ambient drones)

**Files:**
- Create: `src/templates/PlanetariumTemplate.ts`, `src/audio/templates/PlanetariumAudio.ts`
- Modify: `src/templates/registry.ts`

- [ ] **Step 1: Create `src/audio/templates/PlanetariumAudio.ts`**

```ts
import type { AudioBusLike } from '../../types';

export class PlanetariumAudio {
  private oscillators: OscillatorNode[] = [];
  private gains: GainNode[] = [];
  private lfos: OscillatorNode[] = [];

  constructor(bus: AudioBusLike) {
    const baseFreqs = [65.4, 82.4, 98.0, 130.8, 164.8]; // low drone chord
    for (let i = 0; i < bus.speakers.length; i++) {
      const ctx = bus.context;
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = baseFreqs[i] + (i - 2) * 0.3;

      const gain = ctx.createGain();
      gain.gain.value = 0.08;

      // slow LFO on gain for breathing effect
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.07 + i * 0.013;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 0.04;
      lfo.connect(lfoGain).connect(gain.gain);

      osc.connect(gain).connect(bus.speakers[i].input());
      osc.start();
      lfo.start();

      this.oscillators.push(osc);
      this.gains.push(gain);
      this.lfos.push(lfo);
    }
  }

  dispose() {
    this.oscillators.forEach((o) => { try { o.stop(); } catch {} o.disconnect(); });
    this.lfos.forEach((o) => { try { o.stop(); } catch {} o.disconnect(); });
    this.gains.forEach((g) => g.disconnect());
  }
}
```

- [ ] **Step 2: Create `src/templates/PlanetariumTemplate.ts`**

```ts
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

    // Stars: BufferGeometry of points on a large sphere, twinkling via shader time
    const count = this.params.starDensity;
    const pos = new Float32Array(count * 3);
    const phase = new Float32Array(count);
    const sz = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      // Uniform point on upper hemisphere
      const u = Math.random();
      const v = Math.random();
      const theta = 2 * Math.PI * u;
      const phi = Math.acos(v); // 0..π/2
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

    // Comets
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
      // Advance trail
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
        // Respawn
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
      if ((o as THREE.Mesh).geometry) (o as THREE.Mesh).geometry.dispose();
      const m = (o as THREE.Mesh).material;
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
```

- [ ] **Step 3: Update `src/templates/registry.ts`**

```ts
import type { Template, TemplateId } from './Template';
import { NullTemplate } from './NullTemplate';
import { PlanetariumTemplate } from './PlanetariumTemplate';

export type TemplateFactory = () => Template;

export const templateRegistry: Record<TemplateId, TemplateFactory> = {
  planetarium: () => new PlanetariumTemplate(),
  terrain:     () => new NullTemplate(),
  musicviz:    () => new NullTemplate(),
  video360:    () => new NullTemplate(),
};

export function createTemplate(id: TemplateId): Template {
  return templateRegistry[id]();
}
```

- [ ] **Step 4: Typecheck and run**

```bash
npm run check
npm run dev
```
Expected: dome interior shows a field of twinkling white stars on a dark sky, with 3 comets sweeping across. Click the canvas once (to resume audio) — you should hear a low ambient drone across the 5 speakers. Stop server.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add planetarium template with stars, comets, and ambient drone audio"
```

---

## Task 8: TerrainSunsetTemplate (fBm terrain + gradient sky + wind)

**Files:**
- Create: `src/templates/TerrainSunsetTemplate.ts`, `src/audio/templates/TerrainAudio.ts`
- Modify: `src/templates/registry.ts`

- [ ] **Step 1: Create `src/audio/templates/TerrainAudio.ts`**

```ts
import type { AudioBusLike } from '../../types';

export class TerrainAudio {
  private sources: AudioBufferSourceNode[] = [];
  private gains: GainNode[] = [];
  private filters: BiquadFilterNode[] = [];
  private lfos: OscillatorNode[] = [];
  private noiseBuffer: AudioBuffer;

  constructor(bus: AudioBusLike) {
    const ctx = bus.context;
    // Generate 2s pink-ish noise buffer
    const bufferLen = ctx.sampleRate * 2;
    this.noiseBuffer = ctx.createBuffer(1, bufferLen, ctx.sampleRate);
    const data = this.noiseBuffer.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < bufferLen; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99765 * b0 + white * 0.0990460;
      b1 = 0.96300 * b1 + white * 0.2965164;
      b2 = 0.57000 * b2 + white * 1.0526913;
      data[i] = (b0 + b1 + b2 + white * 0.1848) * 0.25;
    }

    for (let i = 0; i < bus.speakers.length; i++) {
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      src.loop = true;

      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 400 + i * 150;
      filter.Q.value = 0.8;

      const gain = ctx.createGain();
      gain.gain.value = 0.08;

      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.1 + i * 0.04;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 0.05;
      lfo.connect(lfoGain).connect(gain.gain);

      src.connect(filter).connect(gain).connect(bus.speakers[i].input());
      src.start();
      lfo.start();

      this.sources.push(src);
      this.gains.push(gain);
      this.filters.push(filter);
      this.lfos.push(lfo);
    }
  }

  dispose() {
    this.sources.forEach((s) => { try { s.stop(); } catch {} s.disconnect(); });
    this.lfos.forEach((o) => { try { o.stop(); } catch {} o.disconnect(); });
    this.filters.forEach((f) => f.disconnect());
    this.gains.forEach((g) => g.disconnect());
  }
}
```

- [ ] **Step 2: Create `src/templates/TerrainSunsetTemplate.ts`**

```ts
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
    sunAngle: 0.08, // radians above horizon
    terrainAmplitude: 8.0,
    fogDensity: 0.015,
    windSpeed: 0.3,
  };

  init(scene: THREE.Scene, bus: AudioBusLike): void {
    scene.background = null;

    // Sky sphere (gradient)
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
          // Sun glow near horizon in +x direction
          vec3 sunDir = normalize(vec3(cos(uSunAngle), sin(uSunAngle) - 0.02, 0.0));
          float sun = pow(max(0.0, dot(normalize(vDir), sunDir)), 80.0);
          col += vec3(1.4, 0.9, 0.6) * sun;
          // Below-horizon fade
          col *= smoothstep(-0.3, 0.05, h);
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });
    const sky = new THREE.Mesh(new THREE.SphereGeometry(400, 64, 64), this.skyMat);
    this.group.add(sky);

    // Terrain plane with fBm height in vertex shader
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
          float a = hash(i); float b = hash(i+vec2(1,0));
          float c = hash(i+vec2(0,1)); float d = hash(i+vec2(1,1));
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
          // Sunset warm tint from sun direction
          vec3 sunDir = normalize(vec3(cos(uSunAngle), sin(uSunAngle), 0.0));
          float warmth = max(0.0, dot(normalize(vec3(0.0,1.0,0.0)), sunDir));
          col = mix(col, col * vec3(1.3, 0.9, 0.7), warmth * 0.5);
          // Distance fog
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
      if ((o as THREE.Mesh).geometry) (o as THREE.Mesh).geometry.dispose();
      const m = (o as THREE.Mesh).material;
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
```

- [ ] **Step 3: Register in `src/templates/registry.ts`**

```ts
import type { Template, TemplateId } from './Template';
import { NullTemplate } from './NullTemplate';
import { PlanetariumTemplate } from './PlanetariumTemplate';
import { TerrainSunsetTemplate } from './TerrainSunsetTemplate';

export type TemplateFactory = () => Template;

export const templateRegistry: Record<TemplateId, TemplateFactory> = {
  planetarium: () => new PlanetariumTemplate(),
  terrain:     () => new TerrainSunsetTemplate(),
  musicviz:    () => new NullTemplate(),
  video360:    () => new NullTemplate(),
};

export function createTemplate(id: TemplateId): Template {
  return templateRegistry[id]();
}
```

- [ ] **Step 4: Quick dev test by temporarily switching the default template**

In `src/main.ts`, change `setTemplate('planetarium')` → `setTemplate('terrain')`.

- [ ] **Step 5: Typecheck and run dev**

```bash
npm run check
npm run dev
```
Expected: dome shows a warm-toned sunset terrain with hills and a gradient sky. Audio: click canvas → hear layered wind-like filtered noise across speakers.

Revert `setTemplate('terrain')` back to `setTemplate('planetarium')` afterward.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add terrain-sunset template with fBm terrain, gradient sky, and wind audio"
```

---

## Task 9: MusicVizTemplate (audio-reactive bars + icosahedron, synth source)

**Files:**
- Create: `src/templates/MusicVizTemplate.ts`, `src/audio/templates/MusicVizAudio.ts`
- Modify: `src/templates/registry.ts`

- [ ] **Step 1: Create `src/audio/templates/MusicVizAudio.ts`**

```ts
import type { AudioBusLike } from '../../types';

export class MusicVizAudio {
  private nodes: AudioNode[] = [];
  private oscs: OscillatorNode[] = [];
  private kickTimer: number | null = null;

  constructor(bus: AudioBusLike) {
    const ctx = bus.context;

    // Pad: sawtooth chord, routed to all speakers equally
    const padNotes = [130.8, 164.8, 196.0, 246.9]; // C3 E3 G3 B3
    padNotes.forEach((f) => {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 900;
      const g = ctx.createGain();
      g.gain.value = 0.025;
      o.connect(filter).connect(g);
      bus.speakers.forEach((sp) => g.connect(sp.input()));
      o.start();
      this.oscs.push(o); this.nodes.push(filter, g);
    });

    // Lead: sine that pans across speakers
    const lead = ctx.createOscillator();
    lead.type = 'sine';
    lead.frequency.value = 523.3; // C5
    const leadGain = ctx.createGain();
    leadGain.gain.value = 0.05;
    lead.connect(leadGain);
    bus.speakers.forEach((sp) => leadGain.connect(sp.input()));
    lead.start();
    this.oscs.push(lead); this.nodes.push(leadGain);

    // Lead note pattern
    const notes = [523.3, 659.3, 784.0, 659.3];
    let idx = 0;
    const patternTimer = window.setInterval(() => {
      lead.frequency.setTargetAtTime(notes[idx % notes.length], ctx.currentTime, 0.02);
      idx++;
    }, 500);
    this.nodes.push({ disconnect: () => clearInterval(patternTimer) } as any as AudioNode);

    // Kick: repeating thump, slight bias to front-center speaker (index 0)
    this.kickTimer = window.setInterval(() => {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      osc.frequency.setValueAtTime(120, now);
      osc.frequency.exponentialRampToValueAtTime(40, now + 0.15);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.6, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
      osc.connect(g);
      // Bias to speaker 0
      bus.speakers.forEach((sp, i) => {
        const s = ctx.createGain();
        s.gain.value = i === 0 ? 1.0 : 0.5;
        g.connect(s).connect(sp.input());
      });
      osc.start(now);
      osc.stop(now + 0.25);
    }, 500);
  }

  dispose() {
    this.oscs.forEach((o) => { try { o.stop(); } catch {} o.disconnect(); });
    this.nodes.forEach((n) => { try { n.disconnect(); } catch {} });
    if (this.kickTimer !== null) clearInterval(this.kickTimer);
  }
}
```

- [ ] **Step 2: Create `src/templates/MusicVizTemplate.ts`**

```ts
import * as THREE from 'three';
import type { Template, AudioBusLike, TweakpaneSchema } from '../types';
import { MusicVizAudio } from '../audio/templates/MusicVizAudio';

export class MusicVizTemplate implements Template {
  id = 'musicviz' as const;
  private group = new THREE.Group();
  private audio: MusicVizAudio | null = null;
  private analyser: AnalyserNode | null = null;
  private fft: Uint8Array | null = null;
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

    // Ring of bars
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

    // Central icosahedron
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

    // Bars
    const reactivity = this.params.reactivity;
    for (let i = 0; i < this.bars.length; i++) {
      const bin = Math.floor((i / this.bars.length) * (this.fft.length * 0.5));
      const v = this.fft[bin] / 255;
      const target = 0.2 + v * 6 * reactivity;
      const s = this.bars[i].scale;
      s.y += (target - s.y) * 0.25;
      this.bars[i].position.y = s.y / 2;
    }

    // Icosahedron vertex displacement by bass/mid/treble
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
      if ((o as THREE.Mesh).geometry) (o as THREE.Mesh).geometry.dispose();
      const m = (o as THREE.Mesh).material;
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

function avg(arr: Uint8Array, a: number, b: number): number {
  let s = 0, n = 0;
  const end = Math.min(b, arr.length);
  for (let i = a; i < end; i++) { s += arr[i]; n++; }
  return n === 0 ? 0 : s / n;
}
```

- [ ] **Step 3: Register in `src/templates/registry.ts`**

```ts
import type { Template, TemplateId } from './Template';
import { NullTemplate } from './NullTemplate';
import { PlanetariumTemplate } from './PlanetariumTemplate';
import { TerrainSunsetTemplate } from './TerrainSunsetTemplate';
import { MusicVizTemplate } from './MusicVizTemplate';

export type TemplateFactory = () => Template;

export const templateRegistry: Record<TemplateId, TemplateFactory> = {
  planetarium: () => new PlanetariumTemplate(),
  terrain:     () => new TerrainSunsetTemplate(),
  musicviz:    () => new MusicVizTemplate(),
  video360:    () => new NullTemplate(),
};

export function createTemplate(id: TemplateId): Template {
  return templateRegistry[id]();
}
```

- [ ] **Step 4: Test by switching default to `musicviz` in `main.ts`**

Change `setTemplate('planetarium')` → `setTemplate('musicviz')`, run dev, click canvas to enable audio. Expected: ring of colored bars bouncing to the kick, pink/violet icosahedron pulsing. Hear chord pad + kick + lead melody distributed across the 5 speakers. Revert default back to `planetarium` afterward.

- [ ] **Step 5: Typecheck & commit**

```bash
npm run check
git add -A
git commit -m "feat: add music visualizer template with audio-reactive bars and icosahedron"
```

---

## Task 10: Video360Template (equirectangular video sphere)

**Files:**
- Create: `src/templates/Video360Template.ts`, `src/audio/templates/Video360Audio.ts`
- Modify: `src/templates/registry.ts`

- [ ] **Step 1: Create `src/audio/templates/Video360Audio.ts`**

```ts
import type { AudioBusLike } from '../../types';

export class Video360Audio {
  private source: MediaElementAudioSourceNode | null = null;
  private gain: GainNode | null = null;

  constructor(private bus: AudioBusLike) {}

  attachVideo(video: HTMLVideoElement) {
    this.detach();
    const ctx = this.bus.context;
    try {
      this.source = ctx.createMediaElementSource(video);
      this.gain = ctx.createGain();
      this.gain.gain.value = 0.9;
      this.source.connect(this.gain);
      this.bus.speakers.forEach((sp) => this.gain!.connect(sp.input()));
    } catch (e) {
      // createMediaElementSource throws if already connected; safe to ignore
      console.warn('Video360Audio: could not attach', e);
    }
  }

  detach() {
    this.source?.disconnect();
    this.gain?.disconnect();
    this.source = null;
    this.gain = null;
  }

  dispose() { this.detach(); }
}
```

- [ ] **Step 2: Create `src/templates/Video360Template.ts`**

```ts
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
    geom.scale(-1, 1, 1); // inward-facing
    const mat = new THREE.MeshBasicMaterial({ map: this.texture, color: 0x888888 });
    this.sphere = new THREE.Mesh(geom, mat);
    this.group.add(this.sphere);
    scene.add(this.group);

    this.audio = new Video360Audio(bus);

    // Drag-drop onto the canvas
    window.addEventListener('dragover', this.onDragOver);
    window.addEventListener('drop', this.onDrop);
  }

  loadFile(file: File) {
    const url = URL.createObjectURL(file);
    this.video.src = url;
    this.params.fileLabel = file.name;
    const bus = this._bus;
    this.video.addEventListener('loadeddata', () => {
      if (bus && this.audio) this.audio.attachVideo(this.video);
      if (this.params.play) this.video.play().catch(() => {});
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
    if (this.params.play && this.video.paused && this.video.src) this.video.play().catch(() => {});
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
```

- [ ] **Step 3: Register in `src/templates/registry.ts`**

```ts
import type { Template, TemplateId } from './Template';
import { PlanetariumTemplate } from './PlanetariumTemplate';
import { TerrainSunsetTemplate } from './TerrainSunsetTemplate';
import { MusicVizTemplate } from './MusicVizTemplate';
import { Video360Template } from './Video360Template';

export type TemplateFactory = () => Template;

export const templateRegistry: Record<TemplateId, TemplateFactory> = {
  planetarium: () => new PlanetariumTemplate(),
  terrain:     () => new TerrainSunsetTemplate(),
  musicviz:    () => new MusicVizTemplate(),
  video360:    () => new Video360Template(),
};

export function createTemplate(id: TemplateId): Template {
  return templateRegistry[id]();
}
```

Remove the `NullTemplate` import since no longer used (but keep the file — it's handy for future debugging).

- [ ] **Step 4: Typecheck and dev test**

```bash
npm run check
npm run dev
```
Quick test: temporarily change default to `video360`. Drag any `.mp4` file from disk onto the window — it should load and play on the inside of the dome. Revert default back to `planetarium` afterward.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add 360 video template with drag-drop equirectangular playback"
```

---

## Task 11: Tweakpane UI (Config / Template / Speakers / Camera)

**Files:**
- Create: `src/ui/TweakpaneUI.ts`
- Modify: `src/main.ts`

- [ ] **Step 1: Create `src/ui/TweakpaneUI.ts`**

```ts
import { Pane } from 'tweakpane';
import type { FolderApi } from 'tweakpane';
import type { AppState, Template, TemplateId, CameraMode } from '../types';
import type { AudioBus } from '../audio/AudioBus';
import type { DomeProjection } from '../app/DomeProjection';
import type { DomeScene } from '../app/DomeScene';

export interface TweakpaneUIActions {
  onTemplateChange: (id: TemplateId) => void;
  onCameraModeChange: (mode: CameraMode) => void;
  onPresetSave: (slot: 1 | 2) => void;
  onPresetRecall: (slot: 1 | 2) => void;
}

export class TweakpaneUI {
  pane: Pane;
  private templateFolder: FolderApi;
  private currentTemplateBindings: { dispose(): void }[] = [];

  constructor(
    state: AppState,
    private bus: AudioBus,
    private projection: DomeProjection,
    private dome: DomeScene,
    private actions: TweakpaneUIActions,
  ) {
    this.pane = new Pane({ title: 'Dome Previs', expanded: true });
    (this.pane.element.parentElement as HTMLElement).style.zIndex = '10';

    // Config
    const cfg = this.pane.addFolder({ title: 'Config' });
    cfg.addBinding(state, 'cubemapResolution', {
      options: { '256': 256, '512': 512, '1024': 1024, '2048': 2048 },
    }).on('change', (ev) => projection.setResolution(ev.value as number));
    cfg.addBinding(state, 'domeOpacity', { min: 0.0, max: 1.0, step: 0.01 })
      .on('change', (ev) => projection.setOpacity(ev.value as number));
    cfg.addBinding(state, 'showFrustums').on('change', (ev) => dome.setFrustumsVisible(ev.value as boolean));
    cfg.addBinding(state, 'showFisheyeInset');

    // Template
    this.templateFolder = this.pane.addFolder({ title: 'Template' });
    this.templateFolder.addBinding(state, 'templateId', {
      options: {
        Planetarium: 'planetarium',
        Terrain: 'terrain',
        'Music Viz': 'musicviz',
        '360 Video': 'video360',
      },
    }).on('change', (ev) => actions.onTemplateChange(ev.value as TemplateId));

    // Speakers
    const spk = this.pane.addFolder({ title: 'Speakers' });
    bus.speakers.forEach((s, i) => {
      const row = spk.addFolder({ title: `Speaker ${i + 1}`, expanded: false });
      const state = { gain: 1, mute: false, azimuth: (i * 360) / bus.speakers.length };
      row.addBinding(state, 'gain', { min: 0, max: 2, step: 0.01 })
        .on('change', (ev) => s.setGain(ev.value as number));
      row.addBinding(state, 'mute')
        .on('change', (ev) => s.setMuted(ev.value as boolean));
      row.addBinding(state, 'azimuth', { min: 0, max: 360, step: 1 })
        .on('change', (ev) => {
          const az = ((ev.value as number) * Math.PI) / 180;
          const x = Math.cos(az) * 10;
          const z = Math.sin(az) * 10;
          s.panner.positionX.value = x;
          s.panner.positionZ.value = z;
          s.box.position.set(x, s.box.position.y, z);
          s.frustum.position.set(x, s.frustum.position.y, z);
          s.frustum.lookAt(0, 3, 0);
          s.frustum.rotateX(-Math.PI / 2);
        });
    });

    // Camera
    const cam = this.pane.addFolder({ title: 'Camera' });
    cam.addBinding(state, 'cameraMode', {
      options: { Orbit: 'orbit', 'First-person': 'first-person', 'XR View': 'xr-view' },
    }).on('change', (ev) => actions.onCameraModeChange(ev.value as CameraMode));
    cam.addBinding(state, 'fov', { min: 40, max: 110, step: 1 });
    cam.addButton({ title: 'Save Preset 1' }).on('click', () => actions.onPresetSave(1));
    cam.addButton({ title: 'Recall Preset 1' }).on('click', () => actions.onPresetRecall(1));
    cam.addButton({ title: 'Save Preset 2' }).on('click', () => actions.onPresetSave(2));
    cam.addButton({ title: 'Recall Preset 2' }).on('click', () => actions.onPresetRecall(2));
  }

  bindTemplateParams(template: Template) {
    this.currentTemplateBindings.forEach((b) => b.dispose());
    this.currentTemplateBindings = [];
    const params = template.getParams() as Record<string, unknown>;
    for (const key of Object.keys(params)) {
      const v = params[key];
      if (typeof v === 'number' || typeof v === 'boolean') {
        const opts = typeof v === 'number' ? { min: 0, max: Math.max(10, v * 4), step: v < 1 ? 0.01 : 1 } : {};
        const b = this.templateFolder.addBinding(params, key, opts);
        this.currentTemplateBindings.push({ dispose: () => b.dispose() });
      } else if (typeof v === 'string') {
        const b = this.templateFolder.addBinding(params, key, { readonly: true });
        this.currentTemplateBindings.push({ dispose: () => b.dispose() });
      }
    }
  }
}
```

- [ ] **Step 2: Wire Tweakpane into `src/main.ts`**

Replace `src/main.ts`:

```ts
import './style.css';
import * as THREE from 'three';
import { DomeScene, EYE_HEIGHT } from './app/DomeScene';
import { DomeProjection } from './app/DomeProjection';
import { CameraController } from './app/CameraController';
import { AudioBus } from './audio/AudioBus';
import { createTemplate } from './templates/registry';
import { TweakpaneUI } from './ui/TweakpaneUI';
import type { AppState, Template, TemplateId, CameraMode } from './types';

const canvas = document.createElement('canvas');
canvas.id = 'view';
document.querySelector<HTMLDivElement>('#app')!.appendChild(canvas);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.05, 1000);
const cameraController = new CameraController(camera, canvas);

const projection = new DomeProjection(1024);
const dome = new DomeScene(projection.material);

const bus = new AudioBus();
dome.addSpeakers(bus.speakers);

const state: AppState = {
  cameraMode: 'orbit',
  templateId: 'planetarium',
  domeOpacity: 0.55,
  showFrustums: true,
  showFisheyeInset: true,
  cubemapResolution: 1024,
  fov: 60,
};

let current: Template | null = null;
function setTemplate(id: TemplateId) {
  if (current) current.dispose();
  while (dome.templateScene.children.length) dome.templateScene.remove(dome.templateScene.children[0]);
  current = createTemplate(id);
  current.init(dome.templateScene, bus);
  if (ui) ui.bindTemplateParams(current);
}

const presets: Record<1 | 2, { pos: THREE.Vector3; target: THREE.Vector3 } | null> = { 1: null, 2: null };

const ui = new TweakpaneUI(state, bus, projection, dome, {
  onTemplateChange: (id) => setTemplate(id),
  onCameraModeChange: (m: CameraMode) => cameraController.setMode(m),
  onPresetSave: (slot) => {
    presets[slot] = { pos: camera.position.clone(), target: new THREE.Vector3(0, 2, 0) };
  },
  onPresetRecall: (slot) => {
    const p = presets[slot];
    if (p) {
      camera.position.copy(p.pos);
      camera.lookAt(p.target);
    }
  },
});

setTemplate('planetarium');

// Keep camera FOV synced
setInterval(() => {
  if (camera.fov !== state.fov) {
    camera.fov = state.fov;
    camera.updateProjectionMatrix();
  }
}, 100);

// Resume audio on first user gesture
const resumeOnce = async () => {
  await bus.resume();
  document.removeEventListener('pointerdown', resumeOnce);
  document.removeEventListener('keydown', resumeOnce);
};
document.addEventListener('pointerdown', resumeOnce);
document.addEventListener('keydown', resumeOnce);

function updateAudioListener() {
  const l = bus.context.listener;
  const p = camera.position;
  if (l.positionX) {
    l.positionX.value = p.x; l.positionY.value = p.y; l.positionZ.value = p.z;
  } else {
    (l as any).setPosition?.(p.x, p.y, p.z);
  }
  const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
  if (l.forwardX) {
    l.forwardX.value = fwd.x; l.forwardY.value = fwd.y; l.forwardZ.value = fwd.z;
    l.upX.value = up.x; l.upY.value = up.y; l.upZ.value = up.z;
  } else {
    (l as any).setOrientation?.(fwd.x, fwd.y, fwd.z, up.x, up.y, up.z);
  }
}

window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
});

const clock = new THREE.Clock();
function tick() {
  const dt = clock.getDelta();
  const time = clock.elapsedTime;
  cameraController.update();
  current?.update(dt, time);
  updateAudioListener();
  bus.speakers.forEach((s) => s.updateVisual());

  dome.dome.visible = false;
  projection.render(renderer, dome.templateScene);
  dome.dome.visible = true;

  renderer.render(dome.outerScene, camera);
  requestAnimationFrame(tick);
}
tick();

void EYE_HEIGHT;
```

- [ ] **Step 3: Typecheck and run dev**

```bash
npm run check
npm run dev
```
Expected: Tweakpane panel docked right with folders Config / Template / Speakers / Camera. Switching the Template dropdown live-swaps between Planetarium / Terrain / Music Viz / Video 360. Speaker gain sliders affect audio level (and the frustum scale). Camera mode dropdown switches between orbit and first-person. Save/Recall preset buttons work.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: add tweakpane UI with Config/Template/Speakers/Camera folders"
```

---

## Task 12: Fisheye inset preview

**Files:**
- Create: `src/ui/FisheyeInset.ts`
- Modify: `src/main.ts`, `src/style.css`

- [ ] **Step 1: Add corner canvas CSS to `src/style.css`**

Append:
```css
#fisheye-inset {
  position: fixed;
  left: 16px;
  bottom: 16px;
  width: 256px;
  height: 256px;
  border: 1px solid #444;
  border-radius: 50%;
  background: #000;
  pointer-events: none;
  z-index: 5;
  overflow: hidden;
}
#fisheye-inset canvas { display: block; width: 100%; height: 100%; }
```

- [ ] **Step 2: Create `src/ui/FisheyeInset.ts`**

The inset is a small offscreen scene that samples the cubemap via a full-screen-quad shader using azimuthal equidistant projection, rendered into a canvas in the DOM.

```ts
import * as THREE from 'three';

const vert = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position, 1.0); }
`;

const frag = /* glsl */ `
  uniform samplerCube uCube;
  varying vec2 vUv;
  void main() {
    vec2 p = vUv * 2.0 - 1.0;
    float r = length(p);
    if (r > 1.0) { gl_FragColor = vec4(0.0); return; }
    // Azimuthal equidistant: r in [0,1] maps to polar angle in [0, π/2] (upper hemisphere)
    float theta = r * 1.5707963; // π/2
    float phi = atan(p.y, p.x);
    vec3 dir = vec3(sin(theta) * cos(phi), cos(theta), sin(theta) * sin(phi));
    gl_FragColor = vec4(textureCube(uCube, dir).rgb, 1.0);
  }
`;

export class FisheyeInset {
  private scene = new THREE.Scene();
  private cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private mat: THREE.ShaderMaterial;
  private target: THREE.WebGLRenderTarget;
  private size = 256;
  private container: HTMLDivElement;
  private canvas: HTMLCanvasElement;
  private tempRenderer: THREE.WebGLRenderer;

  constructor(cube: THREE.CubeTexture | THREE.WebGLCubeRenderTarget) {
    const tex = (cube as THREE.WebGLCubeRenderTarget).texture ?? cube;
    this.mat = new THREE.ShaderMaterial({
      vertexShader: vert,
      fragmentShader: frag,
      uniforms: { uCube: { value: tex } },
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.mat);
    this.scene.add(quad);

    this.target = new THREE.WebGLRenderTarget(this.size, this.size);

    this.container = document.createElement('div');
    this.container.id = 'fisheye-inset';
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.size;
    this.canvas.height = this.size;
    this.container.appendChild(this.canvas);
    document.body.appendChild(this.container);

    this.tempRenderer = new THREE.WebGLRenderer({ canvas: this.canvas, alpha: true, antialias: false });
    this.tempRenderer.setSize(this.size, this.size, false);
  }

  setCubeTexture(tex: THREE.CubeTexture) {
    this.mat.uniforms.uCube.value = tex;
  }

  render() {
    this.tempRenderer.render(this.scene, this.cam);
  }

  setVisible(v: boolean) { this.container.style.display = v ? 'block' : 'none'; }

  dispose() {
    this.tempRenderer.dispose();
    this.target.dispose();
    this.mat.dispose();
    this.container.remove();
  }
}
```

- [ ] **Step 3: Wire into `src/main.ts`**

At the top imports:
```ts
import { FisheyeInset } from './ui/FisheyeInset';
```

After `projection` is created:
```ts
const fisheye = new FisheyeInset(projection.cubeRT);
```

Keep it synced with the projection's current cubemap and the UI toggle. Replace the `tick` function:

```ts
function tick() {
  const dt = clock.getDelta();
  const time = clock.elapsedTime;
  cameraController.update();
  current?.update(dt, time);
  updateAudioListener();
  bus.speakers.forEach((s) => s.updateVisual());

  dome.dome.visible = false;
  projection.render(renderer, dome.templateScene);
  dome.dome.visible = true;

  fisheye.setCubeTexture(projection.cubeRT.texture);
  fisheye.setVisible(state.showFisheyeInset);
  fisheye.render();

  renderer.render(dome.outerScene, camera);
  requestAnimationFrame(tick);
}
```

- [ ] **Step 4: Typecheck and run dev**

```bash
npm run check
npm run dev
```
Expected: round 256×256 fisheye preview in bottom-left corner showing the dome-master view of the current template. Toggle `Config > showFisheyeInset` off — the inset hides. Turn back on — visible.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add fisheye inset preview showing dome-master view of current template"
```

---

## Task 13: WebXR (VR button, XR rig, per-frame adjustments)

**Files:**
- Modify: `src/main.ts`, `src/app/CameraController.ts`, `src/app/DomeProjection.ts`

- [ ] **Step 1: Enable XR and add VR button in `src/main.ts`**

Add imports near the top:
```ts
import { VRButton } from 'three/examples/jsm/webxr/VRButton.js';
```

After `renderer` is created, enable XR and append the button:
```ts
renderer.xr.enabled = true;
const vrBtn = VRButton.createButton(renderer);
vrBtn.style.zIndex = '20';
document.body.appendChild(vrBtn);
```

Replace `requestAnimationFrame(tick)` with XR-safe animation loop. Change the end of `tick()` to just `// next frame handled by setAnimationLoop` and replace the final call to `tick()` with:

```ts
renderer.setAnimationLoop(tick);
```

Delete the `requestAnimationFrame(tick)` line.

- [ ] **Step 2: Reduce cubemap resolution in XR**

Replace the `tick` function's start to detect XR:
```ts
function tick() {
  const dt = clock.getDelta();
  const time = clock.elapsedTime;
  const inXR = renderer.xr.isPresenting;

  if (inXR && projection.cubeRT.width !== 512) projection.setResolution(512);
  if (!inXR && projection.cubeRT.width !== state.cubemapResolution) projection.setResolution(state.cubemapResolution);

  cameraController.update();
  // ... rest unchanged
```

- [ ] **Step 3: Hide the dome interior's shader opacity fade in XR**

The user is inside the dome in XR, so we don't want the back-face dim. In `DomeProjection.ts`, the shader already handles that via normals — but we need to make sure the dome is rendered and the cubemap isn't self-sampled.

Tick-time behavior is already correct (dome invisible during cubemap render), no further changes.

- [ ] **Step 4: Position XR rig at dome center**

In `main.ts`, when in XR, ensure camera's parent (the XR rig group) is positioned at `(0, 0, 0)`. Three's XR uses `camera.position` internally, but we can snap the renderer's XR camera parent. Simpler: create a `THREE.Group` used as an XR dolly containing the camera, add it to the scene, and position it at origin.

Replace camera setup in `main.ts`:

```ts
const xrDolly = new THREE.Group();
xrDolly.position.set(0, 0, 0);
dome.outerScene.add(xrDolly);
// Attach camera so XR rig origin = dome center
xrDolly.add(camera);
```

(Place this before `cameraController = new CameraController(...)`. Update CameraController if needed — since it mutates `camera.position`, which is now local to the dolly, that remains correct for non-XR modes.)

- [ ] **Step 5: Typecheck**

```bash
npm run check
```
Expected: no errors.

- [ ] **Step 6: Run dev and verify desktop still works**

```bash
npm run dev
```
Open the URL in a desktop browser.
- Orbit, first-person, Tweakpane all behave as before.
- A VR button is visible in the bottom-center. If no XR device, it shows "VR NOT SUPPORTED" — that's fine.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: enable WebXR with VR button, XR dolly, and dynamic cubemap downsampling"
```

---

## Task 14: XR controllers with ray + template/camera dispatch

**Files:**
- Create: `src/xr/XRControllers.ts`
- Modify: `src/main.ts`

- [ ] **Step 1: Create `src/xr/XRControllers.ts`**

```ts
import * as THREE from 'three';
import type { TemplateId, CameraMode } from '../types';

export interface XRActionHandlers {
  onTemplateChange: (id: TemplateId) => void;
  onCameraModeChange: (mode: CameraMode) => void;
}

const TEMPLATE_LABELS: { id: TemplateId; label: string; color: number }[] = [
  { id: 'planetarium', label: 'Planetarium', color: 0x4466ff },
  { id: 'terrain',     label: 'Terrain',     color: 0xff8844 },
  { id: 'musicviz',    label: 'Music Viz',   color: 0xff44aa },
  { id: 'video360',    label: '360 Video',   color: 0x44ffaa },
];

export class XRControllers {
  group = new THREE.Group();
  private controllers: THREE.XRTargetRaySpace[] = [];
  private rays: THREE.Line[] = [];
  private uiGroup = new THREE.Group();
  private buttons: { mesh: THREE.Mesh; onActivate: () => void }[] = [];
  private raycaster = new THREE.Raycaster();

  constructor(renderer: THREE.WebGLRenderer, private actions: XRActionHandlers) {
    for (let i = 0; i < 2; i++) {
      const c = renderer.xr.getController(i);
      const geom = new THREE.BufferGeometry();
      geom.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, -5], 3));
      const ray = new THREE.Line(geom, new THREE.LineBasicMaterial({ color: 0xffffff }));
      c.add(ray);
      c.addEventListener('selectstart', () => this.onSelect(c));
      this.controllers.push(c);
      this.rays.push(ray);
      this.group.add(c);
    }
    this.buildUI();
    this.group.add(this.uiGroup);
  }

  private buildUI() {
    // Floating panel in front of user at z = -1.5, above floor, forward
    this.uiGroup.position.set(0, 1.4, -1.5);

    TEMPLATE_LABELS.forEach((t, i) => {
      const m = new THREE.Mesh(
        new THREE.BoxGeometry(0.28, 0.14, 0.02),
        new THREE.MeshBasicMaterial({ color: t.color }),
      );
      m.position.set((i - (TEMPLATE_LABELS.length - 1) / 2) * 0.32, 0, 0);
      this.uiGroup.add(m);
      this.buttons.push({ mesh: m, onActivate: () => this.actions.onTemplateChange(t.id) });
    });

    const modes: { m: CameraMode; c: number }[] = [
      { m: 'orbit', c: 0xffffff },
      { m: 'first-person', c: 0xffaa00 },
    ];
    modes.forEach((mo, i) => {
      const m = new THREE.Mesh(
        new THREE.BoxGeometry(0.28, 0.14, 0.02),
        new THREE.MeshBasicMaterial({ color: mo.c }),
      );
      m.position.set((i - 0.5) * 0.32, -0.2, 0);
      this.uiGroup.add(m);
      this.buttons.push({ mesh: m, onActivate: () => this.actions.onCameraModeChange(mo.m) });
    });
  }

  private onSelect(controller: THREE.XRTargetRaySpace) {
    const origin = new THREE.Vector3();
    const direction = new THREE.Vector3(0, 0, -1);
    controller.getWorldPosition(origin);
    direction.applyQuaternion(controller.getWorldQuaternion(new THREE.Quaternion()));
    this.raycaster.set(origin, direction);
    const meshes = this.buttons.map((b) => b.mesh);
    const hits = this.raycaster.intersectObjects(meshes, false);
    if (hits.length) {
      const hitMesh = hits[0].object as THREE.Mesh;
      const btn = this.buttons.find((b) => b.mesh === hitMesh);
      btn?.onActivate();
    }
  }

  setVisible(v: boolean) { this.group.visible = v; }
}
```

- [ ] **Step 2: Wire into `src/main.ts`**

Import:
```ts
import { XRControllers } from './xr/XRControllers';
```

Create controllers after `cameraController`:
```ts
const xrControllers = new XRControllers(renderer, {
  onTemplateChange: (id) => {
    setTemplate(id);
    state.templateId = id;
    ui.pane.refresh();
  },
  onCameraModeChange: (m) => {
    cameraController.setMode(m);
    state.cameraMode = m;
    ui.pane.refresh();
  },
});
dome.outerScene.add(xrControllers.group);
```

In the tick, show/hide based on XR state:
```ts
xrControllers.setVisible(renderer.xr.isPresenting);
```

- [ ] **Step 3: Typecheck**

```bash
npm run check
```
Expected: no errors.

- [ ] **Step 4: Run dev and verify desktop + XR surfaces**

```bash
npm run dev
```
- Desktop: controllers are invisible (expected). App still works normally.
- If a WebXR device (headset or emulator like the "WebXR Emulator" Chrome extension) is connected: enter VR, confirm controllers show laser rays; point at floating colored buttons in front of you; pressing the trigger should switch templates. Press the mode buttons to switch camera mode.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add WebXR controllers with ray and template/camera dispatch UI"
```

---

## Task 15: Polish pass — rebind template params, XR safety, readme

**Files:**
- Modify: `src/ui/TweakpaneUI.ts`, `src/main.ts`
- Create: `README.md`

- [ ] **Step 1: Ensure initial template params bind to Tweakpane**

In `src/main.ts`, verify the call order:
1. `ui = new TweakpaneUI(...)`
2. `setTemplate('planetarium')` (which internally calls `ui.bindTemplateParams(current)`)

Already correct from Task 11. Confirm by running dev and seeing planetarium params (starDensity, cometRate, twinkleSpeed) appear under the Template folder.

- [ ] **Step 2: Create `README.md`**

```markdown
# Dome Previs

Three.js + Vite + TypeScript previsualization tool for dome-show content.

## Run

```bash
npm install
npm run dev
```

## Features

- 4 content modes: Planetarium (stars + comets), Terrain Sunset, Music Visualizer, 360 Video (drag-drop any .mp4 onto the window)
- Camera modes: orbit (external), first-person (pointer lock, click to lock / ESC to release), WebXR (VR button, headset at dome center, trigger+ray to switch templates)
- 5-channel spatial audio via Web Audio `PannerNode` speakers at the dome base ring
- Tweakpane UI for all settings; fisheye dome-master preview in bottom-left corner

## Validate changes

```bash
npm run check
```

TypeScript is the test suite. Interactive validation is visual — `npm run dev` and click through each template / camera mode.
```

- [ ] **Step 3: Final typecheck and end-to-end browser test**

```bash
npm run check
npm run dev
```

Manual checklist:
- [ ] Orbit mode: dome visible with projected content, speakers at base ring with colored frustums, fisheye inset in bottom-left shows dome-master
- [ ] Switch templates via dropdown: planetarium / terrain / music viz / video360 — each renders distinctive content with distinctive audio
- [ ] Click canvas — audio resumes; template source plays through 5 speakers
- [ ] Adjust speaker gain slider — hear channel-level change + frustum scales
- [ ] Switch to first-person mode — click canvas to lock pointer, look around from center, ESC releases
- [ ] For video360: drag a local .mp4 onto the window — plays on dome interior, audio routes to the bus
- [ ] Save Preset 1 → orbit somewhere → Recall Preset 1 → camera snaps back
- [ ] Fisheye inset toggle works

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: add readme and final polish pass"
```

---

## Self-review notes

- **Spec coverage:** Each spec section has a task — geometry (Task 2-3), projection (3), templates (4, 7-10), audio (6), speakers (6), cameras (5), XR (13-14), Tweakpane (11), fisheye inset (12), out-of-scope items are intentionally deferred.
- **Aesthetic inspiration** from reference photos is realized in Task 6 (colored frustums + box speakers) and Task 12 (fisheye inset).
- **No unit tests** by design — the spec says validation is visual/interactive. Each task includes a manual dev-server check.
- **Types consistent:** `AudioBusLike` defined in types.ts in Task 2, matched by the real `AudioBus` in Task 6. `Template`, `TemplateId`, `CameraMode` all consistent across tasks.
- **Commit cadence:** Every task ends with a commit. Small, reviewable increments.
