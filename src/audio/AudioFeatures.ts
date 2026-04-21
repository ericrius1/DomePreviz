export interface FeatureSnapshot {
  sub: number;
  bass: number;
  lowMid: number;
  mid: number;
  highMid: number;
  treble: number;
  air: number;
  rms: number;
  flux: number;
  centroid: number;
  bassEnv: number;
  trebleEnv: number;
  onset: boolean;
}

const BANDS: Array<{ key: keyof Omit<FeatureSnapshot, 'rms' | 'flux' | 'centroid' | 'bassEnv' | 'trebleEnv' | 'onset'>; lo: number; hi: number }> = [
  { key: 'sub', lo: 20, hi: 60 },
  { key: 'bass', lo: 60, hi: 250 },
  { key: 'lowMid', lo: 250, hi: 500 },
  { key: 'mid', lo: 500, hi: 2000 },
  { key: 'highMid', lo: 2000, hi: 4000 },
  { key: 'treble', lo: 4000, hi: 8000 },
  { key: 'air', lo: 8000, hi: 20000 },
];

export class AudioFeatures implements FeatureSnapshot {
  fft: Uint8Array<ArrayBuffer>;
  wave: Uint8Array<ArrayBuffer>;

  sub = 0; bass = 0; lowMid = 0; mid = 0; highMid = 0; treble = 0; air = 0;
  rms = 0; flux = 0; centroid = 0;
  bassEnv = 0; trebleEnv = 0;
  onset = false;

  private analyser: AnalyserNode;
  private sampleRate: number;
  private binHz: number;
  private prevFft: Float32Array;
  private bandRanges: Array<{ start: number; end: number }>;
  private fluxBaseline = 0;
  private onsetCooldown = 0;

  constructor(analyser: AnalyserNode) {
    this.analyser = analyser;
    this.sampleRate = analyser.context.sampleRate;
    const bins = analyser.frequencyBinCount;
    this.binHz = this.sampleRate / (bins * 2);
    this.fft = new Uint8Array(bins);
    this.wave = new Uint8Array(bins);
    this.prevFft = new Float32Array(bins);
    this.bandRanges = BANDS.map((b) => ({
      start: Math.max(0, Math.floor(b.lo / this.binHz)),
      end: Math.min(bins - 1, Math.ceil(b.hi / this.binHz)),
    }));
  }

  update(dt: number): void {
    this.analyser.getByteFrequencyData(this.fft);
    this.analyser.getByteTimeDomainData(this.wave);

    let bandIdx = 0;
    for (const b of BANDS) {
      const { start, end } = this.bandRanges[bandIdx++];
      let s = 0;
      for (let i = start; i <= end; i++) s += this.fft[i];
      const n = Math.max(1, end - start + 1);
      (this as unknown as Record<string, number>)[b.key] = s / (n * 255);
    }

    let sumSq = 0;
    for (let i = 0; i < this.wave.length; i++) {
      const v = (this.wave[i] - 128) / 128;
      sumSq += v * v;
    }
    this.rms = Math.sqrt(sumSq / this.wave.length);

    let flux = 0;
    let weightedSum = 0;
    let totalSum = 0;
    for (let i = 0; i < this.fft.length; i++) {
      const cur = this.fft[i] / 255;
      const diff = Math.max(0, cur - this.prevFft[i]);
      flux += diff;
      this.prevFft[i] = cur;
      weightedSum += i * cur;
      totalSum += cur;
    }
    this.flux = flux / this.fft.length;
    this.centroid = totalSum > 0 ? (weightedSum / totalSum) / this.fft.length : 0;

    const envAlpha = 1 - Math.exp(-dt / 0.15);
    this.bassEnv += (this.bass - this.bassEnv) * envAlpha;
    this.trebleEnv += (this.treble - this.trebleEnv) * envAlpha;

    this.fluxBaseline = this.fluxBaseline * 0.95 + this.flux * 0.05;
    this.onsetCooldown = Math.max(0, this.onsetCooldown - dt);
    this.onset = false;
    if (this.onsetCooldown === 0 && this.flux > this.fluxBaseline * 1.6 + 0.02) {
      this.onset = true;
      this.onsetCooldown = 0.12;
    }
  }
}
