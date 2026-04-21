import './style.css';
import * as THREE from 'three';
import { WebGPURenderer, CubeRenderTarget } from 'three/webgpu';
import { VRButton } from 'three/examples/jsm/webxr/VRButton.js';
import { DomeScene, EYE_HEIGHT } from './app/DomeScene';
import { DomeMaterial } from './app/DomeProjection';
import { CameraController } from './app/CameraController';
import { AudioBus } from './audio/AudioBus';
import { createTemplate } from './templates/registry';
import { TweakpaneUI } from './ui/TweakpaneUI';
import { FisheyeInset } from './ui/FisheyeInset';
import { XRControllers } from './xr/XRControllers';
import type { AppState, Template, TemplateId, CameraMode, CubeResolution } from './types';

const canvas = document.createElement('canvas');
canvas.id = 'view';
document.querySelector<HTMLDivElement>('#app')!.appendChild(canvas);

const renderer = new WebGPURenderer({ canvas, antialias: true, forceWebGL: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.xr.enabled = true;
await renderer.init();

const vrBtn = VRButton.createButton(renderer as unknown as THREE.WebGLRenderer);
vrBtn.style.zIndex = '20';
document.body.appendChild(vrBtn);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.05, 1000);
const cameraController = new CameraController(camera, canvas);

const INITIAL_CUBE_RES = 1024;
const domeCubeRT = new CubeRenderTarget(INITIAL_CUBE_RES, {
  generateMipmaps: false,
});
const domeCubeCamera = new THREE.CubeCamera(0.05, 2000, domeCubeRT);
domeCubeCamera.position.set(0, 0, 0);

const domeCubeTex = domeCubeRT.texture as unknown as THREE.CubeTexture;
const domeMaterial = new DomeMaterial(domeCubeTex);
const dome = new DomeScene(domeMaterial);
dome.outerScene.add(domeCubeCamera);

const fisheye = new FisheyeInset(domeCubeTex);

const xrDolly = new THREE.Group();
xrDolly.position.set(0, 0, 0);
dome.outerScene.add(xrDolly);
xrDolly.add(camera);

const bus = new AudioBus();

const state: AppState = {
  cameraMode: 'orbit',
  templateId: 'planetarium',
  domeOpacity: 0.55,
  showFisheyeInset: true,
  domeCubeResolution: INITIAL_CUBE_RES,
  fov: 60,
};

let current: Template | null = null;
let ui: TweakpaneUI | null = null;

function setTemplate(id: TemplateId) {
  if (current) current.dispose();
  while (dome.templateScene.children.length) dome.templateScene.remove(dome.templateScene.children[0]);
  current = createTemplate(id);
  current.init(dome.templateScene, bus);
  if (ui) ui.bindTemplateParams(current);
}

function setCubeResolution(res: CubeResolution) {
  if (res === state.domeCubeResolution) return;
  state.domeCubeResolution = res;
  domeCubeRT.setSize(res, res);
}

const presets: Record<1 | 2, { pos: THREE.Vector3; target: THREE.Vector3 } | null> = { 1: null, 2: null };

ui = new TweakpaneUI(state, {
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
  onDomeOpacityChange: (v) => domeMaterial.setOpacity(v),
  onCubeResolutionChange: (v) => setCubeResolution(v),
});

setTemplate('planetarium');

const xrControllers = new XRControllers(renderer, {
  onTemplateChange: (id) => {
    setTemplate(id);
    state.templateId = id;
    ui?.pane.refresh();
  },
  onCameraModeChange: (m) => {
    cameraController.setMode(m);
    state.cameraMode = m;
    ui?.pane.refresh();
  },
});
dome.outerScene.add(xrControllers.group);

setInterval(() => {
  if (camera.fov !== state.fov) {
    camera.fov = state.fov;
    camera.updateProjectionMatrix();
  }
}, 100);

const resumeOnce = async () => {
  await bus.resume();
  document.removeEventListener('pointerdown', resumeOnce);
  document.removeEventListener('keydown', resumeOnce);
};
document.addEventListener('pointerdown', resumeOnce);
document.addEventListener('keydown', resumeOnce);

const CAM_MODES: CameraMode[] = ['orbit', 'first-person', 'xr-view'];
document.addEventListener('keydown', (ev) => {
  if (ev.key !== 'c' && ev.key !== 'C') return;
  const t = ev.target as HTMLElement | null;
  if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
  const next = CAM_MODES[(CAM_MODES.indexOf(state.cameraMode) + 1) % CAM_MODES.length];
  cameraController.setMode(next);
  state.cameraMode = next;
  ui?.pane.refresh();
});

function updateAudioListener() {
  const l = bus.context.listener;
  const p = camera.position;
  if (l.positionX) {
    l.positionX.value = p.x; l.positionY.value = p.y; l.positionZ.value = p.z;
  } else {
    (l as unknown as { setPosition: (x: number, y: number, z: number) => void }).setPosition?.(p.x, p.y, p.z);
  }
  const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
  if (l.forwardX) {
    l.forwardX.value = fwd.x; l.forwardY.value = fwd.y; l.forwardZ.value = fwd.z;
    l.upX.value = up.x; l.upY.value = up.y; l.upZ.value = up.z;
  } else {
    (l as unknown as { setOrientation: (fx: number, fy: number, fz: number, ux: number, uy: number, uz: number) => void })
      .setOrientation?.(fwd.x, fwd.y, fwd.z, up.x, up.y, up.z);
  }
}

window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
});

const timer = new THREE.Timer();
timer.connect(document);
function tick() {
  timer.update();
  const dt = timer.getDelta();
  const time = timer.getElapsed();
  const inXR = renderer.xr.isPresenting;

  xrControllers.setVisible(inXR);

  cameraController.update(dt);
  bus.update(dt);
  current?.update(dt, time);
  updateAudioListener();

  // One cube capture of the template scene feeds both the dome surface and the fisheye inset.
  domeCubeCamera.update(renderer as unknown as THREE.WebGLRenderer, dome.templateScene);

  renderer.render(dome.outerScene, camera);

  const wantsFisheye = !inXR && state.showFisheyeInset;
  if (wantsFisheye) {
    fisheye.setVisible(true);
    fisheye.render(renderer as unknown as THREE.WebGLRenderer);
  } else {
    fisheye.setVisible(false);
  }
}
renderer.setAnimationLoop(tick);
