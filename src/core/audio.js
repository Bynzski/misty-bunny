/**
 * audio.js — everything you hear is generated in WebAudio. No files.
 */

export function createAudio() {
  let ctx = null;
  let master = null, wet = null, dry = null, conv = null;
  let started = false;
  let muted = false;
  const nodes = {};

  function noiseBuffer(seconds = 3, kind = 'pink') {
    const n = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, n, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      if (kind === 'white') {
        for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
      } else if (kind === 'brown') {
        let last = 0;
        for (let i = 0; i < n; i++) {
          const w = Math.random() * 2 - 1;
          last = (last + 0.02 * w) / 1.02;
          d[i] = last * 3.5;
        }
      } else {
        let b0 = 0, b1 = 0, b2 = 0;
        for (let i = 0; i < n; i++) {
          const w = Math.random() * 2 - 1;
          b0 = 0.99765 * b0 + w * 0.0990460;
          b1 = 0.96300 * b1 + w * 0.2965164;
          b2 = 0.57000 * b2 + w * 1.0526913;
          d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.22;
        }
      }
    }
    return buf;
  }

  function impulse(seconds = 2.6, decay = 3.2) {
    const n = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, n, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < n; i++) {
        const t = i / n;
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, decay) * (i < 400 ? i / 400 : 1);
      }
    }
    return buf;
  }

  function src(buffer, loop = true) {
    const s = ctx.createBufferSource();
    s.buffer = buffer;
    s.loop = loop;
    return s;
  }

  const A = {
    get ctx() { return ctx; },
    get started() { return started; },
    get muted() { return muted; },

    async start() {
      if (started) return;
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      if (ctx.state === 'suspended') await ctx.resume();
      started = true;

      master = ctx.createGain();
      master.gain.value = 0.0;
      master.connect(ctx.destination);

      conv = ctx.createConvolver();
      conv.buffer = impulse();
      wet = ctx.createGain(); wet.gain.value = 0.34; wet.connect(conv); conv.connect(master);
      dry = ctx.createGain(); dry.gain.value = 1; dry.connect(master);

      master.gain.setTargetAtTime(0.85, ctx.currentTime, 2.2);

      A.buildAmbience();
      A.scheduleDrips();
    },

    buildAmbience() {
      const t = ctx.currentTime;

      // --- wind through the tower: filtered noise with a wandering band ---
      const windSrc = src(noiseBuffer(8, 'pink'));
      const windFilt = ctx.createBiquadFilter();
      windFilt.type = 'bandpass'; windFilt.frequency.value = 380; windFilt.Q.value = 0.7;
      const windGain = ctx.createGain(); windGain.gain.value = 0.05;
      windSrc.connect(windFilt); windFilt.connect(windGain);
      windGain.connect(dry); windGain.connect(wet);
      windSrc.start();
      const lfo = ctx.createOscillator(); lfo.frequency.value = 0.043;
      const lfoG = ctx.createGain(); lfoG.gain.value = 240;
      lfo.connect(lfoG); lfoG.connect(windFilt.frequency); lfo.start();
      const lfo2 = ctx.createOscillator(); lfo2.frequency.value = 0.017;
      const lfo2G = ctx.createGain(); lfo2G.gain.value = 0.035;
      lfo2.connect(lfo2G); lfo2G.connect(windGain.gain); lfo2.start();
      nodes.wind = { src: windSrc, gain: windGain, filt: windFilt };

      // --- distant surf ---
      const surfSrc = src(noiseBuffer(9, 'brown'));
      const surfFilt = ctx.createBiquadFilter();
      surfFilt.type = 'lowpass'; surfFilt.frequency.value = 260; surfFilt.Q.value = 0.5;
      const surfGain = ctx.createGain(); surfGain.gain.value = 0.05;
      surfSrc.connect(surfFilt); surfFilt.connect(surfGain);
      surfGain.connect(dry); surfGain.connect(wet);
      surfSrc.start();
      const swell = ctx.createOscillator(); swell.frequency.value = 0.061;
      const swellG = ctx.createGain(); swellG.gain.value = 0.038;
      swell.connect(swellG); swellG.connect(surfGain.gain); swell.start();
      nodes.surf = { src: surfSrc, gain: surfGain };

      // --- a low drone that lives under everything ---
      const droneGain = ctx.createGain(); droneGain.gain.value = 0.032;
      droneGain.connect(dry); droneGain.connect(wet);
      [55, 82.4, 110.2].forEach((f, i) => {
        const o = ctx.createOscillator();
        o.type = i === 2 ? 'triangle' : 'sine';
        o.frequency.value = f;
        const g = ctx.createGain(); g.gain.value = i === 2 ? 0.12 : 0.3;
        const det = ctx.createOscillator(); det.frequency.value = 0.07 + i * 0.031;
        const detG = ctx.createGain(); detG.gain.value = 0.6 + i;
        det.connect(detG); detG.connect(o.frequency); det.start();
        o.connect(g); g.connect(droneGain); o.start();
      });
      nodes.drone = droneGain;
    },

    scheduleDrips() {
      const loop = () => {
        if (!started) return;
        A.drip();
        setTimeout(loop, 1400 + Math.random() * 5200);
      };
      setTimeout(loop, 2000 + Math.random() * 3000);
    },

    /* ------------------------- one-shots ------------------------- */

    env(node, { a = 0.005, d = 0.2, peak = 1, t0 = 0 }) {
      const t = ctx.currentTime + t0;
      const g = node.gain;
      g.cancelScheduledValues(t);
      g.setValueAtTime(0.0001, t);
      g.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a);
      g.exponentialRampToValueAtTime(0.0001, t + a + d);
      return t + a + d;
    },

    drip() {
      if (!started || muted) return;
      const o = ctx.createOscillator();
      o.type = 'sine';
      const g = ctx.createGain();
      const f0 = 900 + Math.random() * 1500;
      o.frequency.setValueAtTime(f0, ctx.currentTime);
      o.frequency.exponentialRampToValueAtTime(f0 * 0.45, ctx.currentTime + 0.09);
      const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = f0; f.Q.value = 3;
      o.connect(f); f.connect(g);
      g.connect(dry); g.connect(wet);
      o.start();
      this.env(g, { a: 0.002, d: 0.34, peak: 0.055 });
      o.stop(ctx.currentTime + 0.5);
    },

    footstep(kind) {
      if (!started || muted) return;
      const s = ctx.createBufferSource();
      s.buffer = noiseBuffer(0.5, 'white');
      const f = ctx.createBiquadFilter();
      const g = ctx.createGain();
      if (kind === 'water') {
        f.type = 'bandpass'; f.frequency.value = 1500 + Math.random() * 900; f.Q.value = 0.8;
        s.connect(f); f.connect(g);
        g.connect(dry); g.connect(wet);
        s.start();
        this.env(g, { a: 0.004, d: 0.19, peak: 0.1 });
        s.stop(ctx.currentTime + 0.4);
      } else {
        f.type = 'lowpass'; f.frequency.value = 380 + Math.random() * 260; f.Q.value = 1.1;
        const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 90;
        s.connect(hp); hp.connect(f); f.connect(g);
        g.connect(dry); g.connect(wet);
        s.start();
        this.env(g, { a: 0.003, d: 0.11, peak: kind === 'run' ? 0.075 : 0.05 });
        s.stop(ctx.currentTime + 0.3);
      }
    },

    /** Metallic hit — brass wheels, chains, latches. */
    clank(pitch = 1, gain = 0.09) {
      if (!started || muted) return;
      const parts = [1, 2.76, 5.4, 8.93, 11.34];
      parts.forEach((p, i) => {
        const o = ctx.createOscillator();
        o.type = 'sine';
        o.frequency.value = 320 * p * pitch;
        const g = ctx.createGain();
        o.connect(g); g.connect(dry); g.connect(wet);
        o.start();
        this.env(g, { a: 0.001, d: 0.42 / (i * 0.55 + 1), peak: gain / (i + 1.2) });
        o.stop(ctx.currentTime + 0.8);
      });
      // strike transient
      const s = ctx.createBufferSource();
      s.buffer = noiseBuffer(0.2, 'white');
      const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 2400 * pitch; f.Q.value = 1.4;
      const g = ctx.createGain();
      s.connect(f); f.connect(g); g.connect(dry);
      s.start();
      this.env(g, { a: 0.001, d: 0.05, peak: gain * 0.7 });
      s.stop(ctx.currentTime + 0.2);
    },

    /** Stone / iron moving — a long low grind. */
    grind(dur = 2.4, gain = 0.14, pitch = 1) {
      if (!started || muted) return;
      const s = ctx.createBufferSource();
      s.buffer = noiseBuffer(Math.ceil(dur) + 1, 'brown');
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass'; f.frequency.value = 150 * pitch; f.Q.value = 1.6;
      const g = ctx.createGain();
      s.connect(f); f.connect(g);
      g.connect(dry); g.connect(wet);
      s.start();
      const t = ctx.currentTime;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(gain, t + 0.25);
      g.gain.setValueAtTime(gain, t + dur * 0.65);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      const lfo = ctx.createOscillator(); lfo.frequency.value = 17;
      const lg = ctx.createGain(); lg.gain.value = 55 * pitch;
      lfo.connect(lg); lg.connect(f.frequency); lfo.start(); lfo.stop(t + dur);
      s.stop(t + dur + 0.1);

      // sub rumble
      const o = ctx.createOscillator(); o.type = 'sine';
      o.frequency.setValueAtTime(58 * pitch, t);
      o.frequency.exponentialRampToValueAtTime(34 * pitch, t + dur);
      const og = ctx.createGain();
      o.connect(og); og.connect(dry);
      o.start();
      og.gain.setValueAtTime(0.0001, t);
      og.gain.exponentialRampToValueAtTime(gain * 0.9, t + 0.3);
      og.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.stop(t + dur + 0.1);
    },

    /** Water draining. */
    drain(dur = 6) {
      if (!started || muted) return;
      const s = ctx.createBufferSource();
      s.buffer = noiseBuffer(Math.ceil(dur) + 1, 'white');
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.setValueAtTime(2600, ctx.currentTime);
      f.frequency.exponentialRampToValueAtTime(380, ctx.currentTime + dur);
      f.Q.value = 0.9;
      const g = ctx.createGain();
      s.connect(f); f.connect(g); g.connect(dry); g.connect(wet);
      s.start();
      const t = ctx.currentTime;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.15, t + 0.6);
      g.gain.exponentialRampToValueAtTime(0.05, t + dur * 0.7);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      s.stop(t + dur + 0.2);
    },

    /** A struck bell — used for every puzzle solved. */
    bell(root = 196, gain = 0.13) {
      if (!started || muted) return;
      const parts = [[1, 1], [2.0, 0.55], [2.4, 0.4], [3.0, 0.28], [4.5, 0.2], [5.33, 0.14], [6.67, 0.1]];
      parts.forEach(([p, amp], i) => {
        const o = ctx.createOscillator();
        o.type = 'sine';
        o.frequency.value = root * p * (1 + (i % 2 ? 0.0016 : 0));
        const g = ctx.createGain();
        o.connect(g); g.connect(dry); g.connect(wet);
        o.start();
        const t = ctx.currentTime;
        const dur = 4.5 / (1 + i * 0.35);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(gain * amp, t + 0.006);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        o.stop(t + dur + 0.1);
      });
    },

    /** Wrong combination: a dead, damped thud. */
    reject() {
      if (!started || muted) return;
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.setValueAtTime(140, ctx.currentTime);
      o.frequency.exponentialRampToValueAtTime(78, ctx.currentTime + 0.22);
      const g = ctx.createGain();
      o.connect(g); g.connect(dry); g.connect(wet);
      o.start();
      this.env(g, { a: 0.004, d: 0.3, peak: 0.12 });
      o.stop(ctx.currentTime + 0.5);
      this.clank(0.5, 0.05);
    },

    /** Soft page / paper handling. */
    paper() {
      if (!started || muted) return;
      const s = ctx.createBufferSource();
      s.buffer = noiseBuffer(0.4, 'white');
      const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 2600;
      const g = ctx.createGain();
      s.connect(f); f.connect(g); g.connect(dry);
      s.start();
      this.env(g, { a: 0.006, d: 0.16, peak: 0.055 });
      s.stop(ctx.currentTime + 0.3);
    },

    click() {
      if (!started || muted) return;
      this.clank(2.4, 0.035);
    },

    /** Riser for the final reveal. */
    swell(dur = 9, gain = 0.16) {
      if (!started || muted) return;
      const t = ctx.currentTime;
      [65.4, 98, 130.8, 196, 261.6, 392].forEach((f, i) => {
        const o = ctx.createOscillator();
        o.type = i > 2 ? 'sine' : 'triangle';
        o.frequency.value = f;
        const g = ctx.createGain();
        o.connect(g); g.connect(dry); g.connect(wet);
        o.start();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(gain / (i * 0.8 + 1), t + dur * 0.62);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        o.stop(t + dur + 0.2);
      });
      this.grind(dur * 0.8, gain * 0.5, 0.55);
    },

    /** Change how wet/roomy the place sounds. */
    setSpace(kind) {
      if (!started) return;
      const t = ctx.currentTime;
      if (kind === 'open') { wet.gain.setTargetAtTime(0.12, t, 1.2); }
      else if (kind === 'small') { wet.gain.setTargetAtTime(0.5, t, 1.2); }
      else { wet.gain.setTargetAtTime(0.34, t, 1.2); }
      if (nodes.surf) nodes.surf.gain.gain.setTargetAtTime(kind === 'open' ? 0.085 : 0.05, t, 2);
      if (nodes.drone) nodes.drone.gain.setTargetAtTime(kind === 'open' ? 0.012 : 0.032, t, 2);
    },

    toggleMute() {
      muted = !muted;
      if (master) master.gain.setTargetAtTime(muted ? 0 : 0.85, ctx.currentTime, 0.2);
      return muted;
    },
  };

  return A;
}