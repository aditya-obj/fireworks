/**
 * Ultra High-Fidelity Pyrotechnic Particle Engine
 * Multi-pass additive bloom, volumetric motion streaks,
 * and dynamic ambient room illumination.
 */

export interface ParticleColor {
  r: number;
  g: number;
  b: number;
}

export interface Particle {
  active: boolean;
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  vx: number;
  vy: number;
  color: ParticleColor;
  fadeColor: ParticleColor;
  alpha: number;
  size: number;
  life: number;
  maxLife: number;
  drag: number;
  gravity: number;
  flicker: boolean;
  crackle: boolean;
  trail: boolean;
}

export interface AmbientFlash {
  x: number;
  y: number;
  radius: number;
  color: ParticleColor;
  alpha: number;
  decay: number;
}

export class ParticlePool {
  private pool: Particle[] = [];
  public activeCount: number = 0;
  private readonly MAX_PARTICLES: number = 7500; // Increased pool for massive volcanic density
  public flashes: AmbientFlash[] = [];

  constructor() {
    for (let i = 0; i < this.MAX_PARTICLES; i++) {
      this.pool.push({
        active: false,
        x: 0,
        y: 0,
        prevX: 0,
        prevY: 0,
        vx: 0,
        vy: 0,
        color: { r: 255, g: 255, b: 255 },
        fadeColor: { r: 255, g: 180, b: 0 },
        alpha: 1,
        size: 3,
        life: 1,
        maxLife: 1,
        drag: 0.98,
        gravity: 0.05,
        flicker: false,
        crackle: false,
        trail: true
      });
    }
  }

  public spawn(config: {
    x: number;
    y: number;
    vx: number;
    vy: number;
    color: ParticleColor;
    fadeColor?: ParticleColor;
    size?: number;
    life: number;
    drag?: number;
    gravity?: number;
    flicker?: boolean;
    crackle?: boolean;
    trail?: boolean;
  }): Particle | null {
    for (let i = 0; i < this.MAX_PARTICLES; i++) {
      const p = this.pool[i];
      if (!p.active) {
        p.active = true;
        p.x = config.x;
        p.y = config.y;
        p.prevX = config.x;
        p.prevY = config.y;
        p.vx = config.vx;
        p.vy = config.vy;
        p.color = config.color;
        p.fadeColor = config.fadeColor || { r: 255, g: 160, b: 40 };
        p.size = config.size ?? 3.2;
        p.life = config.life;
        p.maxLife = config.life;
        p.alpha = 1;
        p.drag = config.drag ?? 0.975;
        p.gravity = config.gravity ?? 0.08;
        p.flicker = config.flicker ?? false;
        p.crackle = config.crackle ?? false;
        p.trail = config.trail ?? true;
        this.activeCount++;
        return p;
      }
    }
    return null;
  }

  public addFlash(x: number, y: number, radius: number, color: ParticleColor, intensity: number = 0.5): void {
    this.flashes.push({
      x,
      y,
      radius,
      color,
      alpha: Math.min(1.0, intensity),
      decay: 3.5
    });
  }

  public update(dt: number, onCrackle?: (x: number, y: number, color: ParticleColor) => void): void {
    let count = 0;
    for (let i = 0; i < this.MAX_PARTICLES; i++) {
      const p = this.pool[i];
      if (!p.active) continue;

      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        if (p.crackle && onCrackle && Math.random() < 0.7) {
          onCrackle(p.x, p.y, p.color);
        }
        continue;
      }

      count++;
      p.prevX = p.x;
      p.prevY = p.y;

      p.vx *= p.drag;
      p.vy = p.vy * p.drag + p.gravity;
      p.x += p.vx;
      p.y += p.vy;

      const lifeRatio = p.life / p.maxLife;
      p.alpha = Math.min(1.0, Math.pow(lifeRatio, 1.35));

      if (p.flicker && Math.random() < 0.35) {
        p.alpha *= 0.35 + Math.random() * 0.65;
      }
    }
    this.activeCount = count;

    for (let f = this.flashes.length - 1; f >= 0; f--) {
      const flash = this.flashes[f];
      flash.alpha -= flash.decay * dt;
      if (flash.alpha <= 0) {
        this.flashes.splice(f, 1);
      }
    }
  }

  public render(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    // 1. Dynamic Ambient Light Flash (casts light on user's face and room)
    for (const flash of this.flashes) {
      if (flash.alpha <= 0.01) continue;
      const grad = ctx.createRadialGradient(
        flash.x,
        flash.y,
        0,
        flash.x,
        flash.y,
        flash.radius
      );
      const { r, g, b } = flash.color;
      grad.addColorStop(0, `rgba(${r},${g},${b},${(flash.alpha * 0.45).toFixed(3)})`);
      grad.addColorStop(0.45, `rgba(${r},${g},${b},${(flash.alpha * 0.16).toFixed(3)})`);
      grad.addColorStop(1, `rgba(${r},${g},${b},0)`);

      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(flash.x, flash.y, flash.radius, 0, Math.PI * 2);
      ctx.fill();
    }

    if (this.activeCount === 0) {
      ctx.restore();
      return;
    }

    // 2. High-Energy Streaks & Halos
    for (let i = 0; i < this.MAX_PARTICLES; i++) {
      const p = this.pool[i];
      if (!p.active || p.alpha <= 0.01) continue;

      const progress = 1 - p.life / p.maxLife;
      const r = Math.round(p.color.r + (p.fadeColor.r - p.color.r) * progress);
      const g = Math.round(p.color.g + (p.fadeColor.g - p.color.g) * progress);
      const b = Math.round(p.color.b + (p.fadeColor.b - p.color.b) * progress);

      const colorStr = `rgba(${r},${g},${b},${p.alpha.toFixed(2)})`;
      const coreColorStr = `rgba(255,255,255,${(p.alpha * 0.95).toFixed(2)})`;

      // Motion Trail Line
      if (p.trail) {
        ctx.strokeStyle = colorStr;
        ctx.lineWidth = Math.max(1.8, p.size * p.alpha);
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(p.prevX, p.prevY);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
      }

      // Outer Bloom Halo
      ctx.fillStyle = colorStr;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * 1.9 * p.alpha, 0, Math.PI * 2);
      ctx.fill();

      // Blinding White-Hot Core Spark
      ctx.fillStyle = coreColorStr;
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(1.1, p.size * 0.65 * p.alpha), 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  public clear(): void {
    for (let i = 0; i < this.MAX_PARTICLES; i++) {
      this.pool[i].active = false;
    }
    this.activeCount = 0;
    this.flashes = [];
  }
}
