import {
  GestureType,
  HandPose,
  DetectedGesture
} from './gestureTypes';

export class GestureClassifier {
  // Gesture hold tracking for debouncing (-1 for dual-hand Namaste, 0/1 for single hands)
  private pendingGesture: Map<number, { type: GestureType; since: number }> = new Map();
  private lastFiredTime: Map<string, number> = new Map();

  // Cooldowns (ms)
  private readonly COOLDOWNS: Record<GestureType, number> = {
    NONE: 0,
    ROCKET: 500,
    ANAR: 0, // Continuous
    STARBURST: 850,
    ROMAN_CANDLE: 300,
    PHOOLJHADI: 0, // Continuous
    GRAND_FINALE: 4000
  };

  // A pose must be held steadily this long before it fires (filters transitions
  // between poses, which briefly look like other gestures)
  private readonly HOLD_ONE_SHOT_MS = 180;
  private readonly HOLD_CONTINUOUS_MS = 140;
  private readonly NAMASTE_HOLD_MS = 220;

  public classify(hands: HandPose[], _screenW: number): DetectedGesture[] {
    const now = performance.now();
    const results: DetectedGesture[] = [];

    // 1. Dual-Hand Check: Namaste Mudra for Grand Finale (Priority 1)
    if (hands.length >= 2) {
      const h1 = hands[0];
      const h2 = hands[1];

      const palmDist = Math.hypot(
        h1.palmCenter.x - h2.palmCenter.x,
        h1.palmCenter.y - h2.palmCenter.y
      );
      const tipDist = Math.hypot(
        h1.landmarks[8].x - h2.landmarks[8].x,
        h1.landmarks[8].y - h2.landmarks[8].y
      );

      const size = (h1.handSize + h2.handSize) / 2;
      const maxPalmDist = size * 1.1;
      const maxTipDist = size * 0.8;

      // Both hands pointing upwards in front of chest
      const isPointingUp =
        h1.landmarks[12].y < h1.landmarks[0].y - size * 0.6 &&
        h2.landmarks[12].y < h2.landmarks[0].y - size * 0.6;

      // Palms and fingers brought together
      const isHandsTogether = palmDist < maxPalmDist && tipDist < maxTipDist;
      const isFingersOpen =
        h1.extendedFingers.index && h1.extendedFingers.middle &&
        h2.extendedFingers.index && h2.extendedFingers.middle;

      // Hands close together = namaste in progress: suppress single-hand
      // gestures so joined palms never fire Starburst/Rocket on the way in
      if (palmDist < maxPalmDist * 1.6) {
        if (isPointingUp && isHandsTogether && isFingersOpen) {
          const pending = this.pendingGesture.get(-1);
          if (!pending || pending.type !== 'GRAND_FINALE') {
            this.pendingGesture.set(-1, { type: 'GRAND_FINALE', since: now });
          } else if (
            now - pending.since >= this.NAMASTE_HOLD_MS &&
            this.canTrigger('GRAND_FINALE', now)
          ) {
            this.markFired('GRAND_FINALE', now);
            this.pendingGesture.delete(-1);
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
        } else {
          this.pendingGesture.delete(-1);
        }
        this.pendingGesture.delete(0);
        this.pendingGesture.delete(1);
        return results;
      }

      this.pendingGesture.delete(-1);
    } else {
      this.pendingGesture.delete(-1);
    }

    // 2. Single-Hand Gestures
    hands.forEach((hand, idx) => {
      const gesture = this.classifySingleHand(hand, idx, now);
      if (gesture) {
        results.push(gesture);
      }
    });

    return results;
  }

  private classifySingleHand(
    hand: HandPose,
    handIndex: number,
    now: number
  ): DetectedGesture | null {
    const { landmarks, isPinching, palmCenter } = hand;
    const wrist = landmarks[0];
    const indexPip = landmarks[6];
    const indexTip = landmarks[8];
    const thumbTip = landmarks[4];

    const ext = hand.extendedFingers;
    const curl = hand.curledFingers;
    const size = hand.handSize;
    const middleTip = landmarks[12];

    let candidate: GestureType = 'NONE';
    let triggerPoint = { x: indexTip.x, y: indexTip.y };
    let isContinuous = false;

    // Index finger clearly pointing up (screen y grows downward)
    const isIndexPointingUp =
      indexTip.y < indexPip.y - size * 0.15 && indexTip.y < wrist.y - size * 0.8;

    // 👌 Phooljhadi: thumb + index tips touching, other fingers up
    if (isPinching) {
      candidate = 'PHOOLJHADI';
      triggerPoint = { x: (indexTip.x + thumbTip.x) / 2, y: (indexTip.y + thumbTip.y) / 2 };
      isContinuous = true;
    }
    // ☝️ Rocket: only the index finger up, the other three definitely folded
    else if (ext.index && isIndexPointingUp && curl.middle && curl.ring && curl.pinky) {
      candidate = 'ROCKET';
      triggerPoint = { x: indexTip.x, y: indexTip.y };
    }
    // ✌️ Roman Candle: index + middle up and apart, ring + pinky definitely folded
    else if (
      ext.index && ext.middle && isIndexPointingUp && curl.ring && curl.pinky &&
      Math.hypot(indexTip.x - middleTip.x, indexTip.y - middleTip.y) > size * 0.25
    ) {
      candidate = 'ROMAN_CANDLE';
      triggerPoint = { x: (indexTip.x + middleTip.x) / 2, y: (indexTip.y + middleTip.y) / 2 };
    }
    // ✊ Anar: all four fingers definitely folded, thumb tucked
    else if (curl.index && curl.middle && curl.ring && curl.pinky && !ext.thumb) {
      candidate = 'ANAR';
      const fistTop = landmarks[9] || palmCenter;
      triggerPoint = { x: fistTop.x, y: fistTop.y - size * 0.15 };
      isContinuous = true;
    }
    // ✋ Starburst: all five fingers extended
    else if (ext.index && ext.middle && ext.ring && ext.pinky && ext.thumb) {
      candidate = 'STARBURST';
      triggerPoint = { x: palmCenter.x, y: palmCenter.y };
    }

    if (candidate === 'NONE') {
      this.pendingGesture.delete(handIndex);
      return null;
    }

    // Debounce hold requirement
    const pending = this.pendingGesture.get(handIndex);
    if (!pending || pending.type !== candidate) {
      this.pendingGesture.set(handIndex, { type: candidate, since: now });
      return null;
    }

    const holdMs = isContinuous ? this.HOLD_CONTINUOUS_MS : this.HOLD_ONE_SHOT_MS;
    if (now - pending.since < holdMs) {
      return null;
    }

    if (!this.canTrigger(candidate, now, handIndex)) {
      return null;
    }

    if (!isContinuous) {
      this.markFired(candidate, now, handIndex);
    }

    return {
      type: candidate,
      confidence: 0.9,
      triggerPoint,
      handIndex,
      handedness: hand.handedness,
      isContinuous
    };
  }

  private canTrigger(type: GestureType, now: number, handIdx: number = 0): boolean {
    const key = `${type}_${handIdx}`;
    const lastTime = this.lastFiredTime.get(key) || 0;
    const cooldown = this.COOLDOWNS[type];
    return now - lastTime >= cooldown;
  }

  private markFired(type: GestureType, now: number, handIdx: number = 0): void {
    const key = `${type}_${handIdx}`;
    this.lastFiredTime.set(key, now);
  }
}
