// Audio espacial con Web Audio. Parámetros del PannerNode:
// panningModel HRTF, distanceModel inverse, refDistance 1, maxDistance 40, rolloffFactor 1.
export class Sound {
  constructor() { this.ctx = null; this.reverbOn = true; this.panning = 'HRTF'; this.speakerOn = false; }

  init() {
    if (this.ctx) { this.ctx.resume(); return; }
    const ctx = this.ctx = new AudioContext();
    this.master = ctx.createGain(); this.master.gain.value = .8; this.master.connect(ctx.destination);
    this.dry = ctx.createGain(); this.dry.connect(this.master);
    this.wet = ctx.createGain(); this.wet.gain.value = .9;
    this.convolver = ctx.createConvolver();
    this.convolver.buffer = this.impulse(2.4, 3);
    this.dryMeter = ctx.createAnalyser(); this.wetMeter = ctx.createAnalyser();
    this.dryMeter.fftSize = this.wetMeter.fftSize = 1024;
    this.dry.connect(this.dryMeter);
    // El convolver normaliza su salida: sin esta ganancia la cola casi no se escucha.
    const tail = ctx.createGain(); tail.gain.value = 7;
    this.wet.connect(this.convolver).connect(tail).connect(this.master);
    tail.connect(this.wetMeter);
    // Los pasos se repiten todo el tiempo: mandan poca señal a la reverb para no cansar.
    this.stepSend = ctx.createGain(); this.stepSend.gain.value = .1; this.stepSend.connect(this.wet);
    this.noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;

    const panner = this.panner = ctx.createPanner();
    panner.panningModel = this.panning; panner.distanceModel = 'inverse';
    panner.refDistance = 1; panner.maxDistance = 40; panner.rolloffFactor = 1;
    this.speakerGain = ctx.createGain(); this.speakerGain.gain.value = 0;
    const filter = ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 1300;
    for (const [f, type, g] of [[110, 'sawtooth', .1], [165, 'square', .045], [331, 'triangle', .05]]) {
      const o = ctx.createOscillator(), gn = ctx.createGain();
      o.type = type; o.frequency.value = f; gn.gain.value = g; o.connect(gn).connect(filter); o.start();
    }
    filter.connect(this.speakerGain).connect(panner);
    panner.connect(this.dry); panner.connect(this.wet);
  }

  // Respuesta al impulso sintética: ruido que decae. Convolucionar contra esto simula una sala.
  impulse(seconds, decay) {
    const { sampleRate: sr } = this.ctx, len = sr * seconds | 0, b = this.ctx.createBuffer(2, len, sr);
    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** decay;
    }
    return b;
  }

  setListener(pos, yaw) {
    if (!this.ctx) return;
    const l = this.ctx.listener, t = this.ctx.currentTime, fx = -Math.sin(yaw), fz = -Math.cos(yaw);
    if (l.positionX) {
      l.positionX.setValueAtTime(pos.x, t); l.positionY.setValueAtTime(pos.y, t); l.positionZ.setValueAtTime(pos.z, t);
      l.forwardX.setValueAtTime(fx, t); l.forwardY.setValueAtTime(0, t); l.forwardZ.setValueAtTime(fz, t);
      l.upX.setValueAtTime(0, t); l.upY.setValueAtTime(1, t); l.upZ.setValueAtTime(0, t);
    } else { l.setPosition(pos.x, pos.y, pos.z); l.setOrientation(fx, 0, fz, 0, 1, 0); }
  }

  setSpeaker(pos, volume) {
    if (!this.panner) return;
    const t = this.ctx.currentTime;
    if (this.panner.positionX) {
      this.panner.positionX.setTargetAtTime(pos.x, t, .03);
      this.panner.positionY.setTargetAtTime(pos.y, t, .03);
      this.panner.positionZ.setTargetAtTime(pos.z, t, .03);
    } else this.panner.setPosition(pos.x, pos.y, pos.z);
    this.speakerGain.gain.setTargetAtTime(this.speakerOn ? volume : 0, t, .15);
  }
  setPanning(model) { this.panning = model; if (this.panner) this.panner.panningModel = model; }
  setReverb(on) { this.reverbOn = on; if (this.wet) this.wet.gain.setTargetAtTime(on ? .9 : 0, this.ctx.currentTime, .02); }

  // Sonido corto y seco: al cortarse de golpe deja escuchar la cola de la reverb.
  clap() {
    if (!this.ctx) return;
    this.clapAt = performance.now(); // La cabeza de la sala 10 se sobresalta con esto.
    const c = this.ctx, t = c.currentTime, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = this.noise; f.type = 'bandpass'; f.frequency.value = 1500; f.Q.value = .7;
    g.gain.setValueAtTime(.9, t); g.gain.exponentialRampToValueAtTime(.001, t + .05);
    s.connect(f).connect(g); g.connect(this.dry); g.connect(this.wet); s.start(t, Math.random() * .8, .06);
  }
  levels() {
    const rms = (a) => { if (!a) return 0; const d = new Float32Array(a.fftSize); a.getFloatTimeDomainData(d); return Math.sqrt(d.reduce((n, v) => n + v * v, 0) / d.length); };
    return { dry: rms(this.dryMeter), wet: rms(this.wetMeter) };
  }

  footstep(left, sprint, surface) {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain(), p = c.createStereoPanner();
    s.buffer = this.noise; s.playbackRate.value = (sprint ? 1.25 : 1) * (.9 + Math.random() * .2);
    f.type = 'bandpass'; const tone = { metal: [1500, 4, 1.3], gravel: [2600, .6, .9], carpet: [170, .8, .7] }[surface] ?? [260 + Math.random() * 120, .9, 1];
    f.frequency.value = tone[0]; f.Q.value = tone[1];
    p.pan.value = left ? -.15 : .15;
    g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime((sprint ? .15 : .1) * tone[2], t + .015);
    g.gain.exponentialRampToValueAtTime(.0001, t + .14);
    s.connect(f).connect(g).connect(p); p.connect(this.dry); p.connect(this.stepSend);
    s.start(t, Math.random() * .8, .17);
  }
  blip(freq = 660) {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime, o = c.createOscillator(), g = c.createGain();
    o.frequency.value = freq; g.gain.setValueAtTime(.12, t); g.gain.exponentialRampToValueAtTime(.0001, t + .15);
    o.connect(g).connect(this.dry); o.start(t); o.stop(t + .16);
  }
}

// Misma fórmula que aplica distanceModel='inverse' dentro del navegador.
export const inverseGain = (d, ref = 1, roll = 1) => ref / (ref + roll * (Math.max(d, ref) - ref));
