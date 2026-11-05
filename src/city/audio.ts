/** Engine, tyres, horn, chimes and city ambience, all synthesised. */
export class CityAudio {
  private ctx: AudioContext | null = null;
  private engine: { osc: OscillatorNode; osc2: OscillatorNode; gain: GainNode; filter: BiquadFilterNode } | null = null;
  private skid: { gain: GainNode } | null = null;
  private master!: GainNode;
  private started = false;

  resume(): void {
    if (this.started) return;
    const AC = (window as any).AudioContext ?? (window as any).webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    const c = this.ctx!;
    this.master = c.createGain();
    this.master.gain.value = 0.7;
    this.master.connect(c.destination);
    // Engine: two detuned saws through a lowpass.
    const osc = c.createOscillator();
    osc.type = 'sawtooth';
    const osc2 = c.createOscillator();
    osc2.type = 'square';
    const filter = c.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 400;
    const gain = c.createGain();
    gain.gain.value = 0;
    osc.connect(filter);
    osc2.connect(filter);
    filter.connect(gain).connect(this.master);
    osc.start();
    osc2.start();
    this.engine = { osc, osc2, gain, filter };
    // Tyre skid: filtered noise.
    const buf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1800;
    bp.Q.value = 2;
    const sg = c.createGain();
    sg.gain.value = 0;
    src.connect(bp).connect(sg).connect(this.master);
    src.start();
    this.skid = { gain: sg };
    // Ambience: low city hum.
    const hum = c.createBufferSource();
    hum.buffer = buf;
    hum.loop = true;
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 160;
    const hg = c.createGain();
    hg.gain.value = 0.08;
    hum.connect(lp).connect(hg).connect(this.master);
    hum.start();
    void c.resume();
    this.started = true;
  }

  setEngine(speed01: number, throttle: number, inCar: boolean): void {
    if (!this.engine || !this.ctx) return;
    const t = this.ctx.currentTime;
    const rpm = 40 + speed01 * 160 + throttle * 20;
    this.engine.osc.frequency.setTargetAtTime(rpm, t, 0.05);
    this.engine.osc2.frequency.setTargetAtTime(rpm * 0.5, t, 0.05);
    this.engine.filter.frequency.setTargetAtTime(300 + speed01 * 1400 + throttle * 500, t, 0.05);
    this.engine.gain.gain.setTargetAtTime(inCar ? 0.05 + throttle * 0.05 + speed01 * 0.04 : 0, t, 0.1);
  }

  setSkid(amount: number): void {
    if (!this.skid || !this.ctx) return;
    this.skid.gain.gain.setTargetAtTime(Math.min(0.25, amount * 0.3), this.ctx.currentTime, 0.05);
  }

  horn(on: boolean): void {
    if (!this.ctx) return;
    if (on && !(this as any).__horn) {
      const o = this.ctx.createOscillator();
      o.type = 'square';
      o.frequency.value = 420;
      const o2 = this.ctx.createOscillator();
      o2.type = 'square';
      o2.frequency.value = 520;
      const g = this.ctx.createGain();
      g.gain.value = 0.08;
      o.connect(g);
      o2.connect(g);
      g.connect(this.master);
      o.start();
      o2.start();
      (this as any).__horn = { o, o2, g };
    } else if (!on && (this as any).__horn) {
      const h = (this as any).__horn;
      h.g.gain.setTargetAtTime(0, this.ctx.currentTime, 0.02);
      setTimeout(() => {
        h.o.stop();
        h.o2.stop();
      }, 100);
      (this as any).__horn = null;
    }
  }

  siren(on: boolean, distance01: number): void {
    if (!this.ctx) return;
    const s = (this as any).__siren as { o: OscillatorNode; g: GainNode; lfo: OscillatorNode } | null;
    if (on && !s) {
      const o = this.ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = 700;
      const lfo = this.ctx.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.value = 0.9;
      const lg = this.ctx.createGain();
      lg.gain.value = 260;
      lfo.connect(lg).connect(o.frequency);
      const g = this.ctx.createGain();
      g.gain.value = 0;
      o.connect(g).connect(this.master);
      o.start();
      lfo.start();
      (this as any).__siren = { o, g, lfo };
    }
    const cur = (this as any).__siren as { o: OscillatorNode; g: GainNode; lfo: OscillatorNode } | null;
    if (cur) cur.g.gain.setTargetAtTime(on ? 0.05 * (1 - distance01 * 0.8) : 0, this.ctx.currentTime, 0.1);
  }

  chime(kind: 'cash' | 'checkpoint' | 'fail' | 'crash'): void {
    if (!this.ctx) return;
    const c = this.ctx;
    const t = c.currentTime;
    const tone = (f: number, at: number, dur: number, vol: number, type: OscillatorType = 'sine') => {
      const o = c.createOscillator();
      o.type = type;
      o.frequency.value = f;
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(vol, at + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
      o.connect(g).connect(this.master);
      o.start(at);
      o.stop(at + dur + 0.05);
    };
    if (kind === 'cash') [784, 1047, 1319, 1568].forEach((f, i) => tone(f, t + i * 0.07, 0.4, 0.12));
    if (kind === 'checkpoint') [988, 1319].forEach((f, i) => tone(f, t + i * 0.08, 0.25, 0.12));
    if (kind === 'fail') [220, 180, 140].forEach((f, i) => tone(f, t + i * 0.15, 0.3, 0.1, 'square'));
    if (kind === 'crash') {
      tone(90, t, 0.25, 0.2, 'square');
      tone(60, t, 0.4, 0.2, 'sawtooth');
    }
  }
}
