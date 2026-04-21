import type { AudioBusLike } from '../../types';

interface ScaleSet {
  name: string;
  intervals: number[];
}

const SCALES: ScaleSet[] = [
  { name: 'minor pent', intervals: [0, 3, 5, 7, 10] },
  { name: 'major pent', intervals: [0, 2, 4, 7, 9] },
  { name: 'dorian',     intervals: [0, 2, 3, 5, 7, 9, 10] },
  { name: 'lydian',     intervals: [0, 2, 4, 6, 7, 9, 11] },
  { name: 'aeolian',    intervals: [0, 2, 3, 5, 7, 8, 10] },
];

function midiToHz(m: number) { return 440 * Math.pow(2, (m - 69) / 12); }

export class AmbientEngine {
  private ctx: AudioContext;
  private bus: AudioBusLike;
  private master: GainNode;
  private disposed = false;

  private padOscs: OscillatorNode[] = [];
  private padFilters: BiquadFilterNode[] = [];
  private padLFOs: OscillatorNode[] = [];

  private droneOsc: OscillatorNode;
  private droneFM: OscillatorNode;
  private droneFMGain: GainNode;
  private droneGain: GainNode;

  private scheduleTimer: number;
  private nextChordAt = 0;
  private nextBellAt = 0;
  private nextShimmerAt = 0;
  private rootMidi = 48;
  private scaleIdx = 0;

  constructor(bus: AudioBusLike) {
    this.bus = bus;
    this.ctx = bus.context;

    this.master = this.ctx.createGain();
    this.master.gain.value = 0.0;
    this.master.gain.setTargetAtTime(0.85, this.ctx.currentTime, 1.5);
    bus.speakers.forEach((sp) => this.master.connect(sp.input()));

    this.buildPad();
    ({ osc: this.droneOsc, fm: this.droneFM, fmGain: this.droneFMGain, gain: this.droneGain } = this.buildDrone());

    this.nextChordAt = this.ctx.currentTime + 0.1;
    this.nextBellAt = this.ctx.currentTime + 3;
    this.nextShimmerAt = this.ctx.currentTime + 8;

    this.scheduleTimer = window.setInterval(() => this.schedule(), 500);
  }

  private buildPad() {
    const voices = 5;
    const padGain = this.ctx.createGain();
    padGain.gain.value = 0.16;
    padGain.connect(this.master);

    const sharedFilter = this.ctx.createBiquadFilter();
    sharedFilter.type = 'lowpass';
    sharedFilter.frequency.value = 700;
    sharedFilter.Q.value = 1.2;
    sharedFilter.connect(padGain);

    const filterLFO = this.ctx.createOscillator();
    filterLFO.type = 'sine';
    filterLFO.frequency.value = 0.04;
    const filterLFOGain = this.ctx.createGain();
    filterLFOGain.gain.value = 400;
    filterLFO.connect(filterLFOGain).connect(sharedFilter.frequency);
    filterLFO.start();
    this.padLFOs.push(filterLFO);

    for (let i = 0; i < voices; i++) {
      const o = this.ctx.createOscillator();
      o.type = i === 0 ? 'triangle' : 'sawtooth';
      o.frequency.value = 110;
      const vGain = this.ctx.createGain();
      vGain.gain.value = 0.18;

      const detuneLFO = this.ctx.createOscillator();
      detuneLFO.type = 'sine';
      detuneLFO.frequency.value = 0.07 + i * 0.023;
      const detuneGain = this.ctx.createGain();
      detuneGain.gain.value = 6 + i * 2;
      detuneLFO.connect(detuneGain).connect(o.detune);
      detuneLFO.start();

      o.connect(vGain).connect(sharedFilter);
      o.start();

      this.padOscs.push(o);
      this.padLFOs.push(detuneLFO);
    }

    this.padFilters.push(sharedFilter);
  }

  private buildDrone() {
    const gain = this.ctx.createGain();
    gain.gain.value = 0.22;
    gain.connect(this.master);

    const lpf = this.ctx.createBiquadFilter();
    lpf.type = 'lowpass';
    lpf.frequency.value = 220;
    lpf.Q.value = 0.7;
    lpf.connect(gain);

    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = midiToHz(this.rootMidi - 12);

    const fm = this.ctx.createOscillator();
    fm.type = 'sine';
    fm.frequency.value = midiToHz(this.rootMidi - 12) * 0.5;
    const fmGain = this.ctx.createGain();
    fmGain.gain.value = 3;
    fm.connect(fmGain).connect(osc.frequency);

    const ampLFO = this.ctx.createOscillator();
    ampLFO.type = 'sine';
    ampLFO.frequency.value = 0.08;
    const ampLFOGain = this.ctx.createGain();
    ampLFOGain.gain.value = 0.08;
    ampLFO.connect(ampLFOGain).connect(gain.gain);
    ampLFO.start();
    this.padLFOs.push(ampLFO);

    osc.connect(lpf);
    osc.start();
    fm.start();

    return { osc, fm, fmGain, gain };
  }

  private currentScale(): number[] { return SCALES[this.scaleIdx].intervals; }

  private schedule() {
    if (this.disposed) return;
    const now = this.ctx.currentTime;

    while (this.nextChordAt < now + 2) {
      this.emitChord(this.nextChordAt);
      this.nextChordAt += 14 + Math.random() * 12;
    }

    while (this.nextBellAt < now + 2) {
      this.emitBell(this.nextBellAt);
      this.nextBellAt += 2.5 + Math.random() * 5.5;
    }

    while (this.nextShimmerAt < now + 2) {
      this.emitShimmer(this.nextShimmerAt);
      this.nextShimmerAt += 9 + Math.random() * 14;
    }
  }

  private emitChord(when: number) {
    if (Math.random() < 0.4) {
      this.rootMidi = 42 + Math.floor(Math.random() * 12);
      this.scaleIdx = Math.floor(Math.random() * SCALES.length);
    }

    const scale = this.currentScale();
    const targets = [
      midiToHz(this.rootMidi + scale[0]),
      midiToHz(this.rootMidi + 12 + scale[Math.floor(Math.random() * scale.length)]),
      midiToHz(this.rootMidi + 12 + scale[Math.floor(Math.random() * scale.length)]),
      midiToHz(this.rootMidi + 24 + scale[Math.floor(Math.random() * scale.length)]),
      midiToHz(this.rootMidi + 19 + scale[Math.floor(Math.random() * scale.length)]),
    ];

    this.padOscs.forEach((o, i) => {
      o.frequency.setTargetAtTime(targets[i % targets.length], when, 4.0);
    });

    this.droneOsc.frequency.setTargetAtTime(midiToHz(this.rootMidi - 12), when, 3.0);
    this.droneFM.frequency.setTargetAtTime(midiToHz(this.rootMidi - 12) * 0.5, when, 3.0);
  }

  private emitBell(when: number) {
    const scale = this.currentScale();
    const octave = 12 * (Math.random() < 0.5 ? 3 : 4);
    const deg = scale[Math.floor(Math.random() * scale.length)];
    const freq = midiToHz(this.rootMidi + octave + deg);

    const partials = [1, 2.01, 3.04, 4.11];
    const ampEnv = this.ctx.createGain();
    ampEnv.gain.setValueAtTime(0, when);
    ampEnv.gain.linearRampToValueAtTime(0.22, when + 0.01);
    ampEnv.gain.exponentialRampToValueAtTime(0.0001, when + 6);
    ampEnv.connect(this.master);

    partials.forEach((p, idx) => {
      const o = this.ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = freq * p;
      const g = this.ctx.createGain();
      g.gain.value = 1 / (idx + 1);
      o.connect(g).connect(ampEnv);
      o.start(when);
      o.stop(when + 6.2);
    });
  }

  private emitShimmer(when: number) {
    const scale = this.currentScale();
    const base = midiToHz(this.rootMidi + 24 + scale[Math.floor(Math.random() * scale.length)]);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 6;
    filter.frequency.setValueAtTime(base * 2, when);
    filter.frequency.exponentialRampToValueAtTime(base * 6, when + 4);

    const noiseBuf = this.ctx.createBuffer(1, this.ctx.sampleRate * 5, this.ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    src.buffer = noiseBuf;

    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(0.05, when + 1.5);
    g.gain.linearRampToValueAtTime(0, when + 5);

    src.connect(filter).connect(g).connect(this.master);
    src.start(when);
    src.stop(when + 5);
  }

  dispose() {
    this.disposed = true;
    clearInterval(this.scheduleTimer);
    const t = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setTargetAtTime(0, t, 0.5);
    const stopAt = t + 2.5;
    const stop = (o: OscillatorNode) => { try { o.stop(stopAt); } catch { /* noop */ } };
    this.padOscs.forEach(stop);
    this.padLFOs.forEach(stop);
    stop(this.droneOsc);
    stop(this.droneFM);
    setTimeout(() => {
      try { this.master.disconnect(); } catch { /* noop */ }
      try { this.droneGain.disconnect(); } catch { /* noop */ }
      try { this.droneFMGain.disconnect(); } catch { /* noop */ }
      this.padFilters.forEach((f) => { try { f.disconnect(); } catch { /* noop */ } });
    }, 3000);
  }
}
