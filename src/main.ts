import './style.css';
import * as THREE from 'three';
import { WebGPURenderer, CubeRenderTarget } from 'three/webgpu';
import { VRButton } from 'three/examples/jsm/webxr/VRButton.js';
import { DomeScene, DOME_RADIUS } from './app/DomeScene';
import { DomeMaterial, DomeMaterialEquirect, DomeMaterialFisheye } from './app/DomeProjection';
import { CameraController } from './app/CameraController';
import { AudioBus } from './audio/AudioBus';
import { Video360Template, type Video360PlaybackStats, type Video360Source } from './templates/Video360Template';
import { TweakpaneUI } from './ui/TweakpaneUI';
import { FisheyeInset } from './ui/FisheyeInset';
import { XRControllers } from './xr/XRControllers';
import { createUploadUI } from './share/shareUI';
import type { AppState, CameraMode, ProjectionMode } from './types';

const shareIdMatch = window.location.pathname.match(/^\/v\/([a-zA-Z0-9_-]+)$/);
const shareId = shareIdMatch ? shareIdMatch[1] : null;
const viewerMode = shareId !== null;

const canvas = document.createElement('canvas');
canvas.id = 'view';
document.querySelector<HTMLDivElement>('#app')!.appendChild(canvas);

const defaultPixelRatio = () => Math.min(window.devicePixelRatio || 1, 2);

const renderer = new WebGPURenderer({ canvas, antialias: false, forceWebGL: true });
renderer.xr.enabled = true;
await renderer.init();

const vrBtn = VRButton.createButton(renderer as unknown as THREE.WebGLRenderer);
vrBtn.style.zIndex = '20';
document.body.appendChild(vrBtn);

const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.05, 1000);
const cameraController = new CameraController(camera, canvas);

const CUBE_RES = 1024;
const domeCubeRT = new CubeRenderTarget(CUBE_RES, {
  generateMipmaps: false,
});
const domeCubeCamera = new THREE.CubeCamera(0.05, 2000, domeCubeRT);
domeCubeCamera.position.set(0, 0, 0);

const domeCubeTex = domeCubeRT.texture as unknown as THREE.CubeTexture;
const domeMaterial = new DomeMaterial(domeCubeTex);
const dome = new DomeScene(domeMaterial);
dome.outerScene.add(domeCubeCamera);

// True while a loaded video/image texture is sampled directly by the dome
// material. In that state the cube render target is unread, so skipping the
// bake removes a 6×CUBE_RES² pass from every frame.
let directSourceActive = false;

const fisheye = new FisheyeInset(domeCubeTex);

const xrDolly = new THREE.Group();
xrDolly.position.set(0, 0, 0);
dome.outerScene.add(xrDolly);
xrDolly.add(camera);

const bus = new AudioBus();

const state: AppState = {
  cameraMode: 'first-person',
  projectionMode: 'fulldome',
  showFisheyeInset: true,
  performancePreview: false,
  domeRadius: DOME_RADIUS,
  fov: 60,
  firstPersonHeight: 1.6,
};

cameraController.setHeight(state.firstPersonHeight);

let ui: TweakpaneUI | null = null;
let domeMaterialDirect: DomeMaterialEquirect | DomeMaterialFisheye | null = null;
let autoPerformancePreview = false;
let autoDisabledFisheye = false;
let sourceHudBase = 'Source: (none)';
let sourceHudStats = '';
let sourceHudWarn = false;

function syncRendererSize() {
  renderer.setPixelRatio(state.performancePreview ? 1 : defaultPixelRatio());
  renderer.setSize(window.innerWidth, window.innerHeight);
}

syncRendererSize();

function setPerformancePreview(on: boolean, auto = false) {
  autoPerformancePreview = auto ? on : false;
  state.performancePreview = on;
  if (on && state.showFisheyeInset) {
    state.showFisheyeInset = false;
    autoDisabledFisheye = auto;
  } else if (!on && autoDisabledFisheye) {
    state.showFisheyeInset = true;
    autoDisabledFisheye = false;
  } else if (!auto) {
    autoDisabledFisheye = false;
  }
  syncRendererSize();
  ui?.pane.refresh();
}

function updateSourceHud() {
  sourceResLabel.textContent = sourceHudStats ? `${sourceHudBase}\n${sourceHudStats}` : sourceHudBase;
  sourceResLabel.classList.toggle('source-resolution-hud-warn', sourceHudWarn);
}

function setDirectSource(source: Video360Source | null) {
  domeMaterialDirect?.dispose();
  domeMaterialDirect = null;
  sourceHudStats = '';
  sourceHudWarn = false;

  if (source) {
    domeMaterialDirect = source.projection === 'fisheye'
      ? new DomeMaterialFisheye(source.texture)
      : new DomeMaterialEquirect(source.texture);
    domeMaterialDirect.setProjectionMode(state.projectionMode);
    dome.dome.material = domeMaterialDirect;
    fisheye.setSource(source.texture, source.projection);
    directSourceActive = true;
    if (source.highRes) {
      setPerformancePreview(true, true);
    } else if (autoPerformancePreview) {
      setPerformancePreview(false, true);
    }
  } else {
    dome.dome.material = domeMaterial;
    fisheye.setSource(null, null);
    directSourceActive = false;
    if (autoPerformancePreview) setPerformancePreview(false, true);
  }
  updateSourceHud();
}

const sourceResLabel = document.createElement('div');
sourceResLabel.className = 'source-resolution-hud';
sourceResLabel.textContent = 'Source: (none)';
document.body.appendChild(sourceResLabel);

const template = new Video360Template();
template.setViewerMode(viewerMode);
template.onSourceChange = (source) => setDirectSource(source);
template.onSourceResolutionChange = (label) => {
  sourceHudBase = `Source: ${label}`;
  updateSourceHud();
};
template.onPlaybackStatsChange = (stats: Video360PlaybackStats | null) => {
  if (!stats || stats.totalVideoFrames === 0) {
    sourceHudStats = '';
    sourceHudWarn = false;
    updateSourceHud();
    return;
  }
  const pct = Math.round(stats.dropRate * 100);
  const decode = stats.processingDurationMs === null ? 'n/a' : `${stats.processingDurationMs.toFixed(1)}ms`;
  sourceHudStats = `Dropped: ${stats.droppedVideoFrames}/${stats.totalVideoFrames} (${pct}%) · decode ${decode}`;
  sourceHudWarn = stats.dropRate > 0.05 || stats.droppedThisInterval > 5;
  updateSourceHud();
};
template.init(dome.templateScene, bus);

function setProjectionMode(m: ProjectionMode) {
  state.projectionMode = m;
  domeMaterial.setProjectionMode(m);
  domeMaterialDirect?.setProjectionMode(m);
  fisheye.setProjectionMode(m);
}

const presets: Record<1 | 2, { pos: THREE.Vector3; target: THREE.Vector3 } | null> = { 1: null, 2: null };

ui = new TweakpaneUI(state, {
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
  onProjectionModeChange: (m) => setProjectionMode(m),
  onPerformancePreviewChange: (on) => setPerformancePreview(on),
  onFirstPersonHeightChange: (h) => cameraController.setHeight(h),
  onDomeRadiusChange: (r) => {
    state.domeRadius = r;
    dome.setRadius(r);
    cameraController.setDomeRadius(r);
  },
});
ui.bindTemplateParams(template);

if (!viewerMode) {
  let uploadPausedFile: File | null = null;
  let resumeAfterUpload = false;
  const uploadUI = createUploadUI({
    onUploadStart: (file) => {
      if (template.currentFile !== file) return;
      uploadPausedFile = file;
      resumeAfterUpload = template.pauseForExternalWork();
      ui?.pane.refresh();
    },
    onUploadEnd: (file) => {
      if (uploadPausedFile === file && resumeAfterUpload && template.currentFile === file) {
        template.setPlaybackEnabled(true);
      }
      uploadPausedFile = null;
      resumeAfterUpload = false;
      ui?.pane.refresh();
    },
  });
  // Auto-upload was contending with playback (same File read by uploader and
  // <video> simultaneously). Make sharing explicit so previewing stays smooth.
  const shareBtn = document.createElement('button');
  shareBtn.className = 'share-button';
  shareBtn.textContent = 'Share';
  shareBtn.style.display = 'none';
  document.body.appendChild(shareBtn);

  template.onFileLoaded = () => { shareBtn.style.display = ''; };
  template.onCleared = () => { shareBtn.style.display = 'none'; };
  shareBtn.addEventListener('click', () => {
    if (!template.currentFile) return;
    shareBtn.style.display = 'none';
    uploadUI.startUpload(template.currentFile);
  });
}

setProjectionMode(state.projectionMode);
cameraController.setMode(state.cameraMode);

const xrControllers = new XRControllers(renderer, {
  onCameraModeChange: (m) => {
    cameraController.setMode(m);
    state.cameraMode = m;
    ui?.pane.refresh();
  },
});
dome.outerScene.add(xrControllers.group);

if (viewerMode && shareId) {
  fetch(`/api/resolve?id=${encodeURIComponent(shareId)}`)
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`resolve ${r.status}`))))
    .then((data: { url: string; kind: 'video' | 'image' }) => {
      template.loadFromUrl(data.url, data.kind);
    })
    .catch(() => {
      const el = document.createElement('div');
      el.className = 'viewer-missing';
      el.textContent = 'Video not found or expired.';
      document.body.appendChild(el);
    });
}

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
  const t = ev.target as HTMLElement | null;
  if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
  if (ev.key === 'c' || ev.key === 'C') {
    const next = CAM_MODES[(CAM_MODES.indexOf(state.cameraMode) + 1) % CAM_MODES.length];
    cameraController.setMode(next);
    state.cameraMode = next;
    ui?.pane.refresh();
  } else if (ev.key === 'p' || ev.key === 'P') {
    const next: ProjectionMode = state.projectionMode === 'hemisphere' ? 'fulldome' : 'hemisphere';
    setProjectionMode(next);
    ui?.pane.refresh();
  } else if (ev.key === 'x' || ev.key === 'X') {
    if (!viewerMode) {
      template.clear();
      ui?.pane.refresh();
    }
  }
});

function updateAudioListener() {
  const l = bus.context.listener;
  const p = camera.position;
  if (l.positionX) {
    l.positionX.value = p.x; l.positionY.value = p.y; l.positionZ.value = p.z;
  } else {
    (l as unknown as { setPosition: (x: number, y: number, z: number) => void }).setPosition?.(p.x, p.y, p.z);
  }
  listenerForward.set(0, 0, -1).applyQuaternion(camera.quaternion);
  listenerUp.set(0, 1, 0).applyQuaternion(camera.quaternion);
  if (l.forwardX) {
    l.forwardX.value = listenerForward.x; l.forwardY.value = listenerForward.y; l.forwardZ.value = listenerForward.z;
    l.upX.value = listenerUp.x; l.upY.value = listenerUp.y; l.upZ.value = listenerUp.z;
  } else {
    (l as unknown as { setOrientation: (fx: number, fy: number, fz: number, ux: number, uy: number, uz: number) => void })
      .setOrientation?.(listenerForward.x, listenerForward.y, listenerForward.z, listenerUp.x, listenerUp.y, listenerUp.z);
  }
}

window.addEventListener('resize', () => {
  syncRendererSize();
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
});

const listenerForward = new THREE.Vector3();
const listenerUp = new THREE.Vector3();
const FISHEYE_PERF_INTERVAL = 0.1;
let lastFisheyeRenderTime = -Infinity;
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
  template.update(dt, time);
  updateAudioListener();

  if (!directSourceActive) {
    domeCubeCamera.update(renderer as unknown as THREE.WebGLRenderer, dome.templateScene);
  }

  renderer.render(dome.outerScene, camera);

  const wantsFisheye = !inXR && state.showFisheyeInset;
  if (wantsFisheye) {
    fisheye.setVisible(true);
    if (!state.performancePreview || time - lastFisheyeRenderTime >= FISHEYE_PERF_INTERVAL) {
      fisheye.render(renderer as unknown as THREE.WebGLRenderer);
      lastFisheyeRenderTime = time;
    }
  } else {
    fisheye.setVisible(false);
    lastFisheyeRenderTime = -Infinity;
  }
}
renderer.setAnimationLoop(tick);
