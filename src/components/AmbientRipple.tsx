import { useEffect, useRef } from 'react'

// Same four hues and rough positions as --bg-gradient's radial blobs
// (globals.css) — this canvas is meant to read as THOSE colors moving, not
// a separate effect layered on top of them. Positions are fractions of
// viewport width/height, matching --bg-gradient's own blob centers.
const BLOBS: { x: number; y: number; rgb: [number, number, number] }[] = [
  { x: 0.12, y: -0.05, rgb: [251, 138, 76] },  // orange
  { x: 0.92, y: -0.02, rgb: [91, 127, 255] },  // blue
  { x: 0.5,  y: 0.38,  rgb: [166, 107, 245] }, // purple
  { x: 0.5,  y: 1.0,   rgb: [45, 212, 191] },  // teal
]

const MAX_CONCURRENT = 3
const MIN_SPAWN_GAP_MS = 220 // a rapid flurry of taps still only spawns a few
const RIPPLE_DURATION_MS = 3400
const MAX_RADIUS_PX = 300

interface Ripple {
  x: number
  y: number
  start: number
}

/** Full-size canvas layered just above `.app-shell`'s own ambient gradient
    (Layout.tsx/.css) and below the actual nav/page content. Two things
    happen here, both deliberately calm:

    1. A continuous, very low-amplitude idle shimmer — the same four hues/
       positions as the CSS gradient, gently pulsing — so the background
       reads as "constantly softly moving" even with no touch at all,
       rather than static until poked.
    2. On touch, a single expanding ring of brightness moves outward from
       that point THROUGH the existing hue at that location (sampling each
       blob's own color, not introducing a new one) and fades back to the
       idle baseline — pushing the color that's already there, not adding
       a new shape on top of it.

    Deliberately NOT additive ('lighter') blending — that sums brightness
    every time ripples overlap and blows out to a solid white flash with
    enough rapid taps, which is exactly the bug this replaced. Normal alpha
    compositing with a hard cap on concurrent ripples (plus a minimum gap
    between spawns) means no amount of rapid clicking can ever exceed a
    fixed, modest brightness ceiling. */
export default function AmbientRipple() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const ripplesRef = useRef<Ripple[]>([])
  const lastSpawnRef = useRef(0)
  const rafRef = useRef<number>(0)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

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

    // A static frame is enough under reduced-motion — one idle paint of the
    // base hues, no touch listener, no animation loop at all.
    if (reduceMotion) {
      drawIdle(ctx, width, height, 0)
      return () => window.removeEventListener('resize', resize)
    }

    function onPointerDown(e: PointerEvent) {
      const now = performance.now()
      if (now - lastSpawnRef.current < MIN_SPAWN_GAP_MS) return
      lastSpawnRef.current = now
      ripplesRef.current.push({ x: e.clientX, y: e.clientY, start: now })
      if (ripplesRef.current.length > MAX_CONCURRENT) ripplesRef.current.shift()
    }
    window.addEventListener('pointerdown', onPointerDown, { passive: true })

    // Pause entirely when the app isn't visible (backgrounded, screen
    // locked, switched away from) — there's no reason to keep a canvas
    // loop running and draining battery for a screen nobody's looking at.
    let paused = document.visibilityState === 'hidden'
    function onVisibility() {
      paused = document.visibilityState === 'hidden'
      if (!paused) rafRef.current = requestAnimationFrame(frame)
    }
    document.addEventListener('visibilitychange', onVisibility)

    let lastDraw = 0
    const FRAME_INTERVAL_MS = 1000 / 30 // capped at 30fps — this is slow
    // ambient motion, not an action game; nothing here needs 60fps, and
    // halving the redraw rate roughly halves this component's CPU/GPU cost.

    function drawIdle(c: CanvasRenderingContext2D, w: number, h: number, t: number) {
      c.clearRect(0, 0, w, h)
      for (let i = 0; i < BLOBS.length; i++) {
        const b = BLOBS[i]
        // Slow, gentle pulse — a few percent of radius, out of phase per
        // blob so they don't breathe in unison.
        const pulse = 1 + Math.sin(t / 5200 + i * 2.1) * 0.06
        const cx = b.x * w
        const cy = b.y * h
        const r = Math.max(w, h) * 0.55 * pulse
        const [red, g, bl] = b.rgb
        const grad = c.createRadialGradient(cx, cy, 0, cx, cy, r)
        grad.addColorStop(0, `rgba(${red},${g},${bl},0.05)`)
        grad.addColorStop(1, `rgba(${red},${g},${bl},0)`)
        c.fillStyle = grad
        c.fillRect(0, 0, w, h)
      }
    }

    function frame(now: number) {
      if (paused) return // visibilitychange's handler restarts the loop
      if (now - lastDraw < FRAME_INTERVAL_MS) {
        rafRef.current = requestAnimationFrame(frame)
        return
      }
      lastDraw = now

      drawIdle(ctx!, width, height, now)
      ripplesRef.current = ripplesRef.current.filter(r => now - r.start < RIPPLE_DURATION_MS)

      for (const r of ripplesRef.current) {
        const elapsed = now - r.start
        const t = elapsed / RIPPLE_DURATION_MS
        const eased = 1 - Math.pow(1 - t, 2.5)
        const radius = eased * MAX_RADIUS_PX
        // Rises quickly, decays slowly — a wave crest, not a flash — and
        // the ceiling (0.22) is fixed regardless of how many ripples are
        // active at once, so stacking several never compounds past it.
        const fade = Math.sin(Math.min(1, t * 2.2) * Math.PI * 0.5) * (1 - t) * 0.22
        if (fade <= 0.002 || radius <= 1) continue

        // Colored by whichever ambient blob is nearest this touch point —
        // the ripple pushes the hue that's already there, rather than
        // introducing an unrelated one.
        let nearest = BLOBS[0]
        let nearestDist = Infinity
        for (const b of BLOBS) {
          const dx = r.x - b.x * width
          const dy = r.y - b.y * height
          const d = dx * dx + dy * dy
          if (d < nearestDist) { nearestDist = d; nearest = b }
        }
        const [red, g, bl] = nearest.rgb

        const grad = ctx!.createRadialGradient(r.x, r.y, Math.max(0, radius - 70), r.x, r.y, radius)
        grad.addColorStop(0, `rgba(${red},${g},${bl},0)`)
        grad.addColorStop(0.7, `rgba(${red},${g},${bl},${fade})`)
        grad.addColorStop(1, `rgba(${red},${g},${bl},0)`)
        ctx!.beginPath()
        ctx!.arc(r.x, r.y, radius, 0, Math.PI * 2)
        ctx!.fillStyle = grad
        ctx!.fill()
      }

      rafRef.current = requestAnimationFrame(frame)
    }
    rafRef.current = requestAnimationFrame(frame)

    return () => {
      window.removeEventListener('resize', resize)
      window.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('visibilitychange', onVisibility)
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
