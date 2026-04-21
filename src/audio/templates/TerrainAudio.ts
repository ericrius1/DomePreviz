import type { AudioBusLike } from '../../types';

export class TerrainAudio {
  private sources: AudioBufferSourceNode[] = [];
  private gains: GainNode[] = [];
  private filters: BiquadFilterNode[] = [];
  private lfos: OscillatorNode[] = [];
  private noiseBuffer: AudioBuffer;

  constructor(bus: AudioBusLike) {
    const ctx = bus.context;
    const bufferLen = ctx.sampleRate * 2;
    this.noiseBuffer = ctx.createBuffer(1, bufferLen, ctx.sampleRate);
    const data = this.noiseBuffer.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < bufferLen; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99765 * b0 + white * 0.0990460;
      b1 = 0.96300 * b1 + white * 0.2965164;
      b2 = 0.57000 * b2 + white * 1.0526913;
      data[i] = (b0 + b1 + b2 + white * 0.1848) * 0.25;
    }

    for (let i = 0; i < bus.speakers.length; i++) {
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      src.loop = true;

      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 400 + i * 150;
      filter.Q.value = 0.8;

      const gain = ctx.createGain();
      gain.gain.value = 0.08;

      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.1 + i * 0.04;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 0.05;
      lfo.connect(lfoGain).connect(gain.gain);

      src.connect(filter).connect(gain).connect(bus.speakers[i].input());
      src.start();
      lfo.start();

      this.sources.push(src);
      this.gains.push(gain);
      this.filters.push(filter);
      this.lfos.push(lfo);
    }
  }

  dispose() {
    this.sources.forEach((s) => { try { s.stop(); } catch { /* noop */ } s.disconnect(); });
    this.lfos.forEach((o) => { try { o.stop(); } catch { /* noop */ } o.disconnect(); });
    this.filters.forEach((f) => f.disconnect());
    this.gains.forEach((g) => g.disconnect());
  }
}
