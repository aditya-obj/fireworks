/**
 * Authentic Pyrotechnics Audio Engine
 * Loads and plays real recorded Diwali firecracker samples with zero latency,
 * pitch randomization, smooth looping, and heavy aerial blast synthesis.
 */

export class PyroAudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private recordingDestination: MediaStreamAudioDestinationNode | null = null;
  public isMuted: boolean = false;
  private isUnlocked: boolean = false;

  // Decoded Audio Buffers
  private buffers: Map<string, AudioBuffer> = new Map();

  // Active continuous loop source nodes
  private anarLoopSource: AudioBufferSourceNode | null = null;
  private anarGain: GainNode | null = null;
  private anarActive: boolean = false;

  private sparklerLoopSource: AudioBufferSourceNode | null = null;
  private sparklerGain: GainNode | null = null;
  private sparklerActive: boolean = false;

  private lastAnarPulse: number = 0;
  private lastSparklerPulse: number = 0;

  constructor() {
    // Lazy AudioContext initialization
  }

  public unlock(): void {
    if (this.isUnlocked && this.ctx) {
      if (this.ctx.state === 'suspended') {
        this.ctx.resume();
      }
      return;
    }

    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.isMuted ? 0 : 0.95;

      this.masterGain.connect(this.ctx.destination);

      // Create stream destination for recording
      this.recordingDestination = this.ctx.createMediaStreamDestination();
      this.masterGain.connect(this.recordingDestination);

      this.isUnlocked = true;

      // Load all authentic audio samples
      this.preloadSamples();

      // Start continuous loop watchdog
      window.setInterval(() => this.watchdog(), 80);
    } catch (e) {
      console.warn('AudioContext unlock failed:', e);
    }
  }

  private async preloadSamples(): Promise<void> {
    if (!this.ctx) return;

    const files: Record<string, string> = {
      ROCKET_WHISTLE: '/audio/rocket-whistle.mp3',
      ROCKET_EXPLOSION: '/audio/rocket-explosion.mp3',
      STARBURST: '/audio/starburst.mp3',
      HEAVY_EXPLOSION: '/audio/heavy-explosion-hit.mp3',
      THUNDER_CRACK: '/audio/thunder-crack.mp3',
      AERIAL_BURST: '/audio/aerial-shell-burst.mp3',
      ROMAN_POP: '/audio/roman-pop.mp3',
      ANAR: '/audio/anar-fountain.mp3',
      SPARKLER: '/audio/sparkler.mp3',
      FINALE: '/audio/finale-barrage.mp3',
      CHAKRI: '/audio/chakri-spin.mp3'
    };

    for (const [key, url] of Object.entries(files)) {
      try {
        const res = await fetch(url);
        const arrayBuf = await res.arrayBuffer();
        const audioBuf = await this.ctx.decodeAudioData(arrayBuf);
        this.buffers.set(key, audioBuf);
      } catch (err) {
        console.warn(`Failed to preload audio sample ${key} from ${url}:`, err);
      }
    }
  }

  public getAudioStream(): MediaStreamTrack | null {
    return this.recordingDestination?.stream.getAudioTracks()[0] || null;
  }

  public toggleMute(): boolean {
    this.isMuted = !this.isMuted;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(this.isMuted ? 0 : 0.95, this.ctx.currentTime, 0.05);
    }
    return this.isMuted;
  }

  /**
   * Plays a one-shot sample with randomized pitch (±4%)
   */
  private playSample(key: string, volume: number = 1.0, pitchVariation: number = 0.06): void {
    if (!this.ctx || !this.masterGain || this.isMuted) return;

    const buffer = this.buffers.get(key);
    if (!buffer) {
      this.fallbackBoom(volume);
      return;
    }

    const source = this.ctx.createBufferSource();
    source.buffer = buffer;

    // Pitch randomization
    const rate = 1.0 + (Math.random() - 0.5) * pitchVariation * 2;
    source.playbackRate.value = rate;

    const gain = this.ctx.createGain();
    gain.gain.value = volume;

    source.connect(gain);
    gain.connect(this.masterGain);

    source.start();
  }

  /**
   * 1. Rocket Launch Whistle
   */
  public playRocketLaunch(): void {
    this.playSample('ROCKET_WHISTLE', 0.95, 0.05);
  }

  /**
   * 2. Rocket / Shell / Starburst Explosion
   * Powerful, layered aerial bomb burst with deep sub-bass punch
   */
  public playExplosion(intensity: number = 1.0): void {
    if (!this.ctx || !this.masterGain || this.isMuted) return;

    // Layer 1: Heavy Concussive Bomb Hit
    this.playSample('HEAVY_EXPLOSION', Math.min(1.0, 0.95 * intensity), 0.07);

    // Layer 2: Aerial Shell Crack & Sizzling Debris
    this.playSample('AERIAL_BURST', Math.min(1.0, 0.85 * intensity), 0.05);

    // Layer 3: Sub-Bass Sine Drop for physical chest rumble
    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const oscGain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(115, now);
      osc.frequency.exponentialRampToValueAtTime(26, now + 0.65);

      oscGain.gain.setValueAtTime(0.7 * intensity, now);
      oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.7);

      osc.connect(oscGain);
      oscGain.connect(this.masterGain);
      osc.start(now);
      osc.stop(now + 0.75);
    } catch {
      // Ignore sub-bass if context busy
    }
  }

  /**
   * 3. Roman Candle Pop
   */
  public playRomanPop(): void {
    this.playSample('ROMAN_POP', 0.85, 0.08);
  }

  /**
   * 4. Grand Finale Multi-Burst
   */
  public playFinaleBarrage(): void {
    this.playSample('FINALE', 1.0, 0.04);
  }

  /**
   * 5. Continuous Anar Fountain Roar
   */
  public pulseAnarLoop(): void {
    this.lastAnarPulse = performance.now();
    if (!this.ctx || !this.masterGain || this.isMuted) return;

    if (!this.anarActive) {
      this.startContinuousSample('ANAR', (src, gain) => {
        this.anarLoopSource = src;
        this.anarGain = gain;
        this.anarActive = true;
      });
    } else if (this.anarGain) {
      this.anarGain.gain.setTargetAtTime(0.9, this.ctx.currentTime, 0.05);
    }
  }

  /**
   * 6. Continuous Sparkler Crackle
   */
  public pulseSparklerLoop(): void {
    this.lastSparklerPulse = performance.now();
    if (!this.ctx || !this.masterGain || this.isMuted) return;

    if (!this.sparklerActive) {
      this.startContinuousSample('SPARKLER', (src, gain) => {
        this.sparklerLoopSource = src;
        this.sparklerGain = gain;
        this.sparklerActive = true;
      });
    } else if (this.sparklerGain) {
      this.sparklerGain.gain.setTargetAtTime(0.8, this.ctx.currentTime, 0.05);
    }
  }

  private startContinuousSample(
    key: string,
    callback: (src: AudioBufferSourceNode, gain: GainNode) => void
  ): void {
    if (!this.ctx || !this.masterGain) return;
    const buffer = this.buffers.get(key);
    if (!buffer) return;

    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.01, this.ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.85, this.ctx.currentTime + 0.1);

    source.connect(gain);
    gain.connect(this.masterGain);
    source.start();

    callback(source, gain);
  }

  private watchdog(): void {
    if (!this.ctx) return;
    const now = performance.now();

    if (this.anarActive && now - this.lastAnarPulse > 150) {
      if (this.anarGain) {
        this.anarGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1);
      }
      if (now - this.lastAnarPulse > 300) {
        this.stopSource(this.anarLoopSource);
        this.anarLoopSource = null;
        this.anarGain = null;
        this.anarActive = false;
      }
    }

    if (this.sparklerActive && now - this.lastSparklerPulse > 150) {
      if (this.sparklerGain) {
        this.sparklerGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1);
      }
      if (now - this.lastSparklerPulse > 300) {
        this.stopSource(this.sparklerLoopSource);
        this.sparklerLoopSource = null;
        this.sparklerGain = null;
        this.sparklerActive = false;
      }
    }
  }

  private stopSource(src: AudioBufferSourceNode | null): void {
    if (!src) return;
    try {
      src.stop();
      src.disconnect();
    } catch {
      // Ignore if already stopped
    }
  }

  private micStream: MediaStream | null = null;
  private micSource: MediaStreamAudioSourceNode | null = null;

  /**
   * Mixes the user's microphone into recordings only (never the speakers,
   * so there's no feedback loop). Returns whether the mic is now on.
   */
  public async setMicInRecording(on: boolean): Promise<boolean> {
    this.unlock();
    if (!on) {
      this.micSource?.disconnect();
      this.micStream?.getTracks().forEach((t) => t.stop());
      this.micSource = null;
      this.micStream = null;
      return false;
    }
    if (this.micSource) return true;
    if (!this.ctx || !this.recordingDestination) return false;
    this.micStream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
    });
    this.micSource = this.ctx.createMediaStreamSource(this.micStream);
    const micGain = this.ctx.createGain();
    micGain.gain.value = 1.0;
    this.micSource.connect(micGain);
    micGain.connect(this.recordingDestination);
    return true;
  }

  private noiseBuffer: AudioBuffer | null = null;

  private getNoise(): AudioBuffer | null {
    if (!this.ctx) return null;
    if (!this.noiseBuffer) {
      const len = this.ctx.sampleRate * 2;
      this.noiseBuffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.noiseBuffer.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }
    return this.noiseBuffer;
  }

  /** Filtered noise burst with an attack/decay envelope */
  private noiseBurst(opts: { type: BiquadFilterType; freq: number; q?: number; gain: number; attack: number; decay: number; delay?: number }): void {
    const noise = this.getNoise();
    if (!this.ctx || !this.masterGain || !noise) return;
    const t0 = this.ctx.currentTime + (opts.delay ?? 0);
    const src = this.ctx.createBufferSource();
    src.buffer = noise;
    const filter = this.ctx.createBiquadFilter();
    filter.type = opts.type;
    filter.frequency.value = opts.freq;
    filter.Q.value = opts.q ?? 0.8;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(opts.gain, t0 + opts.attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + opts.attack + opts.decay);
    src.connect(filter);
    filter.connect(g);
    g.connect(this.masterGain);
    src.start(t0, Math.random() * 1.5);
    src.stop(t0 + opts.attack + opts.decay + 0.05);
  }

  private thump(freqFrom: number, freqTo: number, gain: number, dur: number): void {
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freqFrom, now);
    osc.frequency.exponentialRampToValueAtTime(freqTo, now + dur);
    g.gain.setValueAtTime(gain, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + dur);
    osc.connect(g);
    g.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + dur + 0.05);
  }

  /** Fuse sizzle before a ground cracker goes off */
  public playFuse(): void {
    if (!this.ctx || this.isMuted) return;
    this.noiseBurst({ type: 'bandpass', freq: 5200, q: 1.2, gain: 0.12, attack: 0.02, decay: 0.45 });
  }

  /** Atom bomb: one enormous, sharp bang with a long rumble */
  public playAtomBlast(): void {
    if (!this.ctx || this.isMuted) return;
    this.playSample('THUNDER_CRACK', 1.0, 0.04);
    this.playSample('HEAVY_EXPLOSION', 1.0, 0.04);
    this.noiseBurst({ type: 'highpass', freq: 900, gain: 0.9, attack: 0.002, decay: 0.35 });
    this.noiseBurst({ type: 'lowpass', freq: 400, gain: 0.8, attack: 0.01, decay: 1.4 });
    this.thump(95, 22, 1.0, 1.2);
  }

  /** Hydrogen bomb: two stacked blasts and a long, deep rumble */
  public playHydrogenBlast(): void {
    if (!this.ctx || this.isMuted) return;
    this.playAtomBlast();
    this.noiseBurst({ type: 'highpass', freq: 700, gain: 0.8, attack: 0.002, decay: 0.4, delay: 0.28 });
    this.noiseBurst({ type: 'lowpass', freq: 250, gain: 0.9, attack: 0.05, decay: 2.6, delay: 0.1 });
    window.setTimeout(() => this.thump(80, 18, 1.0, 1.8), 280);
  }

  /** Chakri: whirring spin */
  public playChakri(): void {
    this.playSample('CHAKRI', 0.8, 0.05);
  }

  /** One small cracker in a ladi: a short, sharp crack */
  public playCrack(intensity = 1): void {
    if (!this.ctx || this.isMuted) return;
    const v = Math.min(1, 0.55 * intensity);
    this.noiseBurst({ type: 'highpass', freq: 1400 + Math.random() * 1600, gain: v, attack: 0.001, decay: 0.05 + Math.random() * 0.04 });
    this.noiseBurst({ type: 'bandpass', freq: 400 + Math.random() * 300, q: 1.5, gain: v * 0.6, attack: 0.002, decay: 0.08 });
  }

  /** Snake tablet: a soft, long hiss (no bang) */
  public playSnakeFizz(): void {
    if (!this.ctx || this.isMuted) return;
    this.noiseBurst({ type: 'bandpass', freq: 2800, q: 0.7, gain: 0.07, attack: 0.4, decay: 3.2 });
  }

  private fallbackBoom(volume: number): void {
    if (!this.ctx || !this.masterGain || this.isMuted) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.frequency.setValueAtTime(120, now);
    osc.frequency.exponentialRampToValueAtTime(30, now + 0.5);
    gain.gain.setValueAtTime(0.7 * volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.6);
  }
}
