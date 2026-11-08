import { ParticlePool, ParticleColor } from '../particles/particle';
import { FireworkEffect, SoundTriggerCallback } from './fireworkTypes';
import { COLORS } from './fireworkColors';

/**
 * Pencil: a thin coloured fountain stick you hold and point.
 * Shoots a narrow jet of one colour (red, green or pink) in the
 * direction your finger points, with crackling white tips.
 * Continuous while the pose is held.
 */
export class Pencil implements FireworkEffect {
  public active = true;
  private stopping = false;
  private dirX = 1;
  private dirY = 0;
  private color: ParticleColor;

  constructor(private x: number, private y: number, private onSound?: SoundTriggerCallback) {
    const colors = [COLORS.CRIMSON, COLORS.EMERALD, COLORS.MAGENTA, COLORS.ELECTRIC_BLUE];
    this.color = colors[Math.floor(Math.random() * colors.length)];
  }

  updatePosition(x: number, y: number, dir?: { x: number; y: number }): void {
    this.x = x;
    this.y = y;
    if (dir) {
      const len = Math.hypot(dir.x, dir.y) || 1;
      // smooth the aim so the jet doesn't jitter
      this.dirX += (dir.x / len - this.dirX) * 0.35;
      this.dirY += (dir.y / len - this.dirY) * 0.35;
    }
  }

  stop(): void {
    this.stopping = true;
  }

  update(_dt: number, pool: ParticlePool): void {
    // emit on the final frame too, then go out
    if (this.stopping) this.active = false;
    this.onSound?.('SPARKLER_LOOP');
    const base = Math.atan2(this.dirY, this.dirX);
    for (let i = 0; i < 14; i++) {
      const a = base + (Math.random() - 0.5) * 0.22;
      const s = Math.random() * 9 + 7;
      pool.spawn({
        x: this.x, y: this.y,
        vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        color: Math.random() < 0.15 ? COLORS.WHITE_HOT : this.color, fadeColor: this.color,
        size: 2.2, life: 0.45 + Math.random() * 0.35, drag: 0.955, gravity: 0.1,
        crackle: Math.random() < 0.08
      });
    }
    pool.addFlash(this.x, this.y, 120, this.color, 0.2);
  }
}
