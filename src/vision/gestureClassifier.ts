import {
  GestureType,
  HandPose,
  DetectedGesture
} from './gestureTypes';

interface Pending {
  type: GestureType;
  since: number;
  misses: number; // consecutive camera frames where the pose wasn't seen
  last?: DetectedGesture; // last emitted continuous gesture (replayed during short dropouts)
  fired?: boolean; // a once-per-hold gesture already fired during this hold
}

/**
 * Turns per-frame hand poses into gesture events.
 *
 * Accuracy rules:
 * - Every gesture needs an exact finger pattern (extended / curled), so
 *   half-bent or transitional poses never match the wrong gesture.
 * - A pose must be held briefly before it fires, which skips the frames
 *   in between two poses.
 * - A couple of noisy frames don't reset a pose that's being held, and a
 *   continuous effect (Anar, Phooljhadi) doesn't flicker off during them.
 */
export class GestureClassifier {
  private pending: Map<number, Pending> = new Map(); // key: hand id, -1 namaste, -2 hydrogen
  /** Recent fingertip positions per hand for "is the hand travelling" (never cleared on a circle) */
  private travel: Map<number, { x: number; y: number; t: number }[]> = new Map();
  private lastFiredTime: Map<string, number> = new Map();

  private readonly COOLDOWNS: Record<GestureType, number> = {
    NONE: 0,
    ROCKET: 500,
    ANAR: 0, // continuous
    STARBURST: 850,
    ROMAN_CANDLE: 300,
    PHOOLJHADI: 0, // continuous
    ATOM_BOMB: 1600,
    LADI: 2800,
    SNAKE: 2500,
    CHAKRI: 2500,
    PENCIL: 0, // continuous
    SKY_LANTERN: 1500,
    HYDROGEN_BOMB: 5000,
    GRAND_FINALE: 4000
  };

  private readonly HOLD_ONE_SHOT_MS = 130;
  /**
   * Long-lasting crackers fire once per hold: keep the pose and nothing more
   * happens; lower your hand or change pose to light another. Rocket, Starburst,
   * Roman Candle and Lantern keep firing while held (a stream of lanterns).
   */
  private readonly ONCE_PER_HOLD = new Set<GestureType>([
    'CHAKRI', 'SNAKE', 'LADI', 'ATOM_BOMB', 'HYDROGEN_BOMB'
  ]);
  private readonly HOLD_CONTINUOUS_MS = 100;
  private readonly NAMASTE_HOLD_MS = 200;
  private readonly MAX_MISSES = 3; // ~100ms at 30fps
  /** A slightly longer still hold for poses that are easy to pass through by accident */
  private readonly HOLD_OVERRIDES: Partial<Record<GestureType, number>> = { SKY_LANTERN: 180, CHAKRI: 220 };
  /** Fingertip motion (hand sizes per camera frame) above which fingers count as "moving" */
  private readonly FINGERS_MOVING = 0.08;

  public classify(hands: HandPose[], _screenW: number): DetectedGesture[] {
    const now = performance.now();

    // 1a. Both hands thumbs up: Hydrogen bomb (instead of two Atom bombs)
    if (hands.length >= 2) {
      const h = this.checkDoubleThumbs(hands[0], hands[1], now);
      if (h !== undefined) return h;
    }

    // 1b. Two hands making a heart shape: Sky lantern (same as the finger heart)
    if (hands.length >= 2) {
      const heart = this.checkHandHeart(hands[0], hands[1], now);
      if (heart !== undefined) return heart;
    } else {
      this.pending.delete(-4);
    }

    // 1c. Two hands close together: namaste (Grand Finale) only
    if (hands.length >= 2) {
      const finale = this.checkNamaste(hands[0], hands[1], now);
      if (finale !== undefined) return finale;
    } else {
      this.pending.delete(-1);
    }

    // 2. Single-hand gestures
    const results: DetectedGesture[] = [];
    const seen = new Set<number>();
    for (const hand of hands) {
      seen.add(hand.id);
      let tr = this.travel.get(hand.id);
      if (!tr) this.travel.set(hand.id, (tr = []));
      tr.push({ x: hand.landmarks[8].x, y: hand.landmarks[8].y, t: now });
      while (tr.length && now - tr[0].t > 400) tr.shift();
      const g = this.classifySingleHand(hand, now);
      if (g) results.push(g);
    }
    for (const id of this.travel.keys()) if (!seen.has(id)) this.travel.delete(id);

    // Hands that disappeared this frame: give them the same short grace
    for (const [id, p] of this.pending) {
      if (id < 0 || seen.has(id)) continue;
      p.misses++;
      if (p.misses > this.MAX_MISSES) this.pending.delete(id);
      else if (p.last) results.push(p.last);
    }

    return results;
  }

  /**
   * Two-hand heart: index fingertips touching at the top, thumb tips touching
   * at the bottom, with a gap between the palms (namaste has palms pressed).
   */
  private checkHandHeart(h1: HandPose, h2: HandPose, now: number): DetectedGesture[] | undefined {
    const size = (h1.handSize + h2.handSize) / 2;
    const d = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
    const i1 = h1.landmarks[8], i2 = h2.landmarks[8], t1 = h1.landmarks[4], t2 = h2.landmarks[4];
    const palmGap = d(h1.palmCenter, h2.palmCenter);
    const isHeart =
      d(i1, i2) < size * 0.65 &&
      d(t1, t2) < size * 0.65 &&
      (i1.y + i2.y) / 2 < (t1.y + t2.y) / 2 - size * 0.5 &&
      palmGap > size * 1.05 && palmGap < size * 2.6;
    const p = this.pending.get(-4);
    if (!isHeart) {
      if (p && ++p.misses > this.MAX_MISSES) this.pending.delete(-4);
      return undefined;
    }
    this.pending.delete(h1.id);
    this.pending.delete(h2.id);
    if (!p) {
      this.pending.set(-4, { type: 'SKY_LANTERN', since: now, misses: 0 });
      return [];
    }
    p.misses = 0;
    if (now - p.since < this.HOLD_ONE_SHOT_MS || !this.canTrigger('SKY_LANTERN', now, -4)) return [];
    this.markFired('SKY_LANTERN', now, -4);
    return [{
      type: 'SKY_LANTERN',
      confidence: 0.95,
      triggerPoint: { x: (i1.x + i2.x + t1.x + t2.x) / 4, y: (i1.y + i2.y + t1.y + t2.y) / 4 },
      handIndex: -4,
      isContinuous: false
    }];
  }

  /** True if the fingertip has wandered over the last 0.4s (hand is moving, not holding a pose) */
  private isTravelling(hand: HandPose, now: number): boolean {
    const recent = (this.travel.get(hand.id) ?? []).filter((p) => now - p.t <= 400);
    if (recent.length < 3) return false;
    let mx = 0, my = 0;
    for (const p of recent) { mx += p.x; my += p.y; }
    mx /= recent.length;
    my /= recent.length;
    let spread = 0;
    for (const p of recent) spread = Math.max(spread, Math.hypot(p.x - mx, p.y - my));
    return spread > Math.max(hand.handSize * 0.25, 10); // 10px floor: far-away jitter isn't travel
  }

  /** Both hands thumbs up → one Hydrogen bomb between them */
  private checkDoubleThumbs(h1: HandPose, h2: HandPose, now: number): DetectedGesture[] | undefined {
    const a = this.detectPose(h1);
    const b = this.detectPose(h2);
    if (a?.type !== 'ATOM_BOMB' || b?.type !== 'ATOM_BOMB') {
      const p = this.pending.get(-2);
      if (p && ++p.misses > this.MAX_MISSES) this.pending.delete(-2);
      return undefined;
    }
    this.pending.delete(h1.id);
    this.pending.delete(h2.id);
    const p = this.pending.get(-2);
    if (!p) {
      this.pending.set(-2, { type: 'HYDROGEN_BOMB', since: now, misses: 0 });
      return [];
    }
    p.misses = 0;
    if (p.fired || now - p.since < this.HOLD_ONE_SHOT_MS || !this.canTrigger('HYDROGEN_BOMB', now, -2)) return [];
    this.markFired('HYDROGEN_BOMB', now, -2);
    p.fired = true;
    return [{
      type: 'HYDROGEN_BOMB',
      confidence: 0.95,
      triggerPoint: { x: (a.point.x + b.point.x) / 2, y: (a.point.y + b.point.y) / 2 },
      handIndex: -2,
      isContinuous: false
    }];
  }

  /** Returns gestures to emit when the hands are together, or undefined to continue normally */
  private checkNamaste(h1: HandPose, h2: HandPose, now: number): DetectedGesture[] | undefined {
    const palmDist = Math.hypot(h1.palmCenter.x - h2.palmCenter.x, h1.palmCenter.y - h2.palmCenter.y);
    const tipDist = Math.hypot(
      h1.landmarks[8].x - h2.landmarks[8].x,
      h1.landmarks[8].y - h2.landmarks[8].y
    );
    const size = (h1.handSize + h2.handSize) / 2;
    const maxPalmDist = size * 1.1;

    if (palmDist >= maxPalmDist * 1.6) {
      this.pending.delete(-1);
      return undefined;
    }

    // Hands are close: suppress single-hand gestures while namaste forms
    this.pending.delete(h1.id);
    this.pending.delete(h2.id);

    const isPointingUp =
      h1.landmarks[12].y < h1.landmarks[0].y - size * 0.6 &&
      h2.landmarks[12].y < h2.landmarks[0].y - size * 0.6;
    const isTogether = palmDist < maxPalmDist && tipDist < size * 0.8;
    const isOpen =
      !h1.curledFingers.index && !h1.curledFingers.middle &&
      !h2.curledFingers.index && !h2.curledFingers.middle;

    const p = this.pending.get(-1);
    if (isPointingUp && isTogether && isOpen) {
      if (!p) {
        this.pending.set(-1, { type: 'GRAND_FINALE', since: now, misses: 0 });
      } else {
        p.misses = 0;
        if (now - p.since >= this.NAMASTE_HOLD_MS && this.canTrigger('GRAND_FINALE', now, -1)) {
          this.markFired('GRAND_FINALE', now, -1);
          this.pending.delete(-1);
          return [{
            type: 'GRAND_FINALE',
            confidence: 0.99,
            triggerPoint: {
              x: (h1.palmCenter.x + h2.palmCenter.x) / 2,
              y: (h1.palmCenter.y + h2.palmCenter.y) / 2
            },
            handIndex: -1,
            isContinuous: false
          }];
        }
      }
    } else if (p && ++p.misses > this.MAX_MISSES) {
      this.pending.delete(-1);
    }
    return [];
  }

  private detectPose(hand: HandPose): { type: GestureType; point: { x: number; y: number }; continuous: boolean; direction?: { x: number; y: number } } | null {
    const { landmarks: lm, isPinching, palmCenter, handSize: size } = hand;
    const ext = hand.extendedFingers;
    const curl = hand.curledFingers;
    const wrist = lm[0];
    const thumbTip = lm[4];
    const indexTip = lm[8];
    const middleTip = lm[12];
    const pinkyTip = lm[20];

    const indexUp = indexTip.y < lm[6].y - size * 0.1 && indexTip.y < wrist.y - size * 0.6;
    // Index direction (knuckle → tip): "up" means within ~45° of vertical
    const idx = indexTip.x - lm[5].x;
    const idy = indexTip.y - lm[5].y;
    const indexVertical = -idy > Math.abs(idx) * 0.9; // pointing up

    // 🤏 / 👌 Phooljhadi: thumb tip touching the index tip (other fingers up or not)
    if (isPinching) {
      return { type: 'PHOOLJHADI', point: { x: (indexTip.x + thumbTip.x) / 2, y: (indexTip.y + thumbTip.y) / 2 }, continuous: true };
    }
    // 🤘 Ladi: index + pinky up, middle + ring folded
    if (ext.index && ext.pinky && curl.middle && curl.ring) {
      return { type: 'LADI', point: { x: (indexTip.x + pinkyTip.x) / 2, y: (indexTip.y + pinkyTip.y) / 2 }, continuous: false };
    }
    // 🤙 Snake: thumb + pinky out, index/middle/ring folded
    if (ext.pinky && ext.thumb && curl.index && curl.middle && curl.ring) {
      return { type: 'SNAKE', point: { x: palmCenter.x, y: palmCenter.y }, continuous: false };
    }
    // 🫰 Sky lantern (Korean finger heart): thumb tip crossed over the side of the
    // index (near its middle/last joint, not its tip, which would be a pinch),
    // other fingers folded. Unlike a fist, the index pokes out instead of curling
    // into the palm, and the thumb tip sits up by the index.
    if (
      !ext.middle && !ext.ring && !ext.pinky &&
      hand.thumbToIndexMid < 0.42 && hand.thumbToIndexMid < hand.thumbToIndexTip &&
      hand.indexReach > 1.05 && hand.thumbReach > 0.9
    ) {
      return { type: 'SKY_LANTERN', point: { x: (thumbTip.x + indexTip.x) / 2, y: (thumbTip.y + indexTip.y) / 2 }, continuous: false };
    }
    // 👍 Atom bomb: thumb pointing up, all four fingers folded
    const tdx = thumbTip.x - lm[2].x;
    const tdy = thumbTip.y - lm[2].y; // negative = pointing up on screen
    const thumbUp = tdy < -size * 0.45 && Math.abs(tdx) < -tdy * 1.2 && thumbTip.y < lm[5].y - size * 0.1;
    if (ext.thumb && thumbUp && curl.index && curl.middle && curl.ring && curl.pinky) {
      return { type: 'ATOM_BOMB', point: { x: thumbTip.x, y: thumbTip.y }, continuous: false };
    }
    // ☝️ Rocket: only the index finger, pointing up
    if (ext.index && indexUp && indexVertical && curl.middle && curl.ring && curl.pinky) {
      return { type: 'ROCKET', point: { x: indexTip.x, y: indexTip.y }, continuous: false };
    }
    // 👉 Pencil: only the index finger, pointing sideways or down (aim it)
    if (ext.index && !indexVertical && curl.middle && curl.ring && curl.pinky) {
      return { type: 'PENCIL', point: { x: indexTip.x, y: indexTip.y }, continuous: true, direction: { x: idx, y: idy } };
    }

    // ✌️ Roman Candle: index + middle up and apart, ring + pinky folded
    if (
      ext.index && ext.middle && indexUp && curl.ring && curl.pinky &&
      Math.hypot(indexTip.x - middleTip.x, indexTip.y - middleTip.y) > size * 0.2
    ) {
      return { type: 'ROMAN_CANDLE', point: { x: (indexTip.x + middleTip.x) / 2, y: (indexTip.y + middleTip.y) / 2 }, continuous: false };
    }
    // Chakri: 3 fingers up (index, middle, ring), pinky folded. Only counts once the
    // hand is still, so passing through this shape while opening/closing a fist doesn't fire it
    if (ext.index && ext.middle && ext.ring && curl.pinky) {
      return { type: 'CHAKRI', point: { x: palmCenter.x, y: palmCenter.y }, continuous: false };
    }
    // ✊ Anar: all four folded (thumb tucked or resting alongside; thumbs-up is caught above)
    if (curl.index && curl.middle && curl.ring && curl.pinky) {
      const top = lm[9] || palmCenter;
      return { type: 'ANAR', point: { x: top.x, y: top.y - size * 0.15 }, continuous: true };
    }
    // ✋ Starburst: all four fingers extended (thumb ignored: it's the least reliable to detect)
    if (ext.index && ext.middle && ext.ring && ext.pinky) {
      return { type: 'STARBURST', point: { x: palmCenter.x, y: palmCenter.y }, continuous: false };
    }
    return null;
  }

  private classifySingleHand(hand: HandPose, now: number): DetectedGesture | null {
    const id = hand.id;
    const pose = this.detectPose(hand);
    const p = this.pending.get(id);

    if (!pose) {
      // Brief dropout: keep the held pose (and a running continuous effect) alive
      if (p && ++p.misses <= this.MAX_MISSES) return p.last ?? null;
      this.pending.delete(id);
      return null;
    }

    if (!p || p.type !== pose.type) {
      // A different pose for just a frame or two (noise) doesn't break a running continuous effect
      if (p && p.last && ++p.misses <= this.MAX_MISSES) return p.last;
      this.pending.set(id, { type: pose.type, since: now, misses: 0 });
      return null;
    }

    p.misses = 0;
    // One-shots only count while the hand is still: opening or closing a hand
    // passes through other shapes (3 fingers, 4 fingers…) that mustn't fire,
    // and moving both hands into another pose (namaste) shouldn't fire on the way
    // (continuous effects need still fingers to start, then keep running while you move)
    if ((!pose.continuous || !p.last) &&
        (hand.fingerMotion > this.FINGERS_MOVING || hand.handMotion > 0.15 || this.isTravelling(hand, now))) {
      p.since = now;
      return null;
    }
    const holdMs = pose.continuous
      ? this.HOLD_CONTINUOUS_MS
      : this.HOLD_OVERRIDES[pose.type] ?? this.HOLD_ONE_SHOT_MS;
    if (now - p.since < holdMs) return null;

    const gesture: DetectedGesture = {
      type: pose.type,
      confidence: 0.9,
      triggerPoint: pose.point,
      handIndex: id,
      handedness: hand.handedness,
      isContinuous: pose.continuous,
      direction: pose.direction
    };

    if (pose.continuous) {
      p.last = gesture;
      return gesture;
    }

    if (p.fired) return null;
    if (!this.canTrigger(pose.type, now, id)) return null;
    this.markFired(pose.type, now, id);
    if (this.ONCE_PER_HOLD.has(pose.type)) p.fired = true;
    return gesture;
  }

  private canTrigger(type: GestureType, now: number, handIdx: number): boolean {
    const last = this.lastFiredTime.get(`${type}_${handIdx}`) || 0;
    return now - last >= this.COOLDOWNS[type];
  }

  private markFired(type: GestureType, now: number, handIdx: number): void {
    this.lastFiredTime.set(`${type}_${handIdx}`, now);
  }
}

