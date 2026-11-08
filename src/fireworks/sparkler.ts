import { ParticlePool } from '../particles/particle';
import { FireworkEffect, SoundTriggerCallback } from './fireworkTypes';
import { COLORS } from './fireworkColors';

/**
 * High-Density Phooljhadi Sparkler Engine
 * Features burning magnesium core, violent branching needle sparks,
 * and lingering light-painting air trails.
 */
export class Sparkler implements FireworkEffect {
  public active: boolean = true;
  private x: number;
  private y: number;
  private onSound?: SoundTriggerCallback;

  constructor(x: number, y: number, onSound?: SoundTriggerCallback) {
    this.x = x;
    this.y = y;
    this.onSound = onSound;
  }

  public updatePosition(x: number, y: number): void {
    this.x = x;
    this.y = y;
  }

  public update(_dt: number, pool: ParticlePool): void {
    if (!this.active) return;

    this.onSound?.('SPARKLER_LOOP');

    // Intense localized golden torch glow at pinch point
    pool.addFlash(this.x, this.y, 200, COLORS.GOLD, 0.35);

    // 1. Violent High-Speed Needle Sparks (32 per frame)
    const sparkCount = 32;
    for (let i = 0; i < sparkCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 14 + 4;
      const vx = Math.cos(angle) * speed;
      const vy = Math.sin(angle) * speed;

      const isWhite = Math.random() < 0.45;

      pool.spawn({
        x: this.x + (Math.random() - 0.5) * 8,
        y: this.y + (Math.random() - 0.5) * 8,
        vx,
        vy,
        color: isWhite ? COLORS.WHITE_HOT : COLORS.GOLD,
        fadeColor: isWhite ? COLORS.GOLD : COLORS.AMBER,
        size: 2.8 + Math.random() * 1.8,
        life: 0.6 + Math.random() * 0.45,
        drag: 0.94,
        gravity: 0.12,
        flicker: true,
        crackle: true
      });
    }

    // 2. Light-Painting Lingering Air Trail (leaves glowing golden drawing in air)
    for (let t = 0; t < 4; t++) {
      pool.spawn({
        x: this.x + (Math.random() - 0.5) * 10,
        y: this.y + (Math.random() - 0.5) * 10,
        vx: (Math.random() - 0.5) * 0.8,
        vy: (Math.random() - 0.5) * 0.8 + 0.3,
        color: COLORS.GOLD,
        fadeColor: COLORS.DEEP_ORANGE,
        size: 3.5,
        life: 1.1 + Math.random() * 0.5, // Lingers for over 1 second!
        drag: 0.98,
        gravity: 0.02,
        flicker: true,
        crackle: false
      });
    }

    // 3. Burning Magnesium Core Flame
    for (let j = 0; j < 4; j++) {
      pool.spawn({
        x: this.x + (Math.random() - 0.5) * 6,
        y: this.y + (Math.random() - 0.5) * 6,
        vx: (Math.random() - 0.5) * 1.8,
        vy: (Math.random() - 0.5) * 1.8,
        color: COLORS.WHITE_HOT,
        fadeColor: COLORS.GOLD,
        size: 9.0,
        life: 0.16,
        drag: 0.88,
        gravity: 0
      });
    }
  }

  public stop(): void {
    this.active = false;
  }
}
