import { ParticlePool, ParticleColor } from '../particles/particle';
import { FireworkEffect, SoundTriggerCallback } from './fireworkTypes';
import { COLORS, getRandomColor } from './fireworkColors';

export class Rocket implements FireworkEffect {
  public active: boolean = true;
  private x: number;
  private y: number;
  private vx: number;
  private vy: number;
  private targetY: number;
  private color: ParticleColor;
  private trailTimer: number = 0;
  private onSound?: SoundTriggerCallback;

  constructor(
    startX: number,
    startY: number,
    targetY: number,
    onSound?: SoundTriggerCallback
  ) {
    this.x = startX;
    this.y = startY;
    this.vx = (Math.random() - 0.5) * 2.8;
    this.vy = -(19 + Math.random() * 5); // Fast upward velocity
    this.targetY = targetY;
    this.color = getRandomColor();
    this.onSound = onSound;

    this.onSound?.('ROCKET_LAUNCH');
  }

  public update(dt: number, pool: ParticlePool): void {
    if (!this.active) return;

    this.x += this.vx;
    this.y += this.vy;
    this.vy += 0.28;

    // Thick golden spark plume on ascent
    this.trailTimer += dt;
    if (this.trailTimer > 0.01) {
      this.trailTimer = 0;
      for (let i = 0; i < 6; i++) {
        pool.spawn({
          x: this.x + (Math.random() - 0.5) * 6,
          y: this.y + (Math.random() - 0.5) * 6,
          vx: (Math.random() - 0.5) * 3,
          vy: Math.random() * 5 + 2,
          color: COLORS.GOLD,
          fadeColor: COLORS.DEEP_ORANGE,
          size: 3.0,
          life: 0.5 + Math.random() * 0.3,
          drag: 0.94,
          gravity: 0.1
        });
      }
    }

    // Rocket head plasma glow
    pool.spawn({
      x: this.x,
      y: this.y,
      vx: 0,
      vy: 0,
      color: COLORS.WHITE_HOT,
      fadeColor: COLORS.GOLD,
      size: 7.5,
      life: 0.09,
      drag: 0.9,
      gravity: 0
    });

    if (this.y <= this.targetY || this.vy >= -1) {
      this.detonate(pool);
      this.active = false;
    }
  }

  private detonate(pool: ParticlePool): void {
    this.onSound?.('EXPLOSION', 1.3);

    pool.addFlash(this.x, this.y, 680, this.color, 0.75);

    const particleCount = 340 + Math.floor(Math.random() * 80);
    const isWillow = Math.random() < 0.5;
    const burstColor = isWillow ? COLORS.GOLD : this.color;
    const secondaryColor = isWillow ? COLORS.AMBER : COLORS.WHITE_HOT;

    for (let i = 0; i < particleCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = isWillow
        ? Math.pow(Math.random(), 0.6) * 14 + 3.0
        : Math.pow(Math.random(), 0.6) * 17 + 4.0;

      const vx = Math.cos(angle) * speed;
      const vy = Math.sin(angle) * speed;

      pool.spawn({
        x: this.x,
        y: this.y,
        vx,
        vy,
        color: Math.random() < 0.2 ? COLORS.WHITE_HOT : burstColor,
        fadeColor: secondaryColor,
        size: isWillow ? 3.2 : 3.8,
        life: isWillow ? 2.0 + Math.random() * 0.8 : 1.4 + Math.random() * 0.6,
        drag: isWillow ? 0.97 : 0.96,
        gravity: isWillow ? 0.15 : 0.09,
        flicker: true,
        crackle: Math.random() < 0.5
      });
    }

    // Central flash
    for (let j = 0; j < 40; j++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 7.5;
      pool.spawn({
        x: this.x,
        y: this.y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        color: COLORS.WHITE_HOT,
        fadeColor: burstColor,
        size: 8.5,
        life: 0.35,
        drag: 0.88,
        gravity: 0
      });
    }
  }
}
