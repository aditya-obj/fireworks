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

    // Request HD; MediaPipe downsamples internally so tracking cost stays low
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: 1920 },
        height: { ideal: 1080 },
        frameRate: { ideal: 60 },
        facingMode: 'user'
      },
      audio: false
    });

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
   * Draws the mirrored, atmospheric night-sky webcam background
   */
  public drawBackground(): void {
    const { ctx, width, height, video } = this;

    // Reset transform & composite operation
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';

    // 1. Fill deep midnight dark background
    ctx.fillStyle = '#040714';
    ctx.fillRect(0, 0, width, height);

    // 2. Draw webcam video if available
    if (this.isCameraReady && video.videoWidth > 0) {
      ctx.save();
      // Mirror horizontally so gestures feel natural (like looking in a mirror)
      ctx.translate(width, 0);
      ctx.scale(-1, 1);

      // Aspect-ratio cover calculation
      const videoRatio = video.videoWidth / video.videoHeight;
      const screenRatio = width / height;
      let drawW: number;
      let drawH: number;
      let drawX: number;
      let drawY: number;

      if (screenRatio > videoRatio) {
        drawW = width;
        drawH = width / videoRatio;
        drawX = 0;
        drawY = (height - drawH) / 2;
      } else {
        drawH = height;
        drawW = height * videoRatio;
        drawX = (width - drawW) / 2;
        drawY = 0;
      }

      // Atmospheric Night-Sky Filter: dimming + contrast + slight blue tint
      ctx.filter = `brightness(${this.dimming}) contrast(${this.contrast}) saturate(1.05)`;
      ctx.drawImage(video, drawX, drawY, drawW, drawH);
      ctx.filter = 'none';

      // Subtle cool night tint
      ctx.fillStyle = 'rgba(8, 12, 30, 0.12)';
      ctx.fillRect(0, 0, width, height);

      ctx.restore();
    }

    ctx.restore();
  }
}
