/**
 * Reel Recording & Postcard Screenshot Engine
 * Uses MediaRecorder with visual canvas stream + procedural audio track.
 * Supports in-browser video preview modal before download.
 */

export interface CaptureCallbacks {
  onRecordingStart?: () => void;
  onRecordingStop?: (videoBlob: Blob, videoUrl: string) => void;
  onTimeUpdate?: (elapsedSeconds: number, maxSeconds: number) => void;
}

export class CaptureEngine {
  private canvas: HTMLCanvasElement;
  private recorder: MediaRecorder | null = null;
  private recordedChunks: Blob[] = [];
  public isRecording: boolean = false;
  private startTime: number = 0;
  private timerInterval: number = 0;
  private readonly MAX_DURATION_SEC: number = 30;
  private callbacks: CaptureCallbacks = {};
  public latestBlob: Blob | null = null;
  public latestVideoUrl: string | null = null;
  public selectedExtension: string = 'mp4';

  constructor(canvas: HTMLCanvasElement, callbacks?: CaptureCallbacks) {
    this.canvas = canvas;
    if (callbacks) this.callbacks = callbacks;
  }

  public setCallbacks(callbacks: CaptureCallbacks): void {
    this.callbacks = callbacks;
  }

  public startRecording(audioTrack: MediaStreamTrack | null): boolean {
    if (this.isRecording) return false;

    try {
      // 60 FPS capture matching display refresh for buttery-smooth video
      const canvasStream = this.canvas.captureStream(60);
      const combinedStream = new MediaStream();

      canvasStream.getVideoTracks().forEach((track) => combinedStream.addTrack(track));

      if (audioTrack) {
        combinedStream.addTrack(audioTrack);
      }

      // Prioritize Hardware-Accelerated H.264 (MP4) on macOS VideoToolbox, then WebM
      const candidates = [
        { mime: 'video/mp4;codecs=avc1.42E01E,mp4a.40.2', ext: 'mp4' },
        { mime: 'video/mp4;codecs=avc1', ext: 'mp4' },
        { mime: 'video/mp4', ext: 'mp4' },
        { mime: 'video/webm;codecs=h264,opus', ext: 'mp4' },
        { mime: 'video/webm;codecs=vp8,opus', ext: 'webm' },
        { mime: 'video/webm', ext: 'webm' },
        { mime: 'video/webm;codecs=vp9,opus', ext: 'webm' }
      ];

      let selectedMime = '';
      let selectedExt = 'mp4';
      for (const cand of candidates) {
        if (MediaRecorder.isTypeSupported(cand.mime)) {
          selectedMime = cand.mime;
          selectedExt = cand.ext;
          break;
        }
      }
      this.selectedExtension = selectedExt;

      const options: MediaRecorderOptions = {
        mimeType: selectedMime || undefined,
        videoBitsPerSecond: 8_000_000 // 8 Mbps high-bitrate Full HD
      };

      this.recorder = new MediaRecorder(combinedStream, options);
      this.recordedChunks = [];

      this.recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          this.recordedChunks.push(e.data);
        }
      };

      this.recorder.onstop = () => {
        this.finishRecording();
      };

      // 1000ms timeslice to avoid rapid GOP keyframe flushes that cause playback judder
      this.recorder.start(1000);
      this.isRecording = true;
      this.startTime = performance.now();

      this.callbacks.onRecordingStart?.();

      this.timerInterval = window.setInterval(() => {
        if (!this.isRecording) return;
        const elapsed = (performance.now() - this.startTime) / 1000;
        this.callbacks.onTimeUpdate?.(elapsed, this.MAX_DURATION_SEC);

        if (elapsed >= this.MAX_DURATION_SEC) {
          this.stopRecording();
        }
      }, 200);

      return true;
    } catch (e) {
      console.error('Failed to start MediaRecorder:', e);
      return false;
    }
  }

  public stopRecording(): void {
    if (!this.isRecording || !this.recorder) return;
    this.isRecording = false;
    window.clearInterval(this.timerInterval);

    if (this.recorder.state !== 'inactive') {
      this.recorder.stop();
    }
  }

  private finishRecording(): void {
    if (this.recordedChunks.length === 0) return;

    if (this.latestVideoUrl) {
      URL.revokeObjectURL(this.latestVideoUrl);
    }

    const blob = new Blob(this.recordedChunks, {
      type: this.recorder?.mimeType || 'video/webm'
    });
    this.latestBlob = blob;
    this.latestVideoUrl = URL.createObjectURL(blob);

    // Pass blob and URL to UI modal instead of direct auto-download!
    this.callbacks.onRecordingStop?.(blob, this.latestVideoUrl);
  }

  public downloadCurrentReel(filename?: string): void {
    if (!this.latestVideoUrl) return;
    const a = document.createElement('a');
    a.href = this.latestVideoUrl;
    const now = new Date();
    const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
    a.download = filename || `Diwali-Fireworks-${timestamp}.${this.selectedExtension}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  public takeScreenshot(): void {
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = this.canvas.width;
    tempCanvas.height = this.canvas.height;
    const tCtx = tempCanvas.getContext('2d');
    if (!tCtx) return;

    tCtx.drawImage(this.canvas, 0, 0);

    const pad = tempCanvas.width * 0.035;
    tCtx.save();
    tCtx.textAlign = 'right';
    tCtx.fillStyle = '#FFD700';
    tCtx.shadowColor = 'rgba(255, 215, 0, 0.8)';
    tCtx.shadowBlur = 15;
    tCtx.font = `bold ${Math.max(22, tempCanvas.width * 0.024)}px "Cinzel", serif`;
    tCtx.fillText('✨ Happy Diwali ✨', tempCanvas.width - pad, tempCanvas.height - pad - 18);

    tCtx.fillStyle = '#E2E8F0';
    tCtx.shadowBlur = 0;
    tCtx.font = `${Math.max(12, tempCanvas.width * 0.012)}px "Plus Jakarta Sans", sans-serif`;
    tCtx.fillText('Fireworks 2026', tempCanvas.width - pad, tempCanvas.height - pad);
    tCtx.restore();

    tempCanvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const now = new Date();
      const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
      a.download = `Diwali-Postcard-${timestamp}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.setTimeout(() => URL.revokeObjectURL(url), 2000);
    }, 'image/png');
  }
}
