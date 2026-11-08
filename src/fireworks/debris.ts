/**
 * Non-glowing debris drawn with normal blending (not additive):
 * smoke puffs, paper shreds and ash flakes. Glowing sparks still go
 * through the shared ParticlePool.
 */

interface Smoke {
  x: number; y: number; vx: number; vy: number;
  r: number; grow: number; alpha: number; maxAlpha: number;
  life: number; maxLife: number; shade: number;
}

interface Shred {
  x: number; y: number; vx: number; vy: number;
  w: number; h: number; rot: number; vrot: number;
  color: string; life: number; maxLife: number;
}

export class Debris {
  private smoke: Smoke[] = [];
  private shreds: Shred[] = [];

  get isEmpty(): boolean {
    return this.smoke.length === 0 && this.shreds.length === 0;
  }

  /** Soft grey puff that rises, expands and fades */
  addSmoke(x: number, y: number, opts: { r?: number; spread?: number; rise?: number; life?: number; alpha?: number; shade?: number } = {}): void {
    const spread = opts.spread ?? 1;
    const life = (opts.life ?? 2.2) * (0.8 + Math.random() * 0.4);
    this.smoke.push({
      x, y,
      vx: (Math.random() - 0.5) * 0.8 * spread,
      vy: -(opts.rise ?? 0.5) * (0.6 + Math.random() * 0.8),
      r: (opts.r ?? 14) * (0.7 + Math.random() * 0.6),
      grow: 0.35 + Math.random() * 0.35,
      alpha: 0,
      maxAlpha: (opts.alpha ?? 0.35) * (0.7 + Math.random() * 0.5),
      life, maxLife: life,
      shade: opts.shade ?? 150 + Math.random() * 50
    });
  }

  /** Tumbling bit of paper (red cracker paper, green twine, etc.) */
  addShred(x: number, y: number, color: string, power = 6): void {
    const a = Math.random() * Math.PI * 2;
    const s = Math.random() * power + 1;
    const life = 1.2 + Math.random() * 1.2;
    this.shreds.push({
      x, y,
      vx: Math.cos(a) * s,
      vy: Math.sin(a) * s - power * 0.35,
      w: 2 + Math.random() * 4, h: 1.5 + Math.random() * 2.5,
      rot: Math.random() * Math.PI, vrot: (Math.random() - 0.5) * 0.5,
      color, life, maxLife: life
    });
  }

  update(dt: number): void {
    const k = dt * 60; // physics tuned per 60fps frame
    for (let i = this.smoke.length - 1; i >= 0; i--) {
      const s = this.smoke[i];
      s.life -= dt;
      if (s.life <= 0) { this.smoke.splice(i, 1); continue; }
      s.x += s.vx * k;
      s.y += s.vy * k;
      s.vx *= Math.pow(0.985, k);
      s.vy *= Math.pow(0.99, k);
      s.r += s.grow * k;
      const t = 1 - s.life / s.maxLife;
      // quick fade-in, long fade-out
      s.alpha = s.maxAlpha * Math.min(1, t * 8) * Math.pow(1 - t, 1.4);
    }
    for (let i = this.shreds.length - 1; i >= 0; i--) {
      const p = this.shreds[i];
      p.life -= dt;
      if (p.life <= 0) { this.shreds.splice(i, 1); continue; }
      p.vx *= Math.pow(0.95, k);
      p.vy = p.vy * Math.pow(0.95, k) + 0.18 * k;
      p.vy = Math.min(p.vy, 2.2); // paper flutters down slowly
      p.x += p.vx * k + Math.sin(p.rot * 3) * 0.3 * k;
      p.y += p.vy * k;
      p.rot += p.vrot * k;
    }
  }

  render(ctx: CanvasRenderingContext2D): void {
    if (this.isEmpty) return;
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    for (const s of this.smoke) {
      if (s.alpha <= 0.005) continue;
      const g = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.r);
      const c = Math.round(s.shade);
      g.addColorStop(0, `rgba(${c},${c},${c + 6},${s.alpha.toFixed(3)})`);
      g.addColorStop(1, `rgba(${c},${c},${c + 6},0)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const p of this.shreds) {
      ctx.globalAlpha = Math.min(1, (p.life / p.maxLife) * 2);
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      // fake 3D tumble: width oscillates as the shred spins
      ctx.scale(Math.cos(p.rot * 2), 1);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    }
    ctx.restore();
  }
}
