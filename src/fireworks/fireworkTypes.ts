import { ParticlePool } from '../particles/particle';

export interface FireworkEffect {
  active: boolean;
  update(dt: number, pool: ParticlePool): void;
  /** Optional non-glowing layer (smoke, paper, ash), drawn before the additive sparks */
  render?(ctx: CanvasRenderingContext2D): void;
}

export type ShakeCallback = (intensity: number) => void;

export type SoundTriggerCallback = (
  soundType:
    | 'ROCKET_LAUNCH' | 'EXPLOSION' | 'ANAR_LOOP' | 'SPARKLER_LOOP' | 'ROMAN_POP' | 'FINALE'
    | 'FUSE' | 'ATOM_BLAST' | 'HYDROGEN_BLAST' | 'LADI_POP' | 'SNAKE_FIZZ' | 'CHAKRI_SPIN',
  intensity?: number
) => void;
