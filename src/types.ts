import type * as THREE from 'three';
import type { FeatureSnapshot } from './audio/AudioFeatures';

export type CameraMode = 'orbit' | 'first-person' | 'xr-view';
export type TemplateId = 'planetarium' | 'terrain' | 'aurora' | 'video360';

export interface TweakpaneSchema {
  [key: string]: unknown;
}

export interface AudioBusLike {
  context: AudioContext;
  master: GainNode;
  analyser: AnalyserNode;
  features: FeatureSnapshot;
  speakers: { input(): AudioNode; index: number; color: number }[];
}

export interface Template {
  id: TemplateId;
  init(scene: THREE.Scene, bus: AudioBusLike): void;
  update(dt: number, time: number): void;
  dispose(): void;
  getParams(): TweakpaneSchema;
}

export type CubeResolution = 256 | 512 | 1024 | 2048;

export interface AppState {
  cameraMode: CameraMode;
  templateId: TemplateId;
  domeOpacity: number;
  showFisheyeInset: boolean;
  domeCubeResolution: CubeResolution;
  fov: number;
}

export interface TemplateAudio {
  dispose(): void;
}
