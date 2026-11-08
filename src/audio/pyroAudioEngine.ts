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
      FINALE: '/audio/finale-barrage.mp3'
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
