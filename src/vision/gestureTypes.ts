export type GestureType =
  | 'NONE'
  | 'ROCKET'
  | 'ANAR'
  | 'STARBURST'
  | 'ROMAN_CANDLE'
  | 'PHOOLJHADI'
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
  isContinuous: boolean; // True for Anar and Sparkler
}
