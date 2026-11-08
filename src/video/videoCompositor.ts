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
    window.addEventListener('resize', () => this.resize());
  }

  public resize(): void {
    this.width = window.innerWidth;
    this.height = window.innerHeight;

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

    // Ask for the highest resolution the camera offers, then lock to its max
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: 3840 },
        height: { ideal: 2160 },
        frameRate: { ideal: 60 },
        facingMode: 'user'
      },
      audio: false
    });

    const track = stream.getVideoTracks()[0];
    try {
      const caps = track.getCapabilities?.() as MediaTrackCapabilities & { zoom?: { min: number } };
      const advanced: Record<string, number>[] = [];
      if (caps?.zoom) advanced.push({ zoom: caps.zoom.min }); // widest field of view
      await track.applyConstraints({
        width: caps?.width?.max ? { ideal: caps.width.max } : undefined,
        height: caps?.height?.max ? { ideal: caps.height.max } : undefined,
        frameRate: { ideal: 60 },
        advanced: advanced as MediaTrackConstraintSet[]
      });
    } catch (err) {
      console.warn('Could not apply max camera constraints:', err);
    }
    const settings = track.getSettings();
    console.info(`Camera: ${settings.width}x${settings.height} @ ${settings.frameRate}fps`);

    this.stream = stream;
    this.video.srcObject = stream;
    await this.video.play();
    this.isCameraReady = true;
    return stream;
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
   * The whole frame is shown ("contain"), so nothing is cropped or zoomed.
   */
  public getVideoRect(): { x: number; y: number; w: number; h: number } {
    const { width, height, video } = this;
    if (!video.videoWidth) return { x: 0, y: 0, w: width, h: height };
    const videoRatio = video.videoWidth / video.videoHeight;
    if (width / height > videoRatio) {
      const w = height * videoRatio;
      return { x: (width - w) / 2, y: 0, w, h: height };
    }
    const h = width / videoRatio;
    return { x: 0, y: (height - h) / 2, w: width, h };
  }

  private fillCanvas: HTMLCanvasElement = document.createElement('canvas');

  /**
   * Draws the mirrored camera frame uncropped, with a soft blurred copy
   * filling any letterbox space so the stage stays edge-to-edge.
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

      // Letterbox fill: tiny downscaled copy stretched to cover = cheap blur
      if (rect.w < width - 1 || rect.h < height - 1) {
        const fc = this.fillCanvas;
        fc.width = 48;
        fc.height = Math.max(1, Math.round(48 * (video.videoHeight / video.videoWidth)));
        fc.getContext('2d')!.drawImage(video, 0, 0, fc.width, fc.height);
        const cover = Math.max(width / rect.w, height / rect.h);
        const cw = rect.w * cover;
        const ch = rect.h * cover;
        ctx.filter = 'brightness(0.45) saturate(1.2)';
        ctx.drawImage(fc, (width - cw) / 2, (height - ch) / 2, cw, ch);
      }

      ctx.filter = grade;
      ctx.drawImage(video, mx, rect.y, rect.w, rect.h);
      ctx.filter = 'none';

      // Subtle cool night tint
      ctx.fillStyle = 'rgba(8, 12, 30, 0.12)';
      ctx.fillRect(0, 0, width, height);
    }

    ctx.restore();
  }
}
