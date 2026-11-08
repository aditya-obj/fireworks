import { ParticlePool, ParticleColor } from '../particles/particle';
import { FireworkEffect, SoundTriggerCallback } from './fireworkTypes';
import { COLORS } from './fireworkColors';
import { Debris } from './debris';

/**
 * Chakri (ground spinner): a coil that spins fast on the ground,
 * throwing a ring of sparks off tangentially. Real chakris change
 * colour as they burn (gold → green → red), and spin up as they go.
 */
export class Chakri implements FireworkEffect {
  public active = true;
  private t = 0;
  private angle = Math.random() * Math.PI * 2;
  private spin = 10; // rad/s
  private readonly duration = 4.2;
  private phases: ParticleColor[];
  private vx = (Math.random() - 0.5) * 20; // slight drift on the ground
  private debris = new Debris();

  constructor(private x: number, private y: number, onSound?: SoundTriggerCallback) {
    const pick = [
      [COLORS.GOLD, COLORS.EMERALD, COLORS.CRIMSON],
      [COLORS.GOLD, COLORS.CRIMSON, COLORS.EMERALD],
      [COLORS.SILVER, COLORS.GOLD, COLORS.MAGENTA]
    ];
    this.phases = pick[Math.floor(Math.random() * pick.length)];
    onSound?.('CHAKRI_SPIN');
  }

  update(dt: number, pool: ParticlePool): void {
    this.t += dt;
    const burning = this.t < this.duration;
    if (burning) {
      this.spin = Math.min(34, this.spin + dt * 14);
      this.angle += this.spin * dt;
      this.x += this.vx * dt;
      const color = this.phases[Math.min(this.phases.length - 1, Math.floor((this.t / this.duration) * this.phases.length))];
      const r = 14;
      // Two nozzles on opposite sides of the coil
      for (const off of [0, Math.PI]) {
        const a = this.angle + off;
        const nx = this.x + Math.cos(a) * r;
        const ny = this.y + Math.sin(a) * r * 0.45; // flattened: seen at a slight angle on the ground
        for (let i = 0; i < 6; i++) {
          // sparks leave tangentially, opposite to the spin direction
          const ta = a - Math.PI / 2 + (Math.random() - 0.5) * 0.35;
          const s = Math.random() * 6 + 5;
          pool.spawn({
            x: nx, y: ny,
            vx: Math.cos(ta) * s, vy: Math.sin(ta) * s * 0.55 - Math.random() * 1.2,
            color: Math.random() < 0.25 ? COLORS.WHITE_HOT : color, fadeColor: color,
            size: 2, life: 0.35 + Math.random() * 0.3, drag: 0.93, gravity: 0.12
          });
        }
      }
      pool.addFlash(this.x, this.y, 160, color, 0.25);
      if (Math.random() < dt * 8) this.debris.addSmoke(this.x, this.y, { r: 10, rise: 0.5, life: 2, alpha: 0.2 });
    }
    this.debris.update(dt);
    if (!burning && this.debris.isEmpty) this.active = false;
  }

  render(ctx: CanvasRenderingContext2D): void {
    this.debris.render(ctx);
    if (this.t >= this.duration) return;
    // glowing coil
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, 22);
    g.addColorStop(0, 'rgba(255,240,200,0.9)');
    g.addColorStop(1, 'rgba(255,160,40,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(this.x, this.y, 22, 11, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}
