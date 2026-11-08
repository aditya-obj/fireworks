import { ParticlePool, ParticleColor } from '../particles/particle';
import { FireworkEffect, SoundTriggerCallback } from './fireworkTypes';
import { Rocket } from './rocket';
import { Anar } from './anar';
import { Starburst } from './starburst';
import { RomanCandle } from './romanCandle';
import { Sparkler } from './sparkler';
import { GrandFinale } from './grandFinale';
import { AtomBomb } from './atomBomb';
import { SnakeTablet } from './snakeTablet';
import { Ladi } from './ladi';
import { Chakri } from './chakri';
import { Pencil } from './pencil';
import { SkyLantern } from './skyLantern';
import { DetectedGesture } from '../vision/gestureTypes';
import { COLORS } from './fireworkColors';

export class FireworkDirector {
  public pool: ParticlePool = new ParticlePool();
  private effects: FireworkEffect[] = [];
  private continuousAnars: Map<number, Anar> = new Map();
  private continuousSparklers: Map<number, Sparkler> = new Map();
  private continuousPencils: Map<number, Pencil> = new Map();
  private onSound?: SoundTriggerCallback;
  /** Screen shake amount (0..1), decays every frame; read by the app */
  public shake = 0;
  private addShake = (amount: number) => {
    this.shake = Math.min(1.2, this.shake + amount);
  };

  constructor(onSound?: SoundTriggerCallback) {
    this.onSound = onSound;
  }

  public setSoundCallback(cb: SoundTriggerCallback): void {
    this.onSound = cb;
  }

  /**
   * Handle gestures recognized in current frame
   */
  public handleGestures(
    gestures: DetectedGesture[],
    screenW: number,
    screenH: number
  ): void {
    const activeAnarHands = new Set<number>();
    const activeSparklerHands = new Set<number>();
    const activePencilHands = new Set<number>();

    for (const g of gestures) {
      const { type, triggerPoint, handIndex } = g;

      switch (type) {
        case 'ROCKET': {
          // Launch rocket from fingertip aimed toward top 15-30% of screen
          const targetY = screenH * (0.12 + Math.random() * 0.2);
          this.effects.push(new Rocket(triggerPoint.x, triggerPoint.y, targetY, this.onSound));
          break;
        }

        case 'ANAR': {
          activeAnarHands.add(handIndex);
          let anar = this.continuousAnars.get(handIndex);
          if (!anar || !anar.active) {
            anar = new Anar(triggerPoint.x, triggerPoint.y, this.onSound);
            this.continuousAnars.set(handIndex, anar);
            this.effects.push(anar);
          } else {
            anar.updatePosition(triggerPoint.x, triggerPoint.y);
          }
          break;
        }

        case 'STARBURST': {
          new Starburst(triggerPoint.x, triggerPoint.y, this.pool, this.onSound);
          break;
        }

        case 'ROMAN_CANDLE': {
          this.effects.push(new RomanCandle(triggerPoint.x, triggerPoint.y, this.onSound));
          break;
        }

        case 'PHOOLJHADI': {
          activeSparklerHands.add(handIndex);
          let sparkler = this.continuousSparklers.get(handIndex);
          if (!sparkler || !sparkler.active) {
            sparkler = new Sparkler(triggerPoint.x, triggerPoint.y, this.onSound);
            this.continuousSparklers.set(handIndex, sparkler);
            this.effects.push(sparkler);
          } else {
            sparkler.updatePosition(triggerPoint.x, triggerPoint.y);
          }
          break;
        }

        case 'ATOM_BOMB': {
          this.effects.push(new AtomBomb(triggerPoint.x, triggerPoint.y, this.onSound, this.addShake));
          break;
        }

        case 'LADI': {
          this.effects.push(new Ladi(triggerPoint.x, triggerPoint.y, screenH, this.onSound, this.addShake));
          break;
        }

        case 'SNAKE': {
          this.effects.push(new SnakeTablet(triggerPoint.x, triggerPoint.y, this.onSound, Math.max(0.8, screenH / 900)));
          break;
        }

        case 'HYDROGEN_BOMB': {
          this.effects.push(new AtomBomb(triggerPoint.x, triggerPoint.y, this.onSound, this.addShake, 2));
          break;
        }

        case 'CHAKRI': {
          // spins right where the circle was drawn
          this.effects.push(new Chakri(triggerPoint.x, triggerPoint.y, this.onSound));
          break;
        }

        case 'SKY_LANTERN': {
          const lanterns = this.effects.filter((e) => e instanceof SkyLantern).length;
          if (lanterns < 8) this.effects.push(new SkyLantern(triggerPoint.x, triggerPoint.y, screenH));
          break;
        }

        case 'PENCIL': {
          activePencilHands.add(handIndex);
          let pencil = this.continuousPencils.get(handIndex);
          if (!pencil || !pencil.active) {
            pencil = new Pencil(triggerPoint.x, triggerPoint.y, this.onSound);
            this.continuousPencils.set(handIndex, pencil);
            this.effects.push(pencil);
          }
          pencil.updatePosition(triggerPoint.x, triggerPoint.y, g.direction);
          break;
        }

        case 'GRAND_FINALE': {
          this.effects.push(new GrandFinale(screenW, screenH, this.onSound));
          break;
        }
      }
    }

    // Stop continuous Anars no longer active
    for (const [handIdx, anar] of this.continuousAnars.entries()) {
      if (!activeAnarHands.has(handIdx)) {
        anar.stop();
        this.continuousAnars.delete(handIdx);
      }
    }

    for (const [handIdx, pencil] of this.continuousPencils.entries()) {
      if (!activePencilHands.has(handIdx)) {
        pencil.stop();
        this.continuousPencils.delete(handIdx);
      }
    }

    // Stop continuous Sparklers no longer active
    for (const [handIdx, sparkler] of this.continuousSparklers.entries()) {
      if (!activeSparklerHands.has(handIdx)) {
        sparkler.stop();
        this.continuousSparklers.delete(handIdx);
      }
    }
  }

  /**
   * Main per-frame simulation and render step
   */
  public updateAndRender(dt: number, ctx: CanvasRenderingContext2D): void {
    // 1. Update active high-level firework systems
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const effect = this.effects[i];
      effect.update(dt, this.pool);
      if (!effect.active) {
        this.effects.splice(i, 1);
      }
    }

    this.shake = Math.max(0, this.shake - dt * 2.5);

    // Non-glowing layers (smoke, paper, ash) go under the additive sparks
    for (const effect of this.effects) effect.render?.(ctx);

    // 2. Update particle physics with micro-crackle pop callback
    this.pool.update(dt, (x: number, y: number, color: ParticleColor) => {
      // Spawn 3 micro-sparks on crackle pop
      for (let k = 0; k < 3; k++) {
        const angle = Math.random() * Math.PI * 2;
        const spd = Math.random() * 4 + 1;
        this.pool.spawn({
          x,
          y,
          vx: Math.cos(angle) * spd,
          vy: Math.sin(angle) * spd,
          color: COLORS.WHITE_HOT,
          fadeColor: color,
          size: 1.8,
          life: 0.18,
          drag: 0.9,
          gravity: 0.05
        });
      }
    });

    // 3. Render all glowing particles additively to canvas
    this.pool.render(ctx);
  }

  public clear(): void {
    this.effects = [];
    this.continuousAnars.clear();
    this.continuousSparklers.clear();
    this.continuousPencils.clear();
    this.pool.clear();
  }
}
