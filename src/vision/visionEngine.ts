import {
  FilesetResolver,
  HandLandmarker,
  HandLandmarkerResult
} from '@mediapipe/tasks-vision';
import {
  HandPose,
  ScreenLandmark,
  DetectedGesture
} from './gestureTypes';
import { GestureClassifier } from './gestureClassifier';

const LOCAL_WASM = '/wasm';
const CDN_WASM = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm';

const LOCAL_MODEL = '/models/hand_landmarker.task';
const CDN_MODEL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

export class VisionEngine {
  private landmarker: HandLandmarker | null = null;
  private classifier: GestureClassifier = new GestureClassifier();
  public isReady: boolean = false;
  private lastVideoTime: number = -1;
  public detectedHands: HandPose[] = [];
  public activeGestures: DetectedGesture[] = [];
  public showDebug: boolean = false;

  public async init(onProgress?: (msg: string) => void): Promise<void> {
    onProgress?.('Loading Vision WebAssembly...');

    let vision;
    try {
      vision = await FilesetResolver.forVisionTasks(LOCAL_WASM);
    } catch {
      console.warn('Local WASM failed, falling back to CDN...');
      vision = await FilesetResolver.forVisionTasks(CDN_WASM);
    }

    onProgress?.('Loading Hand Landmarker model...');
    let landmarkerInstance: HandLandmarker | null = null;

    // Try GPU with local model, fallback to CDN, fallback to CPU
    const modelPaths = [LOCAL_MODEL, CDN_MODEL];
    const delegates: ('GPU' | 'CPU')[] = ['GPU', 'CPU'];

    for (const modelPath of modelPaths) {
      for (const delegate of delegates) {
        try {
          landmarkerInstance = await HandLandmarker.createFromOptions(vision, {
            baseOptions: {
              modelAssetPath: modelPath,
              delegate
            },
            runningMode: 'VIDEO',
            numHands: 2,
            minHandDetectionConfidence: 0.55,
            minHandPresenceConfidence: 0.55,
            minTrackingConfidence: 0.55
          });
          if (landmarkerInstance) break;
        } catch (e) {
          console.warn(`Landmarker init attempt failed (${modelPath}, ${delegate}):`, e);
        }
      }
      if (landmarkerInstance) break;
    }

    if (!landmarkerInstance) {
      throw new Error('Failed to initialize HandLandmarker on any delegate/source');
    }

    this.landmarker = landmarkerInstance;
    this.isReady = true;
    onProgress?.('Vision Engine Ready');
  }

  /**
   * Process a new video frame and extract poses & gestures
   */
  public update(video: HTMLVideoElement, screenW: number, screenH: number): DetectedGesture[] {
    if (!this.isReady || !this.landmarker || video.readyState < 2) {
      return [];
    }

    const currentTime = video.currentTime;
    // Only detect if video time has advanced
    if (currentTime !== this.lastVideoTime) {
      this.lastVideoTime = currentTime;
      const now = performance.now();
      const result: HandLandmarkerResult = this.landmarker.detectForVideo(video, now);
      this.detectedHands = this.parsePoses(result, screenW, screenH);
      this.activeGestures = this.classifier.classify(this.detectedHands, screenW);
    }

    return this.activeGestures;
  }

  /**
   * Converts raw normalized landmarks into screen-space pixel coordinates
   * with horizontal mirroring applied.
   */
  private parsePoses(
    result: HandLandmarkerResult,
    screenW: number,
    screenH: number
  ): HandPose[] {
    const hands: HandPose[] = [];

    result.landmarks.forEach((rawMarks, idx) => {
      const handednessRaw = result.handedness[idx]?.[0]?.categoryName;
      // Invert handedness because the view is mirrored
      const handedness: 'Left' | 'Right' = handednessRaw === 'Left' ? 'Right' : 'Left';

      // Transform normalized coords into mirrored screen pixels
      const screenMarks: ScreenLandmark[] = rawMarks.map((lm) => ({
        x: (1 - lm.x) * screenW, // Horizontal mirror
        y: lm.y * screenH,
        z: lm.z
      }));

      // Calculate Palm Center (average of wrist 0, index MCP 5, pinky MCP 17)
      const wrist = screenMarks[0];
      const indexMcp = screenMarks[5];
      const pinkyMcp = screenMarks[17];
      const palmCenter: ScreenLandmark = {
        x: (wrist.x + indexMcp.x + pinkyMcp.x) / 3,
        y: (wrist.y + indexMcp.y + pinkyMcp.y) / 3,
        z: (wrist.z + indexMcp.z + pinkyMcp.z) / 3
      };

      // Rotation-invariant finger extension checks using Euclidean distances
      const extendedFingers = {
        index: this.isFingerExtended(screenMarks, 5, 6, 8, wrist),
        middle: this.isFingerExtended(screenMarks, 9, 10, 12, wrist),
        ring: this.isFingerExtended(screenMarks, 13, 14, 16, wrist),
        pinky: this.isFingerExtended(screenMarks, 17, 18, 20, wrist),
        thumb: this.isThumbExtended(screenMarks, pinkyMcp)
      };

      // Pinch distance between Thumb tip (4) and Index tip (8)
      const thumbTip = screenMarks[4];
      const indexTip = screenMarks[8];
      const pinchDistance = Math.hypot(thumbTip.x - indexTip.x, thumbTip.y - indexTip.y);
      const isPinching = pinchDistance < Math.max(38, screenW * 0.035);

      hands.push({
        handedness,
        landmarks: screenMarks,
        rawLandmarks: rawMarks,
        extendedFingers,
        palmCenter,
        pinchDistance,
        isPinching
      });
    });

    return hands;
  }

  /**
   * Rotation-invariant check: distance(tip, wrist) > distance(pip, wrist) * 1.15
   */
  private isFingerExtended(
    marks: ScreenLandmark[],
    mcpIdx: number,
    pipIdx: number,
    tipIdx: number,
    wrist: ScreenLandmark
  ): boolean {
    const tip = marks[tipIdx];
    const pip = marks[pipIdx];
    const mcp = marks[mcpIdx];

    const distTipWrist = Math.hypot(tip.x - wrist.x, tip.y - wrist.y);
    const distPipWrist = Math.hypot(pip.x - wrist.x, pip.y - wrist.y);
    const distTipMcp = Math.hypot(tip.x - mcp.x, tip.y - mcp.y);
    const distPipMcp = Math.hypot(pip.x - mcp.x, pip.y - mcp.y);

    return distTipWrist > distPipWrist * 1.12 && distTipMcp > distPipMcp * 1.1;
  }

  /**
   * Thumb extension: distance from thumb tip to pinky MCP
   */
  private isThumbExtended(marks: ScreenLandmark[], pinkyMcp: ScreenLandmark): boolean {
    const thumbTip = marks[4];
    const thumbIp = marks[3];
    const thumbMcp = marks[2];

    const distTipPinky = Math.hypot(thumbTip.x - pinkyMcp.x, thumbTip.y - pinkyMcp.y);
    const distIpPinky = Math.hypot(thumbIp.x - pinkyMcp.x, thumbIp.y - pinkyMcp.y);
    const distTipMcp = Math.hypot(thumbTip.x - thumbMcp.x, thumbTip.y - thumbMcp.y);
    const distIpMcp = Math.hypot(thumbIp.x - thumbMcp.x, thumbIp.y - thumbMcp.y);

    return distTipPinky > distIpPinky * 1.15 && distTipMcp > distIpMcp;
  }

  /**
   * Renders debug wireframe bone skeleton over hands
   */
  public drawDebugSkeleton(ctx: CanvasRenderingContext2D): void {
    if (!this.showDebug || this.detectedHands.length === 0) return;

    ctx.save();
    ctx.lineWidth = 2.5;

    const CONNECTIONS = [
      // Thumb
      [0, 1], [1, 2], [2, 3], [3, 4],
      // Index
      [0, 5], [5, 6], [6, 7], [7, 8],
      // Middle
      [5, 9], [9, 10], [10, 11], [11, 12],
      // Ring
      [9, 13], [13, 14], [14, 15], [15, 16],
      // Pinky
      [13, 17], [0, 17], [17, 18], [18, 19], [19, 20]
    ];

    for (const hand of this.detectedHands) {
      // Draw bones
      ctx.strokeStyle = hand.handedness === 'Right' ? 'rgba(0, 240, 255, 0.65)' : 'rgba(255, 215, 0, 0.65)';
      for (const [i, j] of CONNECTIONS) {
        const p1 = hand.landmarks[i];
        const p2 = hand.landmarks[j];
        if (p1 && p2) {
          ctx.beginPath();
          ctx.moveTo(p1.x, p1.y);
          ctx.lineTo(p2.x, p2.y);
          ctx.stroke();
        }
      }

      // Draw landmarks
      for (let i = 0; i < hand.landmarks.length; i++) {
        const pt = hand.landmarks[i];
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, i === 8 || i === 4 ? 6 : 3.5, 0, Math.PI * 2);
        ctx.fillStyle = i === 8 ? '#ff3366' : i === 4 ? '#ffd700' : '#ffffff';
        ctx.fill();
      }

      // Draw Palm Center
      ctx.beginPath();
      ctx.arc(hand.palmCenter.x, hand.palmCenter.y, 8, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 215, 0, 0.85)';
      ctx.fill();
    }

    ctx.restore();
  }
}
