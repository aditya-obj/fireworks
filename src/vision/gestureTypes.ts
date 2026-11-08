export type GestureType =
  | 'NONE'
  | 'ROCKET'
  | 'ANAR'
  | 'STARBURST'
  | 'ROMAN_CANDLE'
  | 'PHOOLJHADI'
  | 'ATOM_BOMB'
  | 'LADI'
  | 'SNAKE'
  | 'CHAKRI'
  | 'PENCIL'
  | 'SKY_LANTERN'
  | 'HYDROGEN_BOMB'
  | 'GRAND_FINALE';

export interface NormalizedLandmark {
  x: number;
  y: number;
  z: number;
}

export interface ScreenLandmark {
  x: number;
  y: number;
  z: number;
}

export interface HandPose {
  id: number; // stable per physical hand across frames (0 or 1)
  handedness: 'Left' | 'Right';
  landmarks: ScreenLandmark[]; // Screen-space pixel coordinates (already mirrored)
  rawLandmarks: NormalizedLandmark[];
  extendedFingers: {
    thumb: boolean;
    index: boolean;
    middle: boolean;
    ring: boolean;
    pinky: boolean;
  };
  // Definitely folded fingers (stricter than !extended; in-between = neither)
  curledFingers: {
    index: boolean;
    middle: boolean;
    ring: boolean;
    pinky: boolean;
  };
  handSize: number; // wrist → middle-finger knuckle, in px; used to scale thresholds
  fingerMotion: number; // fingertip movement relative to the wrist this frame, in hand sizes (0 = still)
  handMotion: number; // wrist movement this frame, in hand sizes
  indexReach: number; // index tip → wrist distance (3D), in hand sizes (~1 in a fist, ~2 straight)
  thumbReach: number; // thumb tip → wrist distance (3D), in hand sizes
  thumbToIndexMid: number; // thumb tip → nearest index middle/last joint (3D), in hand sizes
  thumbToIndexTip: number; // thumb tip → index tip (3D), in hand sizes
  palmCenter: ScreenLandmark;
  pinchDistance: number;
  isPinching: boolean;
}

export interface DetectedGesture {
  type: GestureType;
  confidence: number;
  triggerPoint: { x: number; y: number }; // Pixel coordinate where firework originates
  handIndex: number;
  handedness?: 'Left' | 'Right';
  isContinuous: boolean; // True for Anar, Sparkler and Pencil
  direction?: { x: number; y: number }; // aim, for pointed effects (Pencil)
}
