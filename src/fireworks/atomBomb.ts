import { ParticlePool } from '../particles/particle';
import { FireworkEffect, SoundTriggerCallback, ShakeCallback } from './fireworkTypes';
import { COLORS } from './fireworkColors';
import { Debris } from './debris';

/**
 * Atom bomb (sutli bomb): a twine-wrapped ground cracker.
 * power 2 = Hydrogen bomb: longer fuse, double blast, bigger shockwaves,
 * a full-screen white-out and a rising mushroom of smoke.
 * A short sizzling fuse, then one huge white flash and bang, a shockwave,
 * shreds of green twine / red band / kraft paper, and a thick smoke cloud.
 * No colored stars — it's all about the blast.
 */
export class AtomBomb implements FireworkEffect {
  public active = true;
  private t = 0;
  private readonly fuseTime: number;
  private whiteout = 0;
  private second = -1; // time of the hydrogen bomb's second blast
  private detonated = false;
  private ring = { r: 0, alpha: 0 };
  private debris = new Debris();

  constructor(
    private x: number,
    private y: number,
    private onSound?: SoundTriggerCallback,
    private onShake?: ShakeCallback,
    private power: 1 | 2 = 1
  ) {
    this.fuseTime = power === 2 ? 0.75 : 0.45;
    onSound?.('FUSE');
  }

  update(dt: number, pool: ParticlePool): void {
    this.t += dt;

    if (!this.detonated) {
      // Fuse: a tight spray of orange sparks
      for (let i = 0; i < 4; i++) {
        const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.6;
        const s = Math.random() * 3 + 1;
        pool.spawn({
          x: this.x, y: this.y,
          vx: Math.cos(a) * s, vy: Math.sin(a) * s,
          color: COLORS.WHITE_HOT, fadeColor: COLORS.AMBER,
          size: 1.6, life: 0.18 + Math.random() * 0.15, drag: 0.92, gravity: 0.12
        });
      }
      if (Math.random() < 0.3) this.debris.addSmoke(this.x, this.y, { r: 6, life: 1.2, alpha: 0.18 });
      if (this.t >= this.fuseTime) this.detonate(pool);
    } else {
      const maxR = this.power === 2 ? 620 : 320;
      this.ring.r += dt * 900 * this.power * Math.max(0.25, 1 - this.ring.r / maxR);
      this.ring.alpha = Math.max(0, this.ring.alpha - dt * (this.power === 2 ? 1.8 : 3));
      this.whiteout = Math.max(0, this.whiteout - dt * 1.6);
      if (this.second > 0 && this.t >= this.second) {
        this.second = -1;
        this.blast(pool, 0.7);
      }
      // Hydrogen bomb: smoke keeps feeding a rising mushroom column
      if (this.power === 2 && this.t < this.fuseTime + 2.2 && Math.random() < dt * 22) {
        const k = this.t - this.fuseTime;
        this.debris.addSmoke(this.x + (Math.random() - 0.5) * 40, this.y - k * 120, {
          r: 30 + k * 18, spread: 2, rise: 1.4, life: 3.4, alpha: 0.32, shade: 175 + Math.random() * 40
        });
      }
    }

    this.debris.update(dt);
    if (this.detonated && this.second < 0 && this.ring.alpha <= 0 && this.whiteout <= 0 && this.debris.isEmpty) this.active = false;
  }

  private detonate(pool: ParticlePool): void {
    this.detonated = true;
    this.onSound?.(this.power === 2 ? 'HYDROGEN_BLAST' : 'ATOM_BLAST');
    this.blast(pool, 1);
    if (this.power === 2) {
      this.whiteout = 0.85;
      this.second = this.t + 0.28;
    }
  }

  private blast(pool: ParticlePool, scale: number): void {
    const { x, y } = this;
    const p = this.power * scale;
    this.onShake?.(this.power === 2 ? 1.2 * scale : 1);

    // Blinding white flash that lights up the whole room, then a warm afterglow
    pool.addFlash(x, y, 1500 * p, COLORS.WHITE_HOT, 1);
    pool.addFlash(x, y, 700 * p, COLORS.AMBER, 0.8);
    this.ring = { r: 10, alpha: 0.9 };

    // Very fast, very short white-hot sparks (a bang, not a bloom)
    for (let i = 0; i < 160 * p; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = (Math.random() * 18 + 8) * (this.power === 2 ? 1.4 : 1);
      pool.spawn({
        x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        color: COLORS.WHITE_HOT, fadeColor: COLORS.GOLD,
        size: 2.6, life: 0.18 + Math.random() * 0.25, drag: 0.86, gravity: 0.05
      });
    }
    // A few heavier embers that arc and fall
    for (let i = 0; i < 30 * p; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.6;
      const s = Math.random() * 9 + 4;
      pool.spawn({
        x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        color: COLORS.GOLD, fadeColor: COLORS.DEEP_ORANGE,
        size: 2.2, life: 0.8 + Math.random() * 0.6, drag: 0.96, gravity: 0.22, flicker: true
      });
    }
    // Twine, red band and kraft paper shreds
    const colors = ['#4f7a3a', '#5e8a45', '#c62828', '#d8c39a', '#b89b6a'];
    for (let i = 0; i < 80 * p; i++) {
      this.debris.addShred(x, y, colors[i % colors.length], 11 * (this.power === 2 ? 1.5 : 1));
    }
    // Thick smoke cloud
    for (let i = 0; i < 22 * p; i++) {
      this.debris.addSmoke(
        x + (Math.random() - 0.5) * 50, y + (Math.random() - 0.5) * 30,
        { r: 34, spread: 3, rise: 0.55, life: 3.6, alpha: 0.42, shade: 185 + Math.random() * 40 }
      );
    }
  }

  render(ctx: CanvasRenderingContext2D): void {
    if (this.whiteout > 0) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = `rgba(255,248,235,${(this.whiteout * 0.7).toFixed(3)})`;
      ctx.fillRect(-50, -50, ctx.canvas.width + 100, ctx.canvas.height + 100);
      ctx.restore();
    }
    this.debris.render(ctx);
    if (this.ring.alpha > 0) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = `rgba(255,245,225,${(this.ring.alpha * 0.55).toFixed(3)})`;
      ctx.lineWidth = 2 + this.ring.alpha * 10;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.ring.r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }
}
