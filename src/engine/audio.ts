export type AudioMode = "mic" | "file" | "demo" | null;

export interface AudioLevels {
  bass: number;
  mid: number;
  treble: number;
  beat: number;
}

export class AudioEngine {
  private viz: HTMLCanvasElement;
  private vctx: CanvasRenderingContext2D;
  private onLevels: (l: AudioLevels) => void;
  private onState: (mode: AudioMode, label: string) => void;

  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private data: Uint8Array | null = null;
  private mode: AudioMode = null;
  private cleanupFns: (() => void)[] = [];
  private demoTimer: ReturnType<typeof setInterval> | null = null;

  private levels: AudioLevels = { bass: 0, mid: 0, treble: 0, beat: 0 };
  private prevEnergy = 0;
  private rafId = 0;
  private peaks: Float32Array = new Float32Array(64);
  private t0 = performance.now();

  constructor(
    viz: HTMLCanvasElement,
    onLevels: (l: AudioLevels) => void,
    onState: (mode: AudioMode, label: string) => void,
  ) {
    this.viz = viz;
    this.vctx = viz.getContext("2d")!;
    this.onLevels = onLevels;
    this.onState = onState;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    viz.width = 260 * dpr;
    viz.height = 52 * dpr;
    this.vctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.rafId = requestAnimationFrame(() => this.frame());
  }

  dispose() {
    cancelAnimationFrame(this.rafId);
    this.stop();
  }

  stop() {
    if (this.demoTimer) { clearInterval(this.demoTimer); this.demoTimer = null; }
    this.cleanupFns.forEach((f) => { try { f(); } catch { /* noop */ } });
    this.cleanupFns = [];
    if (this.ctx) { try { this.ctx.close(); } catch { /* noop */ } this.ctx = null; }
    this.analyser = null;
    this.data = null;
    this.mode = null;
    this.levels = { bass: 0, mid: 0, treble: 0, beat: 0 };
    this.onLevels(this.levels);
  }

  private makeAnalyser() {
    const a = this.ctx!.createAnalyser();
    a.fftSize = 512;
    a.smoothingTimeConstant = 0.72;
    this.analyser = a;
    this.data = new Uint8Array(a.frequencyBinCount);
  }

  async startMic() {
    this.stop();
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    this.ctx = new AC();
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const src = this.ctx.createMediaStreamSource(stream);
    this.makeAnalyser();
    src.connect(this.analyser!);
    this.cleanupFns.push(() => stream.getTracks().forEach((t) => t.stop()));
    this.mode = "mic";
    this.onState("mic", "AUDIO · MIC LIVE");
  }

  async startFile(file: File) {
    this.stop();
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    this.ctx = new AC();
    const buf = await file.arrayBuffer();
    const audio = await this.ctx.decodeAudioData(buf);
    const src = this.ctx.createBufferSource();
    src.buffer = audio;
    src.loop = true;
    this.makeAnalyser();
    src.connect(this.analyser!);
    this.analyser!.connect(this.ctx.destination);
    src.start();
    this.cleanupFns.push(() => { try { src.stop(); } catch { /* noop */ } });
    this.mode = "file";
    this.onState("file", "AUDIO · " + file.name.slice(0, 22).toUpperCase());
  }

  /* generative demo groove — kick / hats / bass / pad */
  startDemo() {
    this.stop();
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    const ctx: AudioContext = new AC();
    this.ctx = ctx;
    this.makeAnalyser();

    const master = ctx.createGain();
    master.gain.value = 0.85;
    const comp = ctx.createDynamicsCompressor();
    master.connect(comp);
    comp.connect(this.analyser!);
    this.analyser!.connect(ctx.destination);

    const noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.3, ctx.sampleRate);
    const nd = noiseBuf.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;

    const kick = (t: number) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.setValueAtTime(165, t);
      o.frequency.exponentialRampToValueAtTime(42, t + 0.11);
      g.gain.setValueAtTime(1.0, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
      o.connect(g); g.connect(master);
      o.start(t); o.stop(t + 0.25);
    };
    const hat = (t: number, vel: number) => {
      const s = ctx.createBufferSource();
      s.buffer = noiseBuf;
      const f = ctx.createBiquadFilter();
      f.type = "highpass"; f.frequency.value = 6800;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.32 * vel, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
      s.connect(f); f.connect(g); g.connect(master);
      s.start(t); s.stop(t + 0.08);
    };
    const BASS = [55, 55, 0, 55, 65.4, 0, 49, 55, 55, 0, 55, 82.4, 0, 73.4, 65.4, 0];
    const bass = (t: number, freq: number) => {
      const o = ctx.createOscillator();
      o.type = "sawtooth";
      o.frequency.value = freq;
      const f = ctx.createBiquadFilter();
      f.type = "lowpass"; f.frequency.value = 320; f.Q.value = 6;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.5, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.19);
      o.connect(f); f.connect(g); g.connect(master);
      o.start(t); o.stop(t + 0.22);
    };
    const padChord = (t: number) => {
      [220, 261.6, 329.6].forEach((fr, i) => {
        const o = ctx.createOscillator();
        o.type = "triangle";
        o.frequency.value = fr;
        o.detune.value = (i - 1) * 7;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(0.055, t + 0.8);
        g.gain.linearRampToValueAtTime(0.0001, t + 3.4);
        o.connect(g); g.connect(master);
        o.start(t); o.stop(t + 3.5);
      });
    };

    const BPM = 112;
    const stepDur = 60 / BPM / 4;
    let step = 0;
    let nextT = ctx.currentTime + 0.06;
    this.demoTimer = setInterval(() => {
      while (nextT < ctx.currentTime + 0.14) {
        const s = step % 16;
        if (s % 4 === 0) kick(nextT);
        if (s % 4 === 2) hat(nextT, s === 14 ? 1 : 0.65);
        if (BASS[s]) bass(nextT, BASS[s]);
        if (step % 64 === 0) padChord(nextT);
        step++;
        nextT += stepDur;
      }
    }, 30);

    this.cleanupFns.push(() => { if (this.demoTimer) clearInterval(this.demoTimer); });
    this.mode = "demo";
    this.onState("demo", "AUDIO · DEMO GROOVE");
  }

  /* per-frame analysis + viz */
  private frame() {
    this.rafId = requestAnimationFrame(() => this.frame());
    const W = 260, H = 52;
    const ctx = this.vctx;

    if (this.analyser && this.data && this.mode) {
      this.analyser.getByteFrequencyData(this.data as Uint8Array<ArrayBuffer>);
      const bins = this.data.length;
      const bassEnd = Math.floor(bins * 0.12);
      const midEnd = Math.floor(bins * 0.45);
      let bs = 0, ms = 0, ts = 0;
      for (let i = 0; i < bins; i++) {
        const v = this.data[i];
        if (i < bassEnd) bs += v;
        else if (i < midEnd) ms += v;
        else ts += v;
      }
      const bass = bs / (bassEnd * 255);
      const mid = ms / ((midEnd - bassEnd) * 255);
      const treble = ts / ((bins - midEnd) * 255);
      const energy = bass * 0.7 + mid * 0.2 + treble * 0.1;
      let beat = this.levels.beat * 0.85;
      if (energy > this.prevEnergy * 1.4 && energy > 0.28) beat = 1;
      this.prevEnergy = energy;
      this.levels = { bass, mid, treble, beat };

      /* spectrum */
      ctx.clearRect(0, 0, W, H);
      const bars = 64;
      const per = Math.floor(bins / bars);
      const bw = W / bars;
      for (let i = 0; i < bars; i++) {
        let sum = 0;
        for (let k = 0; k < per; k++) sum += this.data[i * per + k];
        const v = sum / (per * 255);
        const h = Math.max(1.5, v * (H - 8));
        const hue = 187 + (i / bars) * 130;
        ctx.fillStyle = `hsla(${hue}, 90%, ${58 + v * 20}%, ${0.55 + v * 0.45})`;
        ctx.fillRect(i * bw + 0.5, H - 2 - h, Math.max(1, bw - 1.6), h);
        this.peaks[i] = Math.max(this.peaks[i] - 0.012, v);
        ctx.fillStyle = "rgba(240,250,255,0.75)";
        ctx.fillRect(i * bw + 0.5, H - 2 - Math.max(1.5, this.peaks[i] * (H - 8)) - 2, Math.max(1, bw - 1.6), 1.5);
      }
    } else {
      /* idle wave */
      const t = (performance.now() - this.t0) / 1000;
      ctx.clearRect(0, 0, W, H);
      ctx.beginPath();
      for (let x = 0; x <= W; x += 3) {
        const y = H / 2 +
          Math.sin(x * 0.045 + t * 1.4) * 3.2 +
          Math.sin(x * 0.11 - t * 0.9) * 1.6;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = "rgba(110,231,255,0.22)";
      ctx.lineWidth = 1;
      ctx.stroke();
      this.levels = { bass: 0, mid: 0, treble: 0, beat: 0 };
    }
    this.onLevels(this.levels);
  }
}
