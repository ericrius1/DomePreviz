import { Speaker } from './Speaker';

export class AudioBus {
  context: AudioContext;
  master: GainNode;
  speakers: Speaker[] = [];
  analyser: AnalyserNode;

  constructor() {
    this.context = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
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
