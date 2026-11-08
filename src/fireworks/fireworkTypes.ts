import { ParticlePool } from '../particles/particle';

export interface FireworkEffect {
  active: boolean;
  update(dt: number, pool: ParticlePool): void;
}

export type SoundTriggerCallback = (
  soundType: 'ROCKET_LAUNCH' | 'EXPLOSION' | 'ANAR_LOOP' | 'SPARKLER_LOOP' | 'ROMAN_POP' | 'FINALE',
  intensity?: number
) => void;
