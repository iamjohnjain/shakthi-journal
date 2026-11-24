import { useEffect, useRef } from 'react'

// Same four hues as --bg-gradient's radial blobs (globals.css) — ripples are
// drawn from the same palette so they read as the ambient background itself
// reacting to touch, not a separate effect layered on top of it. Each
// ripple blends two adjacent hues (not one flat color) so the blob itself
// has an internal color gradient, like light separating through water.
const PALETTE: [number, number, number][] = [
  [251, 138, 76],  // orange
  [166, 107, 245], // purple
  [91, 127, 255],  // blue
  [45, 212, 191],  // teal
]

const RIPPLE_DURATION_MS = 2600
const MAX_RADIUS_PX = 340
const MAX_CONCURRENT = 6
const SEGMENTS = 28 // points around each wobbly blob outline

interface Ripple {
  x: number
  y: number
  start: number
  seed: number
  colorA: [number, number, number]
  colorB: [number, number, number]
}

/** Traces one organic, wobbling closed path at the given base radius — not
    a perfect circle. Two overlaid sine terms at different frequencies (one
    per argument pair) perturb the radius per angle, so the outline reads as
    an irregular liquid blob rather than a sonar ping; `spin` rotates the
    wobble pattern over time so it churns rather than holding a fixed shape
    as it expands. */
function traceBlob(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number, baseRadius: number,
  seed: number, spin: number, wobbleAmount: number,
) {
  ctx.beginPath()
  for (let i = 0; i <= SEGMENTS; i++) {
    const angle = (i / SEGMENTS) * Math.PI * 2
    const wobble =
      Math.sin(angle * 3 + seed + spin) * wobbleAmount +
      Math.sin(angle * 5 + seed * 1.7 - spin * 1.3) * wobbleAmount * 0.6
    const r = Math.max(0, baseRadius + wobble)
    const x = cx + Math.cos(angle) * r
    const y = cy + Math.sin(angle) * r
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  ctx.closePath()
}

/** Full-size canvas drawing an organic, liquid-colored blob wherever the
    user last touched — the actual "background reacts to touch" effect;
    the slow ambient drift in globals.css (--bg-gradient) is the resting
    state this layers on top of. Shaped and colored like light bending
    through moving water (wobbling, swirling, color-separated blobs that
    blend additively) rather than a flat ring/sonar ping.

    Rendered as the FIRST child of `.app-shell` (see Layout.tsx), not
    portaled behind the whole document — `.app-shell` paints its own
    opaque copy of --bg-gradient directly (Layout.css; deliberately, to
    work around a WebKit `background-attachment: fixed` repaint bug), which
    sits in front of <html>'s own background on every real app page. A
    canvas positioned behind the entire document was therefore invisible
    on any page using this layout; living inside `.app-shell` instead,
    above its background but below `.page-content`, actually puts it where
    a user can see it.

    Listens at the window level so a touch anywhere — including on a
    button or card sitting above this canvas — still spawns a ripple;
    `pointer-events: none` on the canvas itself means it never intercepts
    or blocks that touch from reaching whatever's actually underneath the
    finger. */
export default function AmbientRipple() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const ripplesRef = useRef<Ripple[]>([])
  const rafRef = useRef<number>(0)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Respect prefers-reduced-motion the same way the rest of the app does —
    // skip the animation loop and touch listener entirely rather than
    // spawning motion this user has explicitly asked to avoid.
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    let dpr = Math.min(window.devicePixelRatio || 1, 2)
    let width = window.innerWidth
    let height = window.innerHeight

    function resize() {
      width = window.innerWidth
      height = window.innerHeight
      canvas!.width = width * dpr
      canvas!.height = height * dpr
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    window.addEventListener('resize', resize)

    let colorCycle = 0
    function spawnRipple(x: number, y: number) {
      const colorA = PALETTE[colorCycle % PALETTE.length]
      const colorB = PALETTE[(colorCycle + 1) % PALETTE.length]
      colorCycle++
      ripplesRef.current.push({ x, y, start: performance.now(), seed: Math.random() * 1000, colorA, colorB })
      if (ripplesRef.current.length > MAX_CONCURRENT) ripplesRef.current.shift()
    }

    function onPointerDown(e: PointerEvent) {
      spawnRipple(e.clientX, e.clientY)
    }
    window.addEventListener('pointerdown', onPointerDown, { passive: true })

    function frame(now: number) {
      ctx!.clearRect(0, 0, width, height)
      ripplesRef.current = ripplesRef.current.filter(r => now - r.start < RIPPLE_DURATION_MS)
      ctx!.globalCompositeOperation = 'lighter'

      for (const r of ripplesRef.current) {
        const elapsed = now - r.start
        const t = elapsed / RIPPLE_DURATION_MS // 0 → 1
        // Ease-out — fast initial spread, slowing as it fades, like a real
        // wave losing energy rather than expanding at a constant rate.
        const eased = 1 - Math.pow(1 - t, 3)
        const radius = eased * MAX_RADIUS_PX
        const fade = Math.sin((1 - t) * Math.PI * 0.5) // smooth in, smooth out
        const spin = t * 2.4

        // Three layered blobs at different radii/wobble/color mixes —
        // overlapping, additively-blended, irregular shapes read as color
        // bleeding through liquid rather than one flat expanding disc.
        const layers: Array<{ scale: number; wobble: number; mix: number; alpha: number }> = [
          { scale: 1,    wobble: 34, mix: 0.15, alpha: 0.32 },
          { scale: 0.72, wobble: 22, mix: 0.55, alpha: 0.4 },
          { scale: 0.42, wobble: 12, mix: 0.85, alpha: 0.5 },
        ]

        for (const layer of layers) {
          const baseRadius = radius * layer.scale
          if (baseRadius <= 1) continue
          const [ar, ag, ab] = r.colorA
          const [br, bg, bb] = r.colorB
          const cr = ar + (br - ar) * layer.mix
          const cg = ag + (bg - ag) * layer.mix
          const cb = ab + (bb - ab) * layer.mix

          const grad = ctx!.createRadialGradient(r.x, r.y, 0, r.x, r.y, Math.max(1, baseRadius))
          grad.addColorStop(0, `rgba(${cr},${cg},${cb},${fade * layer.alpha})`)
          grad.addColorStop(0.7, `rgba(${cr},${cg},${cb},${fade * layer.alpha * 0.5})`)
          grad.addColorStop(1, `rgba(${cr},${cg},${cb},0)`)

          traceBlob(ctx!, r.x, r.y, baseRadius, r.seed + layer.mix * 10, spin * (layer.mix + 0.5), layer.wobble * (1 - t * 0.4))
          ctx!.fillStyle = grad
          ctx!.fill()
        }
      }

      rafRef.current = requestAnimationFrame(frame)
    }
    rafRef.current = requestAnimationFrame(frame)

    return () => {
      window.removeEventListener('resize', resize)
      window.removeEventListener('pointerdown', onPointerDown)
      cancelAnimationFrame(rafRef.current)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 0,
      }}
    />
  )
}
