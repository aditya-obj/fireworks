import { ParticlePool } from '../particles/particle';
import { FireworkEffect, SoundTriggerCallback } from './fireworkTypes';
import { COLORS, PALETTES } from './fireworkColors';

/**
 * High-Yield Aerial Starburst Shell
 * Features massive room flash, volumetric 420-star spherical expansion,
 * and secondary crossette crackle breaks.
 */
export class Starburst implements FireworkEffect {
  public active: boolean = false;

  constructor(
    x: number,
    y: number,
    pool: ParticlePool,
    onSound?: SoundTriggerCallback
  ) {
    onSound?.('EXPLOSION', 1.4);

    const palette = PALETTES[Math.floor(Math.random() * PALETTES.length)];
    const primaryColor = palette[0];
    const secondaryColor = palette[1];

    // 1. Massive Initial Concussive Flash (illuminates user and room)
    pool.addFlash(x, y, 750, primaryColor, 0.85);

    // 2. Volumetric 420-Star Sphere
    const particleCount = 420;

    for (let i = 0; i < particleCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      // Power curve fills the interior volume with glowing stars
      const speed = Math.pow(Math.random(), 0.6) * 18 + 3.0;
      const vx = Math.cos(angle) * speed;
      const vy = Math.sin(angle) * speed;

      const isSecondary = Math.random() < 0.35;
      const isCore = Math.random() < 0.18;

      pool.spawn({
        x,
        y,
        vx,
        vy,
        color: isCore ? COLORS.WHITE_HOT : isSecondary ? secondaryColor : primaryColor,
        fadeColor: isSecondary ? COLORS.GOLD : COLORS.DEEP_ORANGE,
        size: 3.8,
        life: 1.35 + Math.random() * 0.65,
        drag: 0.965,
        gravity: 0.08,
        flicker: true,
        crackle: Math.random() < 0.6 // 60% chance of secondary crackle pop!
      });
    }

    // 3. Blinding Central Fireball Detonation
    for (let k = 0; k < 45; k++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 8;
      pool.spawn({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        color: COLORS.WHITE_HOT,
        fadeColor: primaryColor,
        size: 9.0,
        life: 0.35,
        drag: 0.88,
        gravity: 0
      });
    }
  }

  public update(): void {
    // Immediate one-shot effect
  }
}
