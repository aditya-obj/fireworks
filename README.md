# 🎆 Fireworks (Diwali 2026 Edition)

> **Turn your hands into authentic Diwali fireworks.**
> Wave, point, spin, spread — every gesture ignites a distinct firework directly over your webcam feed in real-time. Record reels, download festive postcards, and conduct the night sky.

📦 **Repository:** [https://github.com/aditya-obj/fireworks](https://github.com/aditya-obj/fireworks)

---

## ⚡ Quick Start

```bash
# Clone the repository
git clone git@github.com:aditya-obj/fireworks.git
cd fireworks

# Install dependencies (requires Node.js 18+)
pnpm install

# Run local development server
pnpm dev
```

Open `http://localhost:5173` in Google Chrome or Arc. Grant camera permission when prompted.

---

## 🖐️ Gesture → Pyrotechnic Matrix

| # | Firework | Gesture | Visual Description | Sound Design |
|---|----------|---------|-------------------|--------------|
| **1** | **Rocket (Rocket Peony / Willow)** | ☝️ **Index finger pointing up** | Upward climbing streak from fingertip with spark tail; detonates into a dazzling 240-spark spherical peony or drooping golden willow | Ascending frequency whistle ($320\text{Hz} \to 1600\text{Hz}$) $\to$ punchy sub-bass explosion |
| **2** | **Anar (Flowerpot Fountain)** | ✊ **Closed fist** | Continuous upward conical spray of golden-orange sparks erupting from fist with heavy gravity fallout and crackles | Sustained sizzling white-noise fountain loop with crackle impulses |
| **3** | **Starburst (Aerial Shell)** | ✋ **Open palm (5 spread)** | Instant radial explosive detonation originating at palm center; dual concentric rings (white-hot core + chromatic perimeter) | Sharp initial pop $\to$ deep $40\text{Hz}$ sub-bass boom |
| **4** | **Roman Candle** | ✌️ **Peace sign (Index + Middle)** | 5 rapid sequential fireballs (Ruby, Emerald, Gold, Blue, Violet) shooting upward, each bursting into 35 twinkling stars | Crisp rhythmic "fwoomp" pops |
| **5** | **Phooljhadi (Sparkler)** | 👌 **Pinch (Thumb + Index)** | Continuous crackling sparkler following pinch coordinates with branching jitter sparks; enables drawing glowing shapes in mid-air | Granular micro-impulse crackler modulated by hand movement |
| **6** | **Grand Finale** | 🙏 **Namaste (joined hands)** | Multi-shell salvo cascading across the entire screen, culminating in a glowing "HAPPY DIWALI" centerpiece with ceremonial diyas | Staggered barrage of rocket launches and thunderous booms |

---

## ⌨️ Controls & Hotkeys

- **`H` (Creator Mode):** Toggles all UI overlays off for recording clean video reels.
- **`R` (Record Reel):** Toggles in-browser video recording (combines canvas video + procedural audio into a ready-to-share `.webm` reel, max 30s).
- **`S` (Postcard Snap):** Captures high-res PNG photo with embossed gold `✨ Happy Diwali ✨` festive watermark.
- **`D` (Debug Tracker):** Toggles MediaPipe skeletal bone wireframe and landmark dots.
- **`M` (Mute):** Mutes/unmutes procedural sound synthesis.
- **`1` – `7` (Manual Triggers):** Direct keyboard triggers for testing each firework type.
- **Mouse Click:** Launches a rocket aimed at the click coordinate.

---

## 🛠️ Engineering Architecture

### 1. Ultra-Fast Vision Pipeline (< 1s Boot, 60fps Tracking)
- **Constraint Pinning:** Video feed strictly pinned to `640x480` (`video: { width: 640, height: 480 }`), dropping frame transfer latency under 5ms and preventing CPU/GPU thermal throttling.
- **Model:** MediaPipe Tasks Vision `HandLandmarker` utilizing `float16` quantization (~7.5MB model asset).
- **Execution Mode:** `runningMode: "VIDEO"` with GPU WebGL delegate. Temporal tracking across frames eliminates jitter without requiring heavy cold detection on every frame.
- **Rotation-Invariant Classification:** Finger states evaluated via Euclidean distance ratios relative to wrist and MCP joints, remaining accurate even when hands are tilted or angled.

### 2. High-Performance Particle Engine
- **Additive Blending:** Canvas 2D running `globalCompositeOperation = 'lighter'`. Overlapping sparks naturally bloom into white-hot intensity at the core.
- **Sub-frame Motion Blur:** Each particle draws a connecting trail between its previous $(x_{t-1}, y_{t-1})$ and current $(x_t, y_t)$ coordinates, giving cinematic motion blur at zero GPU shader overhead.
- **Particle Pool:** 3500 pre-allocated particle structs with zero heap allocation in the animation loop.

### 3. Pure Procedural Web Audio Engine
- **Zero MP3 downloads:** 100% synthesized in real-time via Web Audio API oscillators, bandpass noise generators, and biquad filters.
- **Organic Variation:** $\pm 8\%$ pitch, frequency sweep, and duration randomization on every shot so no two fireworks sound synthetic.
- **Direct Recording Multiplexing:** Audio routes simultaneously to system speakers and a `MediaStreamAudioDestinationNode` for clean video recording.

---

## 📄 License

MIT — see [LICENSE](LICENSE).
