import type { AudioBusLike } from '../../types';

export class Video360Audio {
  private source: MediaElementAudioSourceNode | null = null;
  private sourceVideo: HTMLVideoElement | null = null;
  private gain: GainNode | null = null;

  constructor(private bus: AudioBusLike) {}

  attachVideo(video: HTMLVideoElement) {
    this.disconnectGraph();
    const ctx = this.bus.context;
    try {
      if (!this.source || this.sourceVideo !== video) {
        this.source = ctx.createMediaElementSource(video);
        this.sourceVideo = video;
      }
      this.gain = ctx.createGain();
      this.gain.gain.value = 0.9;
      this.source.connect(this.gain);
      this.bus.speakers.forEach((sp) => this.gain!.connect(sp.input()));
    } catch (e) {
      console.warn('Video360Audio: could not attach', e);
    }
  }

  private disconnectGraph() {
    this.source?.disconnect();
    this.gain?.disconnect();
    this.gain = null;
  }

  detach() {
    this.disconnectGraph();
  }

  dispose() {
    this.disconnectGraph();
    this.source = null;
    this.sourceVideo = null;
  }
}
