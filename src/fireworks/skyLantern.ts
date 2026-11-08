import { ParticlePool } from '../particles/particle';
import { FireworkEffect } from './fireworkTypes';
import { COLORS } from './fireworkColors';

/**
 * Sky lantern (akash kandil): a glowing paper lantern with a small flame
 * inside that drifts slowly up and away, swaying, until it's a speck.
 * A quiet moment between the bangs.
 */
export class SkyLantern implements FireworkEffect {
  public active = true;
  private t = 0;
  private readonly life = 11;
  private sway = Math.random() * Math.PI * 2;
  private hue: [number, number, number];
  private size: number;

  constructor(private x: number, private y: number, screenH: number) {
    const hues: [number, number, number][] = [[255, 150, 60], [255, 120, 70], [255, 190, 90], [255, 100, 110]];
    this.hue = hues[Math.floor(Math.random() * hues.length)];
    this.size = Math.max(26, screenH * 0.045);
  }

  update(dt: number, pool: ParticlePool): void {
    this.t += dt;
    const rise = 38 + this.t * 6; // speeds up gently as it climbs
    this.y -= rise * dt;
    this.sway += dt * 0.9;
    this.x += Math.sin(this.sway) * 14 * dt + 6 * dt;
    if (Math.random() < 0.15) {
      pool.spawn({
        x: this.x + (Math.random() - 0.5) * 4, y: this.y + this.size * 0.55,
        vx: (Math.random() - 0.5) * 0.4, vy: 0.6,
        color: COLORS.GOLD, fadeColor: COLORS.DEEP_ORANGE,
        size: 1.1, life: 0.5, drag: 0.98, gravity: 0.03
      });
    }
    if (this.t > this.life || this.y < -this.size * 2) this.active = false;
  }

  render(ctx: CanvasRenderingContext2D): void {
    const depth = Math.max(0.25, 1 - this.t / this.life * 0.75); // shrinks with distance
    const s = this.size * depth;
    const fade = Math.min(1, (this.life - this.t) / 2.5, this.t * 2);
    const [r, g, b] = this.hue;
    const flicker = 0.85 + Math.random() * 0.15;
    const { x, y } = this;

    ctx.save();
    // warm halo
    ctx.globalCompositeOperation = 'lighter';
    const halo = ctx.createRadialGradient(x, y, 0, x, y, s * 2.4);
    halo.addColorStop(0, `rgba(${r},${g},${b},${(0.35 * fade * flicker).toFixed(3)})`);
    halo.addColorStop(1, `rgba(${r},${g},${b},0)`);
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(x, y, s * 2.4, 0, Math.PI * 2);
    ctx.fill();

    // paper body: tapered, brighter near the flame at the bottom
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = fade;
    const top = y - s * 0.6, bottom = y + s * 0.55;
    const body = ctx.createLinearGradient(0, top, 0, bottom);
    body.addColorStop(0, `rgba(${r - 40},${g - 50},${b - 30},0.92)`);
    body.addColorStop(1, `rgba(255,${Math.min(255, g + 70)},${Math.min(255, b + 80)},0.95)`);
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.moveTo(x - s * 0.42, top);
    ctx.quadraticCurveTo(x, top - s * 0.12, x + s * 0.42, top);
    ctx.lineTo(x + s * 0.3, bottom);
    ctx.quadraticCurveTo(x, bottom + s * 0.06, x - s * 0.3, bottom);
    ctx.closePath();
    ctx.fill();
    // paper seams
    ctx.strokeStyle = `rgba(120,50,20,${(0.25 * fade).toFixed(3)})`;
    ctx.lineWidth = 1;
    for (const k of [-0.18, 0.18]) {
      ctx.beginPath();
      ctx.moveTo(x + s * k * 2.1, top + 1);
      ctx.lineTo(x + s * k * 1.55, bottom - 1);
      ctx.stroke();
    }
    // flame
    ctx.globalCompositeOperation = 'lighter';
    const fl = ctx.createRadialGradient(x, bottom - s * 0.1, 0, x, bottom - s * 0.1, s * 0.35);
    fl.addColorStop(0, `rgba(255,250,220,${flicker.toFixed(2)})`);
    fl.addColorStop(1, 'rgba(255,140,30,0)');
    ctx.fillStyle = fl;
    ctx.beginPath();
    ctx.arc(x, bottom - s * 0.1, s * 0.35, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}
