import type { FeatureSnapshot } from './audio/AudioFeatures';

export type CameraMode = 'orbit' | 'first-person' | 'xr-view';
export type ProjectionMode = 'hemisphere' | 'fulldome';
export type Video360SourceProjection = 'equirect' | 'fisheye';

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

export interface TemplateAction {
  label: string;
  run(): void;
}

export interface AppState {
  cameraMode: CameraMode;
  projectionMode: ProjectionMode;
  showFisheyeInset: boolean;
  performancePreview: boolean;
  domeRadius: number;
  fov: number;
  firstPersonHeight: number;
}

export interface TemplateAudio {
  dispose(): void;
}
