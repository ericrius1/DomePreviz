import type { AudioBusLike } from '../../types';

export class MusicVizAudio {
  private nodes: AudioNode[] = [];
  private oscs: OscillatorNode[] = [];
  private kickTimer: number | null = null;
  private patternTimer: number | null = null;

  constructor(bus: AudioBusLike) {
    const ctx = bus.context;

    const padNotes = [130.8, 164.8, 196.0, 246.9];
    padNotes.forEach((f) => {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 900;
      const g = ctx.createGain();
      g.gain.value = 0.025;
      o.connect(filter).connect(g);
      bus.speakers.forEach((sp) => g.connect(sp.input()));
      o.start();
      this.oscs.push(o);
      this.nodes.push(filter, g);
    });

    const lead = ctx.createOscillator();
    lead.type = 'sine';
    lead.frequency.value = 523.3;
    const leadGain = ctx.createGain();
    leadGain.gain.value = 0.05;
    lead.connect(leadGain);
    bus.speakers.forEach((sp) => leadGain.connect(sp.input()));
    lead.start();
    this.oscs.push(lead);
    this.nodes.push(leadGain);

    const notes = [523.3, 659.3, 784.0, 659.3];
    let idx = 0;
    this.patternTimer = window.setInterval(() => {
      lead.frequency.setTargetAtTime(notes[idx % notes.length], ctx.currentTime, 0.02);
      idx++;
    }, 500);

    this.kickTimer = window.setInterval(() => {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      osc.frequency.setValueAtTime(120, now);
      osc.frequency.exponentialRampToValueAtTime(40, now + 0.15);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.6, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
      osc.connect(g);
      bus.speakers.forEach((sp, i) => {
        const s = ctx.createGain();
        s.gain.value = i === 0 ? 1.0 : 0.5;
        g.connect(s).connect(sp.input());
      });
      osc.start(now);
      osc.stop(now + 0.25);
    }, 500);
  }

  dispose() {
    this.oscs.forEach((o) => { try { o.stop(); } catch { /* noop */ } o.disconnect(); });
    this.nodes.forEach((n) => { try { n.disconnect(); } catch { /* noop */ } });
    if (this.kickTimer !== null) clearInterval(this.kickTimer);
    if (this.patternTimer !== null) clearInterval(this.patternTimer);
  }
}
