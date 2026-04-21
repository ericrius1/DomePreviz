import './style.css';
import * as THREE from 'three';
import { DomeScene, EYE_HEIGHT } from './app/DomeScene';
import { DomeProjection } from './app/DomeProjection';
import { CameraController } from './app/CameraController';
import { createTemplate } from './templates/registry';
import type { AudioBusLike, Template, TemplateId } from './types';

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

const audioContext = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
const placeholderMaster = audioContext.createGain();
const placeholderAnalyser = audioContext.createAnalyser();
placeholderMaster.connect(placeholderAnalyser);
const bus: AudioBusLike = {
  context: audioContext,
  master: placeholderMaster,
  analyser: placeholderAnalyser,
  speakers: [],
};

let current: Template | null = null;
function setTemplate(id: TemplateId) {
  if (current) current.dispose();
  while (dome.templateScene.children.length) dome.templateScene.remove(dome.templateScene.children[0]);
  current = createTemplate(id);
  current.init(dome.templateScene, bus);
}
setTemplate('planetarium');

// Dev-mode: 1 = orbit, 2 = first-person. Will be replaced by Tweakpane in Task 11.
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

void EYE_HEIGHT;
