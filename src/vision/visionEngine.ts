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
            // slightly lower so hands near the frame edge (partly cut off) still track
            minHandDetectionConfidence: 0.5,
            minHandPresenceConfidence: 0.45,
            minTrackingConfidence: 0.45
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
  public update(
    video: HTMLVideoElement,
    rect: { x: number; y: number; w: number; h: number }
  ): DetectedGesture[] {
    if (!this.isReady || !this.landmarker || video.readyState < 2) {
      return [];
    }

    const currentTime = video.currentTime;
    // Only detect if video time has advanced
    if (currentTime !== this.lastVideoTime) {
      this.lastVideoTime = currentTime;
      const now = performance.now();
      const result: HandLandmarkerResult = this.landmarker.detectForVideo(video, now);
      this.detectedHands = this.parsePoses(result, rect, now);
      this.activeGestures = this.classifier.classify(this.detectedHands, rect.w);
      return this.activeGestures;
    }

    // Between camera frames, repeat only continuous gestures (Anar, Phooljhadi).
    // One-shots were already returned once; repeating them would double-fire.
    return this.activeGestures.filter((g) => g.isContinuous);
  }

  /** Per-hand memory for smoothing and hysteresis, keyed by stable hand id */
  private handMemory: Map<number, {
    screen: ScreenLandmark[];
    world: ScreenLandmark[];
    fingers: Record<'index' | 'middle' | 'ring' | 'pinky', FingerState>;
    thumb: boolean;
    pinching: boolean;
    seen: number;
    filters: { screen: OneEuro[]; world: OneEuro[] };
  }> = new Map();

  /**
   * Converts landmarks into mirrored screen coordinates (for positions) and
   * classifies finger states from MediaPipe's 3D world landmarks (for shape).
   * World landmarks are metric and camera-angle independent, so a tilted or
   * forward-pointing hand isn't misread because of foreshortening.
   */
  private parsePoses(
    result: HandLandmarkerResult,
    rect: { x: number; y: number; w: number; h: number },
    now: number
  ): HandPose[] {
    const hands: HandPose[] = [];
    const usedIds = new Set<number>();

    result.landmarks.forEach((rawMarks, idx) => {
      const handednessRaw = result.handedness[idx]?.[0]?.categoryName;
      // Invert handedness because the view is mirrored
      const handedness: 'Left' | 'Right' = handednessRaw === 'Left' ? 'Right' : 'Left';

      // Stable id per physical hand (MediaPipe's list order can swap between frames)
      let id = handedness === 'Left' ? 0 : 1;
      if (usedIds.has(id)) id = id === 0 ? 1 : 0;
      usedIds.add(id);
      const mem = this.handMemory.get(id);
      const fresh = !mem || now - mem.seen > 250;

      // Screen-space landmarks (mirrored, mapped into the drawn video frame)
      const rawScreen: ScreenLandmark[] = rawMarks.map((lm) => ({
        x: rect.x + (1 - lm.x) * rect.w,
        y: rect.y + lm.y * rect.h,
        z: lm.z
      }));
      const worldRaw = result.worldLandmarks?.[idx];
      const rawWorld: ScreenLandmark[] = worldRaw
        ? worldRaw.map((lm) => ({ x: lm.x, y: lm.y, z: lm.z }))
        : rawScreen.map((p) => ({ x: p.x, y: p.y, z: 0 }));

      // One Euro filter: heavy smoothing when the hand is still (kills jitter, which
      // matters most when you're far away and the hand is small), light smoothing
      // when it moves fast (no lag). Screen coords are filtered in frame-width units
      // so the filter behaves the same at any distance or window size.
      const filters = fresh
        ? {
            screen: Array.from({ length: 63 }, () => new OneEuro(1.0, 4.0)),
            world: Array.from({ length: 63 }, () => new OneEuro(1.2, 25.0))
          }
        : mem!.filters;
      const t = now / 1000;
      const sc = rect.w || 1;
      const screenMarks: ScreenLandmark[] = rawScreen.map((p, i) => ({
        x: filters.screen[i * 3].filter(p.x / sc, t) * sc,
        y: filters.screen[i * 3 + 1].filter(p.y / sc, t) * sc,
        z: filters.screen[i * 3 + 2].filter(p.z, t)
      }));
      const world: ScreenLandmark[] = rawWorld.map((p, i) => ({
        x: filters.world[i * 3].filter(p.x, t),
        y: filters.world[i * 3 + 1].filter(p.y, t),
        z: filters.world[i * 3 + 2].filter(p.z, t)
      }));

      const wrist = screenMarks[0];
      const indexMcp = screenMarks[5];
      const pinkyMcp = screenMarks[17];
      const palmCenter: ScreenLandmark = {
        x: (wrist.x + indexMcp.x + pinkyMcp.x) / 3,
        y: (wrist.y + indexMcp.y + pinkyMcp.y) / 3,
        z: (wrist.z + indexMcp.z + pinkyMcp.z) / 3
      };

      // Screen-space hand size (for trigger offsets and two-hand distances)
      const handSize = Math.max(1, dist2(screenMarks[9], wrist));

      // How much the fingers are moving relative to the wrist (opening/closing
      // the hand), and how much the whole hand is moving
      let fingerMotion = 0;
      let handMotion = 0;
      if (!fresh) {
        // ~1.5px of leftover tracking noise is ignored, so a small, far-away hand
        // that's holding still doesn't count as "moving"
        const NOISE_PX = 1.5;
        const pw = mem!.screen[0];
        handMotion = Math.max(0, dist2(pw, wrist) - NOISE_PX) / handSize;
        for (const k of [4, 8, 12, 16, 20]) {
          const p0 = mem!.screen[k];
          const p1 = screenMarks[k];
          const d = Math.hypot((p1.x - wrist.x) - (p0.x - pw.x), (p1.y - wrist.y) - (p0.y - pw.y));
          fingerMotion += Math.max(0, d - NOISE_PX) / handSize;
        }
        fingerMotion /= 5;
      }
      // World-space hand size (wrist to middle knuckle, ~9cm)
      const worldSize = Math.max(1e-6, dist3(world[9], world[0]));

      const prev = fresh ? undefined : mem!.fingers;
      const fingers = {
        index: fingerState(world, 0, 5, 6, 7, 8, prev?.index),
        middle: fingerState(world, 0, 9, 10, 11, 12, prev?.middle),
        ring: fingerState(world, 0, 13, 14, 15, 16, prev?.ring),
        pinky: fingerState(world, 0, 17, 18, 19, 20, prev?.pinky)
      };
      const thumb = thumbExtended(world, worldSize, fresh ? undefined : mem!.thumb);

      const extendedFingers = {
        index: fingers.index === 'extended',
        middle: fingers.middle === 'extended',
        ring: fingers.ring === 'extended',
        pinky: fingers.pinky === 'extended',
        thumb
      };
      const curledFingers = {
        index: fingers.index === 'curled',
        middle: fingers.middle === 'curled',
        ring: fingers.ring === 'curled',
        pinky: fingers.pinky === 'curled'
      };

      // 👌 Pinch: thumb & index tips touching (3D), other fingers up
      // 🤏 / 👌 Pinch: thumb tip meets the index *tip* (not its side, which is a
      // finger heart), with the index reaching out (not curled into a fist)
      const pinchRatio = dist3(world[4], world[8]) / worldSize;
      const thumbToIndexMid = Math.min(dist3(world[4], world[6]), dist3(world[4], world[7])) / worldSize;
      const indexReach = dist3(world[8], world[0]) / worldSize;
      const wasPinching = !fresh && mem!.pinching;
      const isPinching =
        pinchRatio < (wasPinching ? 0.42 : 0.3) &&
        pinchRatio <= thumbToIndexMid &&
        indexReach > (wasPinching ? 1.05 : 1.15);

      this.handMemory.set(id, {
        screen: screenMarks,
        world,
        fingers,
        thumb,
        pinching: isPinching,
        seen: now,
        filters
      });

      hands.push({
        id,
        handedness,
        landmarks: screenMarks,
        rawLandmarks: rawMarks,
        extendedFingers,
        curledFingers,
        handSize,
        fingerMotion,
        handMotion,
        indexReach,
        thumbReach: dist3(world[4], world[0]) / worldSize,
        thumbToIndexMid,
        thumbToIndexTip: pinchRatio,
        palmCenter,
        pinchDistance: pinchRatio * handSize,
        isPinching
      });
    });

    return hands;
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

type FingerState = 'extended' | 'curled' | 'between';

function dist2(a: ScreenLandmark, b: ScreenLandmark): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function dist3(a: ScreenLandmark, b: ScreenLandmark): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

/** Angle at joint b (degrees) between segments b→a and b→c; 180 = straight */
function jointAngle(a: ScreenLandmark, b: ScreenLandmark, c: ScreenLandmark): number {
  const v1x = a.x - b.x, v1y = a.y - b.y, v1z = a.z - b.z;
  const v2x = c.x - b.x, v2y = c.y - b.y, v2z = c.z - b.z;
  const d = Math.hypot(v1x, v1y, v1z) * Math.hypot(v2x, v2y, v2z);
  if (d === 0) return 180;
  const cos = Math.max(-1, Math.min(1, (v1x * v2x + v1y * v2y + v1z * v2z) / d));
  return (Math.acos(cos) * 180) / Math.PI;
}

/**
 * Finger state from 3D joint angles, with hysteresis: once a finger is
 * extended or curled it takes a clear change to leave that state, so noisy
 * frames don't flip it back and forth.
 */
function fingerState(
  w: ScreenLandmark[],
  wrist: number, mcp: number, pip: number, dip: number, tip: number,
  prev?: FingerState
): FingerState {
  const mcpAngle = jointAngle(w[wrist], w[mcp], w[pip]);
  const pipAngle = jointAngle(w[mcp], w[pip], w[dip]);
  const dipAngle = jointAngle(w[pip], w[dip], w[tip]);
  const bend = (180 - pipAngle) + (180 - dipAngle); // 0 straight, ~180+ fully folded

  const extLimit = prev === 'extended' ? 55 : 45;
  const mcpLimit = prev === 'extended' ? 115 : 130;
  if (bend < extLimit && mcpAngle > mcpLimit) return 'extended';

  const curlLimit = prev === 'curled' ? 85 : 110;
  if (bend > curlLimit || mcpAngle < 95) return 'curled';
  return 'between';
}

/** Thumb is out when it's straight and its tip is away from the palm */
function thumbExtended(w: ScreenLandmark[], size: number, prev?: boolean): boolean {
  const straight = jointAngle(w[2], w[3], w[4]) > (prev ? 125 : 135);
  const away = dist3(w[4], w[5]) / size > (prev ? 0.38 : 0.45) &&
    dist3(w[4], w[17]) / size > (prev ? 0.72 : 0.8);
  return straight && away;
}

/**
 * One Euro filter (Casiez et al.): an adaptive low-pass filter. The cutoff
 * rises with speed, so slow/still input is smoothed hard and fast motion
 * passes through with little lag.
 */
class OneEuro {
  private x: number | null = null;
  private dx = 0;
  private t = 0;
  constructor(private minCutoff: number, private beta: number, private dCutoff = 1.0) {}

  private static alpha(cutoff: number, dt: number): number {
    const tau = 1 / (2 * Math.PI * cutoff);
    return 1 / (1 + tau / dt);
  }

  filter(v: number, t: number): number {
    if (this.x === null) {
      this.x = v;
      this.t = t;
      return v;
    }
    const dt = Math.max(1e-3, t - this.t);
    this.t = t;
    const rawDx = (v - this.x) / dt;
    this.dx += OneEuro.alpha(this.dCutoff, dt) * (rawDx - this.dx);
    const cutoff = this.minCutoff + this.beta * Math.abs(this.dx);
    this.x += OneEuro.alpha(cutoff, dt) * (v - this.x);
    return this.x;
  }
}

