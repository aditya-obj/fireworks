/**
 * Video Compositor & Night-Sky Atmosphere Pipeline
 * Handles HD camera capture, DPR-aware canvas sizing, mirroring,
 * light night-time color grading, and stage rendering.
 */

export interface CompositorOptions {
  canvas: HTMLCanvasElement;
  video: HTMLVideoElement;
  dimming?: number; // 0.0 (pitch black) to 1.0 (full brightness)
  contrast?: number;
}

export class VideoCompositor {
  public canvas: HTMLCanvasElement;
  public ctx: CanvasRenderingContext2D;
  public video: HTMLVideoElement;
  public width: number = window.innerWidth;
  public height: number = window.innerHeight;
  public isCameraReady: boolean = false;
  public dimming: number = 0.85;
  public contrast: number = 1.06;
  private stream: MediaStream | null = null;

  constructor(options: CompositorOptions) {
    this.canvas = options.canvas;
    const ctx = this.canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Could not acquire 2D rendering context from stage canvas');
    this.ctx = ctx;
    this.video = options.video;
    if (options.dimming !== undefined) this.dimming = options.dimming;
    if (options.contrast !== undefined) this.contrast = options.contrast;

    this.resize();
    window.addEventListener('resize', () => {
      this.resize();
      void this.refitOrientation();
    });
    // mobile browsers resize the visible area when their toolbar shows/hides
    window.visualViewport?.addEventListener('resize', () => this.resize());
  }

  public resize(): void {
    // match the stage element (sized to the visible area via 100dvh)
    const box = this.canvas.getBoundingClientRect();
    this.width = Math.round(box.width) || window.innerWidth;
    this.height = Math.round(box.height) || window.innerHeight;

    // Render at device pixel ratio for a crisp image on retina screens,
    // capped at ~2560x1440 worth of pixels to keep 60fps rendering & recording.
    const dpr = window.devicePixelRatio || 1;
    const maxPixels = 2560 * 1440;
    let scale = dpr;
    if (this.width * this.height * scale * scale > maxPixels) {
      scale = Math.sqrt(maxPixels / (this.width * this.height));
    }
    this.canvas.width = Math.round(this.width * scale);
    this.canvas.height = Math.round(this.height * scale);
    this.ctx.setTransform(scale, 0, 0, scale, 0, 0);
    this.ctx.imageSmoothingEnabled = true;
    this.ctx.imageSmoothingQuality = 'high';
  }

  public async startCamera(): Promise<MediaStream> {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('Camera API (getUserMedia) unavailable in this browser');
    }

    // Ask for the camera in the same orientation as the screen. On an upright
    // phone a landscape request gives a wide image that then has to be cropped
    // hard to fill the tall screen (looks zoomed-in); a portrait request doesn't.
    this.portrait = this.isPortrait();
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { ...this.sizeConstraints(this.portrait), frameRate: { ideal: 60 }, facingMode: 'user' },
      audio: false
    });

    const track = stream.getVideoTracks()[0];
    try {
      const caps = track.getCapabilities?.() as MediaTrackCapabilities & { zoom?: { min: number } };
      const advanced: Record<string, number>[] = [];
      if (caps?.zoom) advanced.push({ zoom: caps.zoom.min }); // widest field of view
      // Landscape screens: lock to the camera's full resolution. (Skipped in portrait:
      // capabilities are reported in sensor/landscape terms and would force a wide crop.)
      const full = !this.portrait && caps?.width?.max && caps?.height?.max
        ? { width: { ideal: caps.width.max }, height: { ideal: caps.height.max } }
        : {};
      await track.applyConstraints({ ...full, frameRate: { ideal: 60 }, advanced: advanced as MediaTrackConstraintSet[] });
    } catch (err) {
      console.warn('Could not apply camera constraints:', err);
    }
    const settings = track.getSettings();
    console.info(`Camera: ${settings.width}x${settings.height} @ ${settings.frameRate}fps`);

    this.stream = stream;
    this.video.srcObject = stream;
    await this.video.play();
    this.isCameraReady = true;
    return stream;
  }

  private portrait = false;

  private isPortrait(): boolean {
    return window.innerHeight > window.innerWidth;
  }

  private sizeConstraints(portrait: boolean): MediaTrackConstraints {
    return portrait
      ? { width: { ideal: 1080 }, height: { ideal: 1920 } }
      : { width: { ideal: 3840 }, height: { ideal: 2160 } };
  }

  /** When the phone is rotated, ask the camera for the new orientation */
  private async refitOrientation(): Promise<void> {
    const track = this.stream?.getVideoTracks()[0];
    const portrait = this.isPortrait();
    if (!track || portrait === this.portrait) return;
    this.portrait = portrait;
    try {
      await track.applyConstraints({ ...this.sizeConstraints(portrait), frameRate: { ideal: 60 } });
    } catch (err) {
      console.warn('Could not re-fit camera after rotation:', err);
    }
  }

  public stopCamera(): void {
    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }
    this.video.srcObject = null;
    this.isCameraReady = false;
  }

  /**
   * Screen-space rectangle (CSS px, unmirrored) the camera frame occupies.
   * Fills the screen edge to edge with the smallest possible crop (no bars).
   * May extend past the screen edges; hand landmarks are mapped through it.
   */
  public getVideoRect(): { x: number; y: number; w: number; h: number } {
    const { width, height, video } = this;
    if (!video.videoWidth) return { x: 0, y: 0, w: width, h: height };
    const videoRatio = video.videoWidth / video.videoHeight;
    if (width / height > videoRatio) {
      const h = width / videoRatio;
      return { x: 0, y: (height - h) / 2, w: width, h };
    }
    const w = height * videoRatio;
    return { x: (width - w) / 2, y: 0, w, h: height };
  }

  /**
   * Draws the mirrored camera frame edge to edge.
   */
  public drawBackground(): void {
    const { ctx, width, height, video } = this;

    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#05060a';
    ctx.fillRect(0, 0, width, height);

    if (this.isCameraReady && video.videoWidth > 0) {
      const rect = this.getVideoRect();
      const grade = `brightness(${this.dimming}) contrast(${this.contrast}) saturate(1.05)`;

      ctx.translate(width, 0);
      ctx.scale(-1, 1);
      // Mirrored x for the rect
      const mx = width - rect.x - rect.w;

      ctx.filter = grade;
      ctx.drawImage(video, mx, rect.y, rect.w, rect.h);
      ctx.filter = 'none';

      // Subtle cool night tint
      ctx.fillStyle = 'rgba(8, 12, 30, 0.12)';
      ctx.fillRect(0, 0, width, height);

      // Soft edge falloff (drawn here, not as a page overlay, so recordings
      // match the screen and the title can sit above it at full brightness)
      const lin = ctx.createLinearGradient(0, 0, 0, height);
      lin.addColorStop(0, 'rgba(0,0,0,0.32)');
      lin.addColorStop(0.18, 'rgba(0,0,0,0)');
      lin.addColorStop(0.78, 'rgba(0,0,0,0)');
      lin.addColorStop(1, 'rgba(0,0,0,0.42)');
      ctx.fillStyle = lin;
      ctx.fillRect(0, 0, width, height);
      const rad = ctx.createRadialGradient(width / 2, height / 2, Math.min(width, height) * 0.45, width / 2, height / 2, Math.hypot(width, height) / 2);
      rad.addColorStop(0, 'rgba(0,0,0,0)');
      rad.addColorStop(1, 'rgba(0,0,0,0.32)');
      ctx.fillStyle = rad;
      ctx.fillRect(0, 0, width, height);
    }

    ctx.restore();
  }
}
