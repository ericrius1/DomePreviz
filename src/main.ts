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
