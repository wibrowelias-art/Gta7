import type { AudioApi } from '../app';
import type { Settings } from '../game/types';

type SfxName = Parameters<AudioApi['play']>[0];

/** Web Audio synthesis for every sound in the game: effects, positional ambience and a synthwave loop. */
export function createAudio(settings: Settings): AudioApi {
  let ctx: AudioContext | null = null;
  let master: GainNode;
  let sfxGain: GainNode;
  let musicGain: GainNode;
  let ambGain: GainNode;
  let started = false;
  let musicVol = settings.music;
  let sfxVol = settings.sfx;
  let hour = 12;
  let rain = false;
  let cameraFloor = 0;
  let amb: { city: GainNode; rain: GainNode; chatter: GainNode; wind: GainNode } | null = null;
  let musicTimer = 0;
  let lastPlay: Record<string, number> = {};

  const ensure = (): AudioContext | null => {
    if (ctx) return ctx;
    const AC = (window as any).AudioContext ?? (window as any).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC() as AudioContext;
    master = ctx.createGain();
    master.gain.value = 0.9;
    master.connect(ctx.destination);
    sfxGain = ctx.createGain();
    sfxGain.gain.value = sfxVol;
    sfxGain.connect(master);
    musicGain = ctx.createGain();
    musicGain.gain.value = musicVol * 0.5;
    musicGain.connect(master);
    ambGain = ctx.createGain();
    ambGain.gain.value = sfxVol * 0.6;
    ambGain.connect(master);
    return ctx;
  };

  const noiseBuffer = (() => {
    let buf: AudioBuffer | null = null;
    return (c: AudioContext) => {
      if (buf) return buf;
      buf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
      const d = buf.getChannelData(0);
      let last = 0;
      for (let i = 0; i < d.length; i++) {
        const white = Math.random() * 2 - 1;
        last = (last + 0.02 * white) / 1.02; // brownish
        d[i] = white * 0.5 + last * 3;
      }
      return buf;
    };
  })();

  const tone = (c: AudioContext, dest: AudioNode, type: OscillatorType, freq: number, t0: number, dur: number, vol: number, slideTo?: number) => {
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(dest);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
  };
  const noise = (c: AudioContext, dest: AudioNode, t0: number, dur: number, vol: number, filterFreq: number, q = 1, type: BiquadFilterType = 'bandpass', sweepTo?: number) => {
    const src = c.createBufferSource();
    src.buffer = noiseBuffer(c);
    src.loop = true;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(filterFreq, t0);
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t0 + dur);
    f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f).connect(g).connect(dest);
    src.start(t0);
    src.stop(t0 + dur + 0.05);
  };

  const SFX: Record<SfxName, (c: AudioContext, t: number) => void> = {
    tap: (c, t) => {
      tone(c, sfxGain, 'sine', 1400, t, 0.05, 0.12, 900);
      noise(c, sfxGain, t, 0.03, 0.06, 3000, 2);
    },
    pop: (c, t) => tone(c, sfxGain, 'sine', 600, t, 0.08, 0.15, 1200),
    open: (c, t) => {
      noise(c, sfxGain, t, 0.22, 0.12, 600, 1.2, 'bandpass', 2600);
      tone(c, sfxGain, 'sine', 520, t + 0.02, 0.18, 0.08, 780);
    },
    close: (c, t) => {
      noise(c, sfxGain, t, 0.18, 0.1, 2400, 1.2, 'bandpass', 500);
      tone(c, sfxGain, 'sine', 700, t, 0.14, 0.06, 420);
    },
    whoosh: (c, t) => noise(c, sfxGain, t, 0.3, 0.14, 400, 1, 'bandpass', 3200),
    coin: (c, t) => {
      tone(c, sfxGain, 'sine', 1760, t, 0.09, 0.14);
      tone(c, sfxGain, 'sine', 2637, t + 0.07, 0.16, 0.16);
      tone(c, sfxGain, 'triangle', 5274, t + 0.07, 0.1, 0.03);
    },
    register: (c, t) => {
      noise(c, sfxGain, t, 0.06, 0.2, 2500, 3);
      tone(c, sfxGain, 'square', 180, t, 0.05, 0.05);
      tone(c, sfxGain, 'sine', 2093, t + 0.08, 0.5, 0.2);
      tone(c, sfxGain, 'sine', 3136, t + 0.08, 0.4, 0.07);
      noise(c, sfxGain, t + 0.1, 0.12, 0.08, 6000, 1, 'highpass');
    },
    ding: (c, t) => {
      tone(c, sfxGain, 'sine', 1319, t, 0.55, 0.14);
      tone(c, sfxGain, 'sine', 1109, t + 0.22, 0.7, 0.12);
      tone(c, sfxGain, 'sine', 2637, t, 0.2, 0.03);
    },
    notify: (c, t) => {
      tone(c, sfxGain, 'sine', 988, t, 0.1, 0.12);
      tone(c, sfxGain, 'sine', 1319, t + 0.1, 0.22, 0.12);
    },
    cheer: (c, t) => {
      [523, 659, 784, 1047].forEach((f, i) => tone(c, sfxGain, 'triangle', f, t + i * 0.06, 0.35, 0.1));
      noise(c, sfxGain, t, 0.6, 0.12, 1800, 0.6, 'bandpass', 900);
    },
    error: (c, t) => {
      tone(c, sfxGain, 'square', 160, t, 0.16, 0.08, 120);
      tone(c, sfxGain, 'square', 110, t + 0.02, 0.2, 0.06);
    },
    levelup: (c, t) => {
      [392, 523, 659, 784, 1047, 1319].forEach((f, i) => tone(c, sfxGain, 'sine', f, t + i * 0.07, 0.4, 0.12));
      tone(c, sfxGain, 'triangle', 1568, t + 0.42, 0.9, 0.08);
      noise(c, sfxGain, t + 0.3, 0.5, 0.08, 4000, 1, 'highpass');
    },
  };

  /* ---------------- Ambience ---------------- */
  const startAmbience = (c: AudioContext) => {
    const mk = (freq: number, q: number, type: BiquadFilterType, vol: number) => {
      const src = c.createBufferSource();
      src.buffer = noiseBuffer(c);
      src.loop = true;
      const f = c.createBiquadFilter();
      f.type = type;
      f.frequency.value = freq;
      f.Q.value = q;
      const g = c.createGain();
      g.gain.value = vol;
      src.connect(f).connect(g).connect(ambGain);
      src.start();
      return g;
    };
    const cityG = mk(180, 0.7, 'lowpass', 0.25);
    const rainG = mk(2200, 0.4, 'bandpass', 0);
    const windG = mk(600, 0.5, 'bandpass', 0.02);
    const chatterG = mk(1200, 2, 'bandpass', 0);
    // Slow LFO on the city hum so it breathes like traffic.
    const lfo = c.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoG = c.createGain();
    lfoG.gain.value = 0.08;
    lfo.connect(lfoG).connect(cityG.gain);
    lfo.start();
    // Occasional distant siren / horn.
    const horns = () => {
      if (!ctx) return;
      const t0 = ctx.currentTime + 4 + Math.random() * 18;
      if (Math.random() < 0.5) tone(ctx, ambGain, 'sine', 440 + Math.random() * 200, t0, 0.5, 0.012, 380);
      else {
        tone(ctx, ambGain, 'triangle', 700, t0, 1.6, 0.008, 1000);
        tone(ctx, ambGain, 'triangle', 1000, t0 + 1.6, 1.6, 0.008, 700);
      }
      setTimeout(horns, 12000 + Math.random() * 20000);
    };
    setTimeout(horns, 6000);
    // Office chatter: filtered noise bursts shaped like speech.
    const chatter = () => {
      if (!ctx) return;
      const t0 = ctx.currentTime + 0.5 + Math.random() * 3;
      for (let i = 0; i < 3 + Math.random() * 4; i++) noise(ctx, chatterG, t0 + i * 0.16, 0.12, 0.5, 600 + Math.random() * 900, 3);
      setTimeout(chatter, 2500 + Math.random() * 5000);
    };
    setTimeout(chatter, 3000);
    amb = { city: cityG, rain: rainG, chatter: chatterG, wind: windG };
  };

  const updateAmbience = () => {
    if (!ctx || !amb) return;
    const night = hour < 6 || hour > 21;
    const high = Math.min(1, Math.max(0, cameraFloor / 6));
    const t0 = ctx.currentTime;
    amb.city.gain.setTargetAtTime((night ? 0.14 : 0.26) * (1 - high * 0.6), t0, 0.8);
    amb.rain.gain.setTargetAtTime(rain ? 0.12 : 0, t0, 1.2);
    amb.wind.gain.setTargetAtTime(0.02 + high * 0.08, t0, 1);
    amb.chatter.gain.setTargetAtTime((night ? 0.02 : 0.08) * (1 - high * 0.5), t0, 0.8);
  };

  /* ---------------- Music: original low-key synthwave loop ---------------- */
  const startMusic = (c: AudioContext) => {
    const bpm = 92;
    const beat = 60 / bpm;
    const bar = beat * 4;
    // Chord progression (A minor): Am - F - C - G, two bars each.
    const chords = [
      [220, 261.63, 329.63],
      [174.61, 220, 261.63],
      [130.81 * 2, 164.81 * 2, 196 * 2],
      [196, 246.94, 293.66],
    ];
    const bass = [110, 87.31, 130.81, 98];
    const arp = [440, 523.25, 659.25, 880, 659.25, 523.25, 440, 329.63];
    const pad = c.createBiquadFilter();
    pad.type = 'lowpass';
    pad.frequency.value = 900;
    pad.Q.value = 0.8;
    const padG = c.createGain();
    padG.gain.value = 0.35;
    pad.connect(padG).connect(musicGain);
    // Slow filter sweep.
    const lfo = c.createOscillator();
    lfo.frequency.value = 0.05;
    const lfoG = c.createGain();
    lfoG.gain.value = 500;
    lfo.connect(lfoG).connect(pad.frequency);
    lfo.start();
    const delay = c.createDelay(1);
    delay.delayTime.value = beat * 0.75;
    const fb = c.createGain();
    fb.gain.value = 0.32;
    const delayF = c.createBiquadFilter();
    delayF.type = 'lowpass';
    delayF.frequency.value = 2200;
    delay.connect(delayF).connect(fb).connect(delay);
    const delayOut = c.createGain();
    delayOut.gain.value = 0.35;
    delay.connect(delayOut).connect(musicGain);

    let nextBar = c.currentTime + 0.1;
    let barIdx = 0;
    const schedule = () => {
      if (!ctx) return;
      while (nextBar < c.currentTime + 1.2) {
        const chord = chords[Math.floor(barIdx / 2) % 4];
        const root = bass[Math.floor(barIdx / 2) % 4];
        // Pad: two detuned saws per note, held for the bar.
        for (const f of chord) {
          for (const det of [-5, 5]) {
            const o = c.createOscillator();
            o.type = 'sawtooth';
            o.frequency.value = f;
            o.detune.value = det;
            const g = c.createGain();
            g.gain.setValueAtTime(0.0001, nextBar);
            g.gain.exponentialRampToValueAtTime(0.05, nextBar + 0.6);
            g.gain.setValueAtTime(0.05, nextBar + bar - 0.4);
            g.gain.exponentialRampToValueAtTime(0.0001, nextBar + bar);
            o.connect(g).connect(pad);
            o.start(nextBar);
            o.stop(nextBar + bar + 0.05);
          }
        }
        // Bass: eighth notes, filtered saw with a short envelope.
        for (let i = 0; i < 8; i++) {
          const t0 = nextBar + i * beat * 0.5;
          const o = c.createOscillator();
          o.type = 'sawtooth';
          o.frequency.value = i % 4 === 3 ? root * 1.5 : root;
          const f = c.createBiquadFilter();
          f.type = 'lowpass';
          f.frequency.setValueAtTime(700, t0);
          f.frequency.exponentialRampToValueAtTime(180, t0 + 0.25);
          const g = c.createGain();
          g.gain.setValueAtTime(0.0001, t0);
          g.gain.exponentialRampToValueAtTime(0.13, t0 + 0.01);
          g.gain.exponentialRampToValueAtTime(0.0001, t0 + beat * 0.45);
          o.connect(f).connect(g).connect(musicGain);
          o.start(t0);
          o.stop(t0 + beat * 0.5);
        }
        // Arp: soft plucks into the delay, every other bar.
        if (barIdx % 2 === 1) {
          for (let i = 0; i < 8; i++) {
            const t0 = nextBar + i * beat * 0.5;
            const o = c.createOscillator();
            o.type = 'triangle';
            o.frequency.value = arp[i] * (Math.floor(barIdx / 2) % 4 === 1 ? 0.8 : 1);
            const g = c.createGain();
            g.gain.setValueAtTime(0.0001, t0);
            g.gain.exponentialRampToValueAtTime(0.06, t0 + 0.01);
            g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.35);
            o.connect(g).connect(delay);
            o.connect(g).connect(musicGain);
            o.start(t0);
            o.stop(t0 + 0.4);
          }
        }
        // Drums: soft kick on 1 and 3, hat on offbeats.
        for (let i = 0; i < 4; i++) {
          const t0 = nextBar + i * beat;
          if (i % 2 === 0) tone(c, musicGain, 'sine', 120, t0, 0.22, 0.2, 40);
          noise(c, musicGain, t0 + beat * 0.5, 0.05, 0.04, 8000, 1, 'highpass');
        }
        nextBar += bar;
        barIdx++;
      }
      musicTimer = window.setTimeout(schedule, 400);
    };
    schedule();
  };

  const api: AudioApi = {
    play(name) {
      const c = ensure();
      if (!c || c.state !== 'running' || sfxVol <= 0) return;
      const now = performance.now();
      if (now - (lastPlay[name] ?? 0) < 45) return; // de-dupe bursts
      lastPlay[name] = now;
      SFX[name]?.(c, c.currentTime);
    },
    setMusic(v) {
      musicVol = v;
      if (ctx) musicGain.gain.setTargetAtTime(v * 0.5, ctx.currentTime, 0.1);
    },
    setSfx(v) {
      sfxVol = v;
      if (ctx) {
        sfxGain.gain.setTargetAtTime(v, ctx.currentTime, 0.05);
        ambGain.gain.setTargetAtTime(v * 0.6, ctx.currentTime, 0.3);
      }
    },
    setTimeOfDay(h, r) {
      if (Math.abs(h - hour) < 0.2 && r === rain) return;
      hour = h;
      rain = r;
      updateAmbience();
    },
    setCameraFloor(f) {
      if (Math.abs(f - cameraFloor) < 0.3) return;
      cameraFloor = f;
      updateAmbience();
    },
    resume() {
      const c = ensure();
      if (!c) return;
      void c.resume().then(() => {
        if (started) return;
        started = true;
        startAmbience(c);
        updateAmbience();
        startMusic(c);
      });
    },
  };
  window.addEventListener('pagehide', () => {
    clearTimeout(musicTimer);
    lastPlay = {};
  });
  return api;
}
