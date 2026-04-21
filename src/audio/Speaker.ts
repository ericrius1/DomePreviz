import * as THREE from 'three';

export const SPEAKER_RING_RADIUS = 10;

export class Speaker {
  context: AudioContext;
  panner: PannerNode;
  channelGain: GainNode;
  azimuth: number;
  index: number;
  color: number = 0xffffff;

  constructor(context: AudioContext, destination: AudioNode, azimuth: number, index: number) {
    this.context = context;
    this.azimuth = azimuth;
    this.index = index;

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

    const inward = new THREE.Vector3(-x, 0, -z).normalize();
    this.panner.orientationX.value = inward.x;
    this.panner.orientationY.value = inward.y;
    this.panner.orientationZ.value = inward.z;
    this.panner.coneInnerAngle = 60;
    this.panner.coneOuterAngle = 180;
    this.panner.coneOuterGain = 0.4;

    this.channelGain.connect(this.panner).connect(destination);
  }

  setGain(v: number) { this.channelGain.gain.value = v; }
  setMuted(m: boolean) { this.channelGain.gain.value = m ? 0 : 1; }
  input(): AudioNode { return this.channelGain; }

  dispose() { /* noop */ }
}
