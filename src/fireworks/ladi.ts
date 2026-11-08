import { ParticlePool } from '../particles/particle';
import { FireworkEffect, SoundTriggerCallback, ShakeCallback } from './fireworkTypes';
import { COLORS } from './fireworkColors';
import { Debris } from './debris';

interface Cracker { x: number; y: number; angle: number; popped: boolean; }

/**
 * Ladi (string of crackers, "1000-wala"): dozens of small red crackers
 * braided on a fuse. Lit at the bottom, they go off one after another in a
 * rapid, uneven chain of sharp cracks, each with a small flash, a few sparks,
 * a puff of smoke, and red paper confetti everywhere.
 */
export class Ladi implements FireworkEffect {
  public active = true;
  private crackers: Cracker[] = [];
  private nextPop = 0.25; // brief fuse delay
  private t = 0;
  private sway = 0;
  private debris = new Debris();

  constructor(
    private x: number,
    private y: number,
    screenH: number,
    private onSound?: SoundTriggerCallback,
    private onShake?: ShakeCallback
  ) {
    const length = Math.min(420, screenH * 0.5);
    const count = 40;
    const side = Math.random() < 0.5 ? -1 : 1;
    for (let i = 0; i < count; i++) {
      const t = i / (count - 1);
      // Hanging string with a gentle sideways curve
      const cx = x + Math.sin(t * Math.PI * 1.3) * 26 * side;
      const cy = y + t * length;
      // Crackers sit alternately left/right of the fuse, angled outward
      const alt = i % 2 === 0 ? -1 : 1;
      this.crackers.push({ x: cx + alt * 6, y: cy, angle: alt * 0.9, popped: false });
    }
    onSound?.('FUSE');
  }

  update(dt: number, pool: ParticlePool): void {
    this.t += dt;
    this.nextPop -= dt;
    this.sway *= Math.pow(0.85, dt * 60);

    // Fire from the bottom of the string upward
    while (this.nextPop <= 0) {
      const c = [...this.crackers].reverse().find((k) => !k.popped);
      if (!c) { this.nextPop = Infinity; break; }
      this.pop(c, pool);
      // uneven rhythm: mostly rapid, occasional double-bang or tiny pause
      const r = Math.random();
      this.nextPop += r < 0.15 ? 0.012 : r < 0.9 ? 0.04 + Math.random() * 0.05 : 0.14;
    }

    this.debris.update(dt);
    if (this.crackers.every((k) => k.popped) && this.debris.isEmpty) this.active = false;
  }

  private pop(c: Cracker, pool: ParticlePool): void {
    c.popped = true;
    this.sway += (Math.random() - 0.5) * 6;
    this.onSound?.('LADI_POP', 0.6 + Math.random() * 0.5);
    if (Math.random() < 0.25) this.onShake?.(0.15);

    pool.addFlash(c.x, c.y, 140, COLORS.WHITE_HOT, 0.55);
    for (let i = 0; i < 12; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = Math.random() * 7 + 2;
      pool.spawn({
        x: c.x, y: c.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        color: COLORS.WHITE_HOT, fadeColor: COLORS.GOLD,
        size: 1.8, life: 0.1 + Math.random() * 0.15, drag: 0.85, gravity: 0.05
      });
    }
    const reds = ['#d32f2f', '#c62828', '#e53935', '#b71c1c', '#f5e6c8'];
    for (let i = 0; i < 7; i++) this.debris.addShred(c.x, c.y, reds[i % reds.length], 6);
    this.debris.addSmoke(c.x, c.y, { r: 12, rise: 0.6, life: 2.2, alpha: 0.28, shade: 200 });
  }

  render(ctx: CanvasRenderingContext2D): void {
    const remaining = this.crackers.filter((k) => !k.popped);
    if (remaining.length) {
      ctx.save();
      ctx.globalCompositeOperation = 'source-over';
      const sx = this.sway;
      // fuse string up to the last unexploded cracker
      ctx.strokeStyle = 'rgba(120,40,30,0.9)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(this.x, this.y);
      for (const k of remaining) ctx.lineTo(k.x - Math.sign(k.angle) * 6 + sx, k.y);
      ctx.stroke();
      for (const k of remaining) {
        ctx.save();
        ctx.translate(k.x + sx, k.y);
        ctx.rotate(k.angle);
        ctx.fillStyle = '#c62828';
        ctx.fillRect(-2.5, -7, 5, 14);
        ctx.fillStyle = 'rgba(255,255,255,0.25)';
        ctx.fillRect(-2.5, -7, 1.5, 14);
        ctx.restore();
      }
      ctx.restore();
    }
    this.debris.render(ctx);
  }
}
