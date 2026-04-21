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
