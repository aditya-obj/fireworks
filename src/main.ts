import './style.css';
import { VideoCompositor } from './video/videoCompositor';
import { VisionEngine } from './vision/visionEngine';
import { FireworkDirector } from './fireworks/fireworkDirector';
import { PyroAudioEngine } from './audio/pyroAudioEngine';
import { CaptureEngine } from './capture/captureEngine';

class FireworksApp {
  private compositor: VideoCompositor;
  private vision: VisionEngine;
  private director: FireworkDirector;
  private audio: PyroAudioEngine;
  private capture: CaptureEngine;

  // DOM Elements
  private hudElement: HTMLElement;
  private restoreHudBtn: HTMLElement;
  private audioBtn: HTMLElement;
  private recordBtn: HTMLElement;
  private recordLabel: HTMLElement;
  private recordTimer: HTMLElement;
  private finaleCenter: HTMLElement;
  private finaleTimeout: number = 0;

  // Fog-Mirror Style Reel Preview Elements
  private reelPreviewCard: HTMLElement;
  private reelPreviewVideo: HTMLVideoElement;
  private reelPreviewThumbBtn: HTMLElement;
  private reelDuration: HTMLElement;
  private reelViewBtn: HTMLElement;
  private reelSaveBtn: HTMLElement;
  private reelDismissBtn: HTMLElement;

  // Full Reel Dialog Elements
  private reelDialog: HTMLDialogElement;
  private reelDialogVideo: HTMLVideoElement;
  private reelDialogSaveBtn: HTMLElement;
  private reelDialogCloseBtn: HTMLElement;

  private isCreatorMode: boolean = false;
  private guideBar: HTMLElement | null = null;
  private guideNear = false;
  private lastFrameTime: number = performance.now();
  private recordedVideoUrl: string = '';

  constructor() {
    const canvas = document.getElementById('stage') as HTMLCanvasElement;
    const video = document.getElementById('webcam') as HTMLVideoElement;
    this.hudElement = document.getElementById('hud') as HTMLElement;
    this.restoreHudBtn = document.getElementById('btn-restore-hud') as HTMLElement;
    this.audioBtn = document.getElementById('btn-audio') as HTMLElement;
    this.recordBtn = document.getElementById('btn-record') as HTMLElement;
    this.recordLabel = document.getElementById('record-label') as HTMLElement;
    this.recordTimer = document.getElementById('record-timer') as HTMLElement;
    this.finaleCenter = document.getElementById('grand-finale-center') as HTMLElement;

    // Fog-Mirror Floating Preview Card Elements
    this.reelPreviewCard = document.getElementById('reel-preview-card') as HTMLElement;
    this.reelPreviewVideo = document.getElementById('reel-preview-video') as HTMLVideoElement;
    this.reelPreviewThumbBtn = document.getElementById('reel-preview-thumb-btn') as HTMLElement;
    this.reelDuration = document.getElementById('reel-duration') as HTMLElement;
    this.reelViewBtn = document.getElementById('reel-view-btn') as HTMLElement;
    this.reelSaveBtn = document.getElementById('reel-save-btn') as HTMLElement;
    this.reelDismissBtn = document.getElementById('reel-dismiss-btn') as HTMLElement;

    // Fog-Mirror Dialog Elements
    this.reelDialog = document.getElementById('reel-dialog') as HTMLDialogElement;
    this.reelDialogVideo = document.getElementById('reel-dialog-video') as HTMLVideoElement;
    this.reelDialogSaveBtn = document.getElementById('reel-dialog-save-btn') as HTMLElement;
    this.reelDialogCloseBtn = document.getElementById('reel-dialog-close-btn') as HTMLElement;

    // Subsystems
    this.compositor = new VideoCompositor({ canvas, video });
    this.vision = new VisionEngine();
    this.audio = new PyroAudioEngine();
    this.director = new FireworkDirector();
    this.capture = new CaptureEngine(canvas);

    // Audio Trigger Callback
    this.director.setSoundCallback((soundType, intensity) => {
      switch (soundType) {
        case 'ROCKET_LAUNCH':
          this.audio.playRocketLaunch();
          break;
        case 'EXPLOSION':
          this.audio.playExplosion(intensity);
          break;
        case 'ANAR_LOOP':
          this.audio.pulseAnarLoop();
          break;
        case 'SPARKLER_LOOP':
          this.audio.pulseSparklerLoop();
          break;
        case 'ROMAN_POP':
          this.audio.playRomanPop();
          break;
        case 'FINALE':
          this.audio.playFinaleBarrage();
          break;
        case 'FUSE':
          this.audio.playFuse();
          break;
        case 'ATOM_BLAST':
          this.audio.playAtomBlast();
          break;
        case 'LADI_POP':
          this.audio.playCrack(intensity);
          break;
        case 'SNAKE_FIZZ':
          this.audio.playSnakeFizz();
          break;
        case 'HYDROGEN_BLAST':
          this.audio.playHydrogenBlast();
          break;
        case 'CHAKRI_SPIN':
          this.audio.playChakri();
          break;
      }
    });

    this.setupListeners();
    this.init();
  }

  private setupListeners(): void {
    const unlockAudio = () => this.audio.unlock();
    window.addEventListener('click', unlockAudio, { once: true });
    window.addEventListener('keydown', unlockAudio, { once: true });

    // 1. Creator Mode Toggle (H key)
    const toggleCreatorMode = () => {
      this.isCreatorMode = !this.isCreatorMode;
      if (this.isCreatorMode) {
        this.hudElement.classList.add('hud-hidden');
        this.restoreHudBtn.classList.remove('hidden');
      } else {
        this.hudElement.classList.remove('hud-hidden');
        this.restoreHudBtn.classList.add('hidden');
      }
    };
    this.restoreHudBtn.addEventListener('click', toggleCreatorMode);

    // 2. Debug Tracker Skeleton (D key)
    const toggleDebug = () => {
      this.vision.showDebug = !this.vision.showDebug;
    };

    // 3. Audio Toggle (M key)
    const toggleAudio = () => {
      this.audio.unlock();
      const muted = this.audio.toggleMute();
      this.audioBtn.classList.toggle('is-muted', muted);
      this.audioBtn.setAttribute('aria-pressed', String(muted));
    };
    this.audioBtn.addEventListener('click', toggleAudio);

    // 3b. Mic in recordings (off by default: only firework sounds are recorded)
    const micBtn = document.getElementById('btn-mic') as HTMLButtonElement;
    let micOn = false;
    micBtn.addEventListener('click', async () => {
      try {
        micOn = await this.audio.setMicInRecording(!micOn);
      } catch (err) {
        console.warn('Microphone unavailable:', err);
        micOn = false;
        micBtn.title = 'Microphone is blocked. Allow it from the address bar to record your voice.';
      }
      micBtn.classList.toggle('is-on', micOn);
      micBtn.setAttribute('aria-pressed', String(micOn));
      if (micOn) micBtn.title = 'Your voice is included in recordings';
      else if (!micBtn.title.startsWith('Microphone is blocked')) micBtn.title = 'Include your voice in recordings';
    });

    // 4. Postcard Screenshot (S key)
    const takeSnap = () => {
      this.capture.takeScreenshot();
    };

    // 5. Video Reel Recording (R key)
    const toggleRecording = () => {
      this.audio.unlock();
      if (this.capture.isRecording) {
        this.capture.stopRecording();
      } else {
        const audioTrack = this.audio.getAudioStream();
        this.capture.startRecording(audioTrack);
      }
    };
    this.recordBtn.addEventListener('click', toggleRecording);

    // Configure capture callbacks
    let recordedSeconds = 0;
    this.capture.setCallbacks({
      onRecordingStart: () => {
        this.recordBtn.classList.add('recording');
        this.recordLabel.textContent = 'Stop';
        this.dismissReelPreview();
      },
      onRecordingStop: (_blob, videoUrl) => {
        this.recordBtn.classList.remove('recording');
        this.recordLabel.textContent = 'Record';
        this.recordTimer.textContent = '00:00';

        // Present Fog-Mirror Style Floating Preview Card
        this.showReelPreview(videoUrl, recordedSeconds);
      },
      onTimeUpdate: (elapsed, max) => {
        recordedSeconds = elapsed;
        const m = Math.floor(elapsed / 60).toString().padStart(2, '0');
        const s = Math.floor(elapsed % 60).toString().padStart(2, '0');
        const maxS = Math.floor(max % 60).toString().padStart(2, '0');
        this.recordTimer.textContent = `${m}:${s} / 00:${maxS}`;
      }
    });

    // Fog-Mirror Floating Preview Card Handlers
    this.reelSaveBtn.addEventListener('click', () => {
      this.capture.downloadCurrentReel();
    });

    this.reelDismissBtn.addEventListener('click', () => {
      this.dismissReelPreview();
    });

    const openFullDialog = () => {
      if (!this.recordedVideoUrl) return;
      this.reelDialogVideo.src = this.recordedVideoUrl;
      this.reelDialog.showModal();
      this.reelDialogVideo.currentTime = 0;
      this.reelDialogVideo.play().catch(() => {});
    };

    this.reelViewBtn.addEventListener('click', openFullDialog);
    this.reelPreviewThumbBtn.addEventListener('click', openFullDialog);

    // Full Reel Dialog Handlers
    const closeFullDialog = () => {
      this.reelDialog.close();
      this.reelDialogVideo.pause();
    };

    this.reelDialogCloseBtn.addEventListener('click', closeFullDialog);
    this.reelDialogSaveBtn.addEventListener('click', () => {
      this.capture.downloadCurrentReel();
    });

    // Global Keybindings
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (this.reelDialog.open) closeFullDialog();
        else this.dismissReelPreview();
      }
      if (e.key === 'h' || e.key === 'H') toggleCreatorMode();
      if (e.key === 'd' || e.key === 'D') toggleDebug();
      if (e.key === 'm' || e.key === 'M') toggleAudio();
      if (e.key === 's' || e.key === 'S') takeSnap();
      if (e.key === 'r' || e.key === 'R') toggleRecording();

      // Manual Testing Keys (1 to 9)
      const w = this.compositor.width;
      const h = this.compositor.height;
      const center = { x: w / 2, y: h / 2 };

      if (e.key === '1') {
        this.director.handleGestures([{ type: 'ROCKET', confidence: 1, triggerPoint: { x: w * 0.5, y: h * 0.8 }, handIndex: 0, isContinuous: false }], w, h);
      } else if (e.key === '2') {
        this.director.handleGestures([{ type: 'ANAR', confidence: 1, triggerPoint: { x: w * 0.5, y: h * 0.75 }, handIndex: 0, isContinuous: true }], w, h);
      } else if (e.key === '3') {
        this.director.handleGestures([{ type: 'STARBURST', confidence: 1, triggerPoint: center, handIndex: 0, isContinuous: false }], w, h);
      } else if (e.key === '4') {
        this.director.handleGestures([{ type: 'ROMAN_CANDLE', confidence: 1, triggerPoint: { x: w * 0.5, y: h * 0.7 }, handIndex: 0, isContinuous: false }], w, h);
      } else if (e.key === '5') {
        this.director.handleGestures([{ type: 'PHOOLJHADI', confidence: 1, triggerPoint: center, handIndex: 0, isContinuous: true }], w, h);
      } else if (e.key === '6') {
        this.triggerGrandFinale(w, h);
      } else if (e.key === '7') {
        this.director.handleGestures([{ type: 'ATOM_BOMB', confidence: 1, triggerPoint: { x: w * 0.5, y: h * 0.7 }, handIndex: 0, isContinuous: false }], w, h);
      } else if (e.key === '8') {
        this.director.handleGestures([{ type: 'LADI', confidence: 1, triggerPoint: { x: w * 0.5, y: h * 0.25 }, handIndex: 0, isContinuous: false }], w, h);
      } else if (e.key === '9') {
        this.director.handleGestures([{ type: 'SNAKE', confidence: 1, triggerPoint: { x: w * 0.5, y: h * 0.8 }, handIndex: 0, isContinuous: false }], w, h);
      } else if (e.key === '0') {
        this.director.handleGestures([{ type: 'CHAKRI', confidence: 1, triggerPoint: { x: w * 0.5, y: h * 0.6 }, handIndex: 0, isContinuous: false }], w, h);
      } else if (e.key === 'l' || e.key === 'L') {
        this.director.handleGestures([{ type: 'SKY_LANTERN', confidence: 1, triggerPoint: { x: w * (0.3 + Math.random() * 0.4), y: h * 0.75 }, handIndex: 0, isContinuous: false }], w, h);
      } else if (e.key === 'b' || e.key === 'B') {
        this.director.handleGestures([{ type: 'HYDROGEN_BOMB', confidence: 1, triggerPoint: { x: w * 0.5, y: h * 0.7 }, handIndex: -2, isContinuous: false }], w, h);
      } else if (e.key === 'p' || e.key === 'P') {
        this.director.handleGestures([{ type: 'PENCIL', confidence: 1, triggerPoint: { x: w * 0.3, y: h * 0.6 }, handIndex: 0, isContinuous: true, direction: { x: 1, y: -0.4 } }], w, h);
      }
    });

    // NOTE: Mouse click rocket trigger intentionally removed per user request.
    // Fireworks are now triggered exclusively through webcam hand gestures or hotkeys.
  }

  private showReelPreview(videoUrl: string, seconds: number): void {
    this.recordedVideoUrl = videoUrl;
    this.reelPreviewVideo.src = videoUrl;
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = Math.floor(seconds % 60).toString().padStart(2, '0');
    this.reelDuration.textContent = `${m}:${s}`;
    this.reelPreviewCard.classList.remove('hidden');
    this.reelPreviewVideo.play().catch(() => {});
  }

  private dismissReelPreview(): void {
    this.reelPreviewCard.classList.add('hidden');
    this.reelPreviewVideo.pause();
    this.reelPreviewVideo.src = '';
  }

  private triggerGrandFinale(w: number, h: number): void {
    this.director.handleGestures(
      [{ type: 'GRAND_FINALE', confidence: 1, triggerPoint: { x: w / 2, y: h / 2 }, handIndex: -1, isContinuous: false }],
      w,
      h
    );

    // After 1.4 seconds of rockets filling the sky, display the majestic "HAPPY DIWALI" centerpiece!
    window.clearTimeout(this.finaleTimeout);
    this.finaleTimeout = window.setTimeout(() => {
      this.finaleCenter.classList.remove('hidden');

      // Keep it up for 6.5 seconds of golden celebration, then fade out smoothly
      window.setTimeout(() => {
        this.finaleCenter.classList.add('hidden');
      }, 6500);
    }, 1400);
  }

  private async init(): Promise<void> {
    // Load the hand model in the background while the intro is showing
    const visionReady = this.vision.init().catch((err) => {
      console.error('Hand tracking failed to load:', err);
    });
    this.loop();

    // Browsers block sound until the user interacts, so the intro's Start
    // button unlocks audio and asks for the camera in the same click.
    const intro = document.getElementById('intro') as HTMLElement;
    const startBtn = document.getElementById('intro-start') as HTMLButtonElement;
    const note = document.getElementById('intro-note') as HTMLElement;

    startBtn.addEventListener('click', async () => {
      this.audio.unlock();
      startBtn.disabled = true;
      startBtn.textContent = 'Starting…';
      try {
        await this.compositor.startCamera();
      } catch (err) {
        console.error('Camera failed to start:', err);
        startBtn.disabled = false;
        startBtn.textContent = 'Try again';
        note.textContent = 'Camera is blocked. Allow it from the icon in the address bar, then try again.';
        note.classList.add('is-error');
        return;
      }
      intro.classList.add('is-leaving');
      window.setTimeout(() => intro.remove(), 450);
      await visionReady;
    });
  }

  private updateGuideFade(): void {
    this.guideBar ??= document.querySelector('.gesture-dock');
    if (!this.guideBar) return;
    const r = this.guideBar.getBoundingClientRect();
    // Only when the hand is actually over the guide (fingertips or palm inside it)
    let near = false;
    for (const hand of this.vision.detectedHands) {
      for (const i of [0, 4, 8, 9, 12, 16, 20]) {
        const p = hand.landmarks[i];
        if (p.x > r.left && p.x < r.right && p.y > r.top && p.y < r.bottom) {
          near = true;
          break;
        }
      }
      if (near) break;
    }
    if (near !== this.guideNear) {
      this.guideNear = near;
      this.guideBar.classList.toggle('is-faded', near);
    }
  }

  private drawBrand(): void {
    const ctx = this.compositor.ctx;
    const small = this.compositor.width <= 860;
    const x = small ? 14 : 26;
    const y = small ? 14 : 22;
    const nameSize = small ? 20 : 28;
    const subSize = small ? 13 : 15;

    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.textBaseline = 'top';
    // legibility shadow, then a soft glow pass on top
    ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
    ctx.shadowBlur = 12;
    ctx.shadowOffsetY = 1;
    ctx.font = `400 ${nameSize}px "Instrument Serif", Georgia, serif`;
    ctx.fillStyle = '#ffffff';
    ctx.fillText('Fireworks', x, y);
    ctx.shadowColor = 'rgba(255, 236, 200, 0.55)';
    ctx.shadowBlur = 18;
    ctx.shadowOffsetY = 0;
    ctx.fillText('Fireworks', x, y);

    const subY = y + nameSize * 0.98;
    ctx.font = `italic 400 ${subSize}px "Instrument Serif", Georgia, serif`;
    ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 1;
    ctx.fillStyle = '#ffc163';
    ctx.fillText('Diwali 2k26', x, subY);
    ctx.shadowColor = 'rgba(255, 170, 60, 0.85)';
    ctx.shadowBlur = 14;
    ctx.shadowOffsetY = 0;
    ctx.fillText('Diwali 2k26', x, subY);
    ctx.restore();
  }

  private loop = (): void => {
    const now = performance.now();
    const dt = Math.min((now - this.lastFrameTime) / 1000, 0.1);
    this.lastFrameTime = now;

    // 1. Draw atmospheric night camera background
    this.compositor.drawBackground();

    // 2. Process vision frame
    const activeGestures = this.vision.update(
      this.compositor.video,
      this.compositor.getVideoRect()
    );

    // Fade the gesture guide out of the way when a hand comes near it, so
    // crackers lit low on the screen aren't hidden behind it
    this.updateGuideFade();

    // Check if Grand Finale was recognized by gesture
    const isFinale = activeGestures.some((g) => g.type === 'GRAND_FINALE');
    if (isFinale) {
      this.triggerGrandFinale(this.compositor.width, this.compositor.height);
    } else {
      // 3. Dispatch other active gestures to Firework Director
      this.director.handleGestures(
        activeGestures,
        this.compositor.width,
        this.compositor.height
      );
    }

    // 4. Simulate & Render Particle Fireworks with Additive Blending & Lighting
    this.director.updateAndRender(dt, this.compositor.ctx);

    // Screen shake from big blasts
    const shake = this.director.shake;
    this.compositor.canvas.style.transform = shake > 0.01
      ? `translate(${((Math.random() - 0.5) * 18 * shake).toFixed(1)}px, ${((Math.random() - 0.5) * 18 * shake).toFixed(1)}px)`
      : '';

    // 5. Draw Debug skeleton if active
    this.vision.drawDebugSkeleton(this.compositor.ctx);

    // 6. Title, drawn on the canvas so it's in recordings and snapshots
    //    (buttons and the gesture guide are page overlays and never recorded)
    this.drawBrand();

    requestAnimationFrame(this.loop);
  };
}

window.addEventListener('DOMContentLoaded', () => {
  // Chromium supports SVG filters inside backdrop-filter (lens refraction on glass)
  if ((navigator as Navigator & { userAgentData?: unknown }).userAgentData) {
    document.documentElement.classList.add('lg-refract');
  }
  new FireworksApp();
});
