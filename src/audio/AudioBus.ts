import { Speaker } from './Speaker';
import { AudioFeatures } from './AudioFeatures';

export class AudioBus {
  context: AudioContext;
  master: GainNode;
  speakers: Speaker[] = [];
  analyser: AnalyserNode;
  features: AudioFeatures;

  constructor() {
    this.context = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    this.master = this.context.createGain();
    this.master.gain.value = 0.8;

    this.analyser = this.context.createAnalyser();
    this.analyser.fftSize = 1024;
    this.analyser.smoothingTimeConstant = 0.6;
    this.master.connect(this.analyser);
    this.analyser.connect(this.context.destination);

    this.features = new AudioFeatures(this.analyser);

    for (let i = 0; i < 5; i++) {
      const azimuth = (i / 5) * Math.PI * 2;
      this.speakers.push(new Speaker(this.context, this.master, azimuth, i));
    }
  }

  update(dt: number) {
    this.features.update(dt);
  }

  async resume() {
    if (this.context.state !== 'running') await this.context.resume();
  }
}
