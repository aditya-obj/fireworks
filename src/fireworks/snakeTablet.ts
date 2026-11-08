import { ParticlePool } from '../particles/particle';
import { FireworkEffect, SoundTriggerCallback } from './fireworkTypes';
import { COLORS } from './fireworkColors';
import { Debris } from './debris';

interface Pt { x: number; y: number; }

/**
 * Snake tablet (saanp ki goli): no bang, no sparks in the air.
 * A small pellet smoulders and pushes out a long, coiling column of
 * grey-black ash that rises and curls like a snake, with lots of smoke.
 */
export class SnakeTablet implements FireworkEffect {
  public active = true;
  private t = 0;
  private readonly growTime = 5.5;
  private readonly holdTime = 2.5;
  private readonly fadeTime = 1.5;
  private path: Pt[];
  private angle = -Math.PI / 2;
  private curl: number;
  private speed = 70; // px/s, slows as it grows
  private width: number;
  private specks: { i: number; off: number; s: number; c: number }[] = [];
  private debris = new Debris();

  constructor(private x: number, private y: number, onSound?: SoundTriggerCallback, scale = 1) {
    this.path = [{ x, y }];
    this.curl = (Math.random() < 0.5 ? -1 : 1) * (0.6 + Math.random() * 0.6);
    this.width = 14 * scale;
    onSound?.('SNAKE_FIZZ');
  }

  update(dt: number, pool: ParticlePool): void {
    this.t += dt;
    const growing = this.t < this.growTime;

    if (growing) {
      // Head wanders and coils; curl direction occasionally flips
      if (Math.random() < dt * 0.5) this.curl *= -1;
      const steps = Math.max(1, Math.round(dt * 60));
      for (let k = 0; k < steps; k++) {
        const step = (this.speed * dt) / steps;
        this.angle += (this.curl * Math.sin(this.t * 1.7) * 1.4 + (Math.random() - 0.5) * 1.2) * (dt / steps) * 2.2;
        // gentle pull back toward "up" so it rises before it flops over
        this.angle += (-Math.PI / 2 - this.angle) * 0.004;
        const head = this.path[this.path.length - 1];
        const next = { x: head.x + Math.cos(this.angle) * step, y: head.y + Math.sin(this.angle) * step };
        this.path.push(next);
        if (Math.random() < 0.6) {
          this.specks.push({ i: this.path.length - 1, off: (Math.random() - 0.5), s: Math.random() * 1.6 + 0.6, c: 120 + Math.random() * 80 });
        }
      }
      this.speed = Math.max(28, this.speed - dt * 8);

      // Smouldering pellet at the base: tiny embers, dense smoke
      if (Math.random() < 0.5) {
        pool.spawn({
          x: this.x + (Math.random() - 0.5) * 6, y: this.y,
          vx: (Math.random() - 0.5) * 0.6, vy: -Math.random() * 0.8,
          color: COLORS.AMBER, fadeColor: COLORS.DEEP_ORANGE,
          size: 1.4, life: 0.3, drag: 0.95, gravity: -0.01
        });
      }
      if (Math.random() < dt * 14) {
        this.debris.addSmoke(this.x + (Math.random() - 0.5) * 10, this.y - 4, { r: 10, rise: 0.7, life: 2.6, alpha: 0.32, shade: 200 });
      }
      if (Math.random() < dt * 4) {
        const head = this.path[this.path.length - 1];
        this.debris.addSmoke(head.x, head.y, { r: 6, rise: 0.4, life: 1.6, alpha: 0.12, shade: 170 });
      }
    }

    this.debris.update(dt);
    if (this.t > this.growTime + this.holdTime + this.fadeTime && this.debris.isEmpty) this.active = false;
  }

  render(ctx: CanvasRenderingContext2D): void {
    const end = this.growTime + this.holdTime;
    const fade = this.t > end ? Math.max(0, 1 - (this.t - end) / this.fadeTime) : 1;
    const path = this.path;

    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = fade;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (path.length > 1) {
      const n = path.length;
      // Draw in chunks so the ash column tapers toward the head
      const chunk = 6;
      for (let pass = 0; pass < 3; pass++) {
        for (let i = 0; i < n - 1; i += chunk) {
          const j = Math.min(n - 1, i + chunk);
          const along = i / n;
          const w = this.width * (1.15 - along * 0.45);
          if (pass === 0) { ctx.strokeStyle = 'rgba(10,10,10,0.9)'; ctx.lineWidth = w + 3; }
          else if (pass === 1) { ctx.strokeStyle = '#34312d'; ctx.lineWidth = w; }
          else { ctx.strokeStyle = 'rgba(170,160,148,0.35)'; ctx.lineWidth = w * 0.3; }
          ctx.beginPath();
          const ox = pass === 2 ? -w * 0.18 : 0;
          const oy = pass === 2 ? -w * 0.18 : 0;
          ctx.moveTo(path[i].x + ox, path[i].y + oy);
          for (let k = i + 1; k <= j; k++) ctx.lineTo(path[k].x + ox, path[k].y + oy);
          ctx.stroke();
        }
      }
      // Ash texture: pale flecks along the body
      for (const sp of this.specks) {
        const p = path[sp.i];
        if (!p) continue;
        const w = this.width * (1.15 - (sp.i / n) * 0.45);
        ctx.fillStyle = `rgba(${sp.c},${sp.c - 6},${sp.c - 14},0.55)`;
        ctx.fillRect(p.x + sp.off * w * 0.7, p.y + sp.off * w * 0.4, sp.s, sp.s);
      }
    }

    // The pellet, glowing while it burns
    ctx.fillStyle = '#1b1a18';
    ctx.beginPath();
    ctx.ellipse(this.x, this.y + 2, this.width * 0.9, this.width * 0.4, 0, 0, Math.PI * 2);
    ctx.fill();
    if (this.t < this.growTime) {
      const glow = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, this.width * 1.4);
      glow.addColorStop(0, 'rgba(255,140,40,0.55)');
      glow.addColorStop(1, 'rgba(255,90,0,0)');
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.width * 1.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.restore();

    this.debris.render(ctx);
  }
}
