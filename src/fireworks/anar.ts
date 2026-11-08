import { ParticlePool } from '../particles/particle';
import { FireworkEffect, SoundTriggerCallback } from './fireworkTypes';
import { COLORS } from './fireworkColors';

/**
 * 4-Tier Volcanic Anar Engine
 * Authentically replicates a high-grade Indian Diwali flowerpot:
 * 1. Blinding white-hot molten throat jet
 * 2. Dense towering sodium gold vertical plume
 * 3. Graceful weeping willow umbrella canopy drooping under gravity
 * 4. Crackling titanium flower sputters at the perimeter
 */
export class Anar implements FireworkEffect {
  public active: boolean = true;
  private x: number;
  private y: number;
  private onSound?: SoundTriggerCallback;

  constructor(x: number, y: number, onSound?: SoundTriggerCallback) {
    this.x = x;
    this.y = y;
    this.onSound = onSound;
  }

  public updatePosition(x: number, y: number): void {
    this.x = x;
    this.y = y;
  }

  public update(_dt: number, pool: ParticlePool): void {
    if (!this.active) return;

    this.onSound?.('ANAR_LOOP');

    // Intense dynamic golden torchlight pulsing over the user's hand, face, and chest
    pool.addFlash(this.x, this.y - 60, 320, COLORS.GOLD, 0.42);

    // ========================================================
    // TIER 1: Blinding White Molten Throat Jet
    // High-velocity, ultra-tight vertical plasma core
    // ========================================================
    const jetCount = 12;
    for (let j = 0; j < jetCount; j++) {
      const angle = -Math.PI / 2 + (Math.random() - 0.5) * 0.12; // Tight 7-degree beam
      const speed = 26 + Math.random() * 10;
      pool.spawn({
        x: this.x + (Math.random() - 0.5) * 6,
        y: this.y - Math.random() * 15,
        vx: Math.cos(angle) * speed + (Math.random() - 0.5) * 1.2,
        vy: Math.sin(angle) * speed,
        color: COLORS.WHITE_HOT,
        fadeColor: COLORS.GOLD,
        size: 5.2,
        life: 0.32 + Math.random() * 0.15,
        drag: 0.95,
        gravity: 0.15,
        flicker: false,
        crackle: false
      });
    }

    // ========================================================
    // TIER 2: Towering Sodium Gold Plume
    // Dense vertical column filling the fountain core
    // ========================================================
    const plumeCount = 28;
    for (let p = 0; p < plumeCount; p++) {
      const angle = -Math.PI / 2 + (Math.random() - 0.5) * 0.32; // 18-degree cone
      const speed = 20 + Math.random() * 12;
      const isWhite = Math.random() < 0.25;

      pool.spawn({
        x: this.x + (Math.random() - 0.5) * 10,
        y: this.y + (Math.random() - 0.5) * 6,
        vx: Math.cos(angle) * speed + (Math.random() - 0.5) * 2,
        vy: Math.sin(angle) * speed,
        color: isWhite ? COLORS.WHITE_HOT : COLORS.GOLD,
        fadeColor: COLORS.AMBER,
        size: 3.4,
        life: 0.75 + Math.random() * 0.4,
        drag: 0.965,
        gravity: 0.38,
        flicker: true,
        crackle: Math.random() < 0.2
      });
    }

    // ========================================================
    // TIER 3: Weeping Willow Umbrella Canopy
    // Wider parabolic arcs that curve and cascade downward
    // ========================================================
    const willowCount = 24;
    for (let w = 0; w < willowCount; w++) {
      const angle = -Math.PI / 2 + (Math.random() - 0.5) * 0.85; // 48-degree wide fan
      const speed = 14 + Math.random() * 11;

      pool.spawn({
        x: this.x + (Math.random() - 0.5) * 12,
        y: this.y + (Math.random() - 0.5) * 6,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        color: COLORS.GOLD,
        fadeColor: COLORS.DEEP_ORANGE,
        size: 3.0,
        life: 0.95 + Math.random() * 0.55, // Longer persistence so trails cascade
        drag: 0.968,
        gravity: 0.44, // Heavy gravity produces the signature weeping umbrella curve
        flicker: true,
        crackle: Math.random() < 0.25
      });
    }

    // ========================================================
    // TIER 4: Titanium Flower Flakes
    // Perimeter sparks that crackle and pop into secondary stars
    // ========================================================
    const flowerCount = 8;
    for (let f = 0; f < flowerCount; f++) {
      const angle = -Math.PI / 2 + (Math.random() - 0.5) * 0.95;
      const speed = 12 + Math.random() * 10;

      pool.spawn({
        x: this.x + (Math.random() - 0.5) * 8,
        y: this.y + (Math.random() - 0.5) * 6,
        vx: Math.cos(angle) * speed * 1.1,
        vy: Math.sin(angle) * speed,
        color: COLORS.WHITE_HOT,
        fadeColor: COLORS.AMBER,
        size: 3.6,
        life: 0.65 + Math.random() * 0.35,
        drag: 0.955,
        gravity: 0.4,
        flicker: true,
        crackle: true // Triggers secondary branching spark pop on death!
      });
    }
  }

  public stop(): void {
    this.active = false;
  }
}
