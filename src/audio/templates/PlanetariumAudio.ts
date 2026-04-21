import type { AudioBusLike } from '../../types';

export class PlanetariumAudio {
  private oscillators: OscillatorNode[] = [];
  private gains: GainNode[] = [];
  private lfos: OscillatorNode[] = [];

  constructor(bus: AudioBusLike) {
    const baseFreqs = [65.4, 82.4, 98.0, 130.8, 164.8];
    for (let i = 0; i < bus.speakers.length; i++) {
      const ctx = bus.context;
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = baseFreqs[i] + (i - 2) * 0.3;

      const gain = ctx.createGain();
      gain.gain.value = 0.08;

      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.07 + i * 0.013;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 0.04;
      lfo.connect(lfoGain).connect(gain.gain);

      osc.connect(gain).connect(bus.speakers[i].input());
      osc.start();
      lfo.start();

      this.oscillators.push(osc);
      this.gains.push(gain);
      this.lfos.push(lfo);
    }
  }

  dispose() {
    this.oscillators.forEach((o) => { try { o.stop(); } catch { /* already stopped */ } o.disconnect(); });
    this.lfos.forEach((o) => { try { o.stop(); } catch { /* already stopped */ } o.disconnect(); });
    this.gains.forEach((g) => g.disconnect());
  }
}
