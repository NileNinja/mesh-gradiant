# MeshStudio

A production-grade animated mesh gradient editor built on raw WebGL2 — no framework dependencies in the engine.

**Live tool:** run `npm run dev` and open http://localhost:5173

---

## Features

### Render Modes
| Mode | Description |
|------|-------------|
| Waves | 3D displaced mesh grid — the classic Stripe look |
| Blobs | SDF metaball blobs that orbit and merge smoothly |
| Hybrid | Waves + blob layer composited (in development) |

### Materials
| Material | Effect |
|----------|--------|
| Standard | Clean gradient, no extra effects |
| Iridescent | View-angle rainbow sheen via fake Fresnel |
| Glass | Refraction distortion + chromatic aberration |
| Plasma | High-frequency turbulent noise tendrils |
| Silk | Anisotropic directional streak — calm, airy |

### Motion Modes
Flow · Drift · Swirl · Ripple · Pulse · Breathe · Aurora — each tunes displacement/twist/speed. Editing any raw slider switches to **Custom**.

### Color Stops
- Up to 8 stops with per-stop **opacity** (alpha)
- **Drag to reorder** stops — drop indicators show insert position
- Color picker + hex label + alpha slider per row

### Presets
20 built-in presets (10 classic + 10 new material/mode combinations):
- Stripe Classic, Midnight, Aurora, Sunset, Ocean, Nebula, Neon Cyber, Peach Blossom, Forest, Retro Gold
- Stripe Hero, Liquid Glass, Iridescent Pearl, Plasma Storm, Aurora Borealis, Silk Calm, Neon Pulse, Glass Bubbles, Holographic, Cosmic Drift

Save unlimited custom presets via ⭐ Save or press `S`.

### Exports
Open the **↓ Export** modal to generate ready-to-use code:

| Tab | Output |
|-----|--------|
| CSS | Static `radial-gradient` CSS approximation (no JS, no animation) |
| Next.js | `MeshGradient.tsx` + SSR-safe loader + README |
| React | Generic `MeshGradient.tsx` for Vite / CRA |
| Vanilla HTML | Self-contained HTML + CSS fallback |
| Web Component | `<mesh-gradient>` custom element |
| Media | PNG export, WebM recording, ffmpeg conversion tips |

All animated exports use the bundled **MeshGradientRuntime** which includes:
- `IntersectionObserver` auto-pause when off-screen
- `prefers-reduced-motion` respect
- `ResizeObserver` for responsive containers
- DPR cap (default 1.5×)
- Runtime props: `colors`, `speed`, `seed`, `motionMode`, etc.

### Performance
- Adaptive quality: frame-time EMA auto-tiers `meshDetail` (32→48→64→80→96→112→128)
- Editor canvas pauses via `IntersectionObserver` when scrolled out of viewport
- FXAA anti-aliasing pass (cheap — context uses `antialias:false`)
- Bloom at half resolution — bilinear upscale is imperceptible

---

## Dev commands

```bash
npm install
npm run dev      # dev server at :5173
npm run build    # production build → dist/
npm run preview  # preview the production build
```

## Keyboard shortcuts

| Key | Action |
|-----|--------|
| `Space` | Play / Pause |
| `P` | Export PNG |
| `R` | Record WebM |
| `T` | Toggle panel |
| `W` | Wireframe mode |
| `S` | Save preset |

## Tech stack

- TypeScript + Vite (no framework)
- WebGL2 (GLSL ES 3.00)
- No UI library (lil-gui removed — hand-rolled DOM)
- No math library (gl-matrix listed but engine uses inline mat4/vec3)
- Bundle: ~24 KB gzipped

## Embed quickstart (Next.js)

```tsx
// 1. Copy MeshGradient.tsx + MeshGradientLoader.tsx from the Export → Next.js tab
// 2. In your layout:
import { MeshGradient } from '@/components/MeshGradientLoader';

export default function RootLayout({ children }) {
  return (
    <html>
      <body className="relative">
        <MeshGradient className="fixed inset-0 -z-10" />
        {children}
      </body>
    </html>
  );
}
```

## License

MIT — use freely in personal and commercial projects.
