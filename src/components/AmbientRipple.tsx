import { useEffect, useRef } from 'react'

// Same four hues as --bg-gradient's radial blobs (globals.css) — ripples are
// drawn from the same palette so they read as the ambient background itself
// reacting to touch, not a separate effect layered on top of it.
const RIPPLE_COLORS = [
  'rgba(251, 138, 76, OPACITY)',  // orange
  'rgba(91, 127, 255, OPACITY)',  // blue
  'rgba(166, 107, 245, OPACITY)', // purple
  'rgba(45, 212, 191, OPACITY)',  // teal
]

const RIPPLE_DURATION_MS = 2200
const MAX_RADIUS_PX = 420
const MAX_CONCURRENT = 8

interface Ripple {
  x: number
  y: number
  start: number
  color: string
}

/** Full-size canvas drawing an expanding, fading ring wherever the user last
    touched — the actual "background reacts to touch" effect; the slow
    ambient drift in globals.css (--bg-gradient) is the resting state this
    layers on top of.

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
      const color = RIPPLE_COLORS[colorCycle % RIPPLE_COLORS.length]
      colorCycle++
      ripplesRef.current.push({ x, y, start: performance.now(), color })
      if (ripplesRef.current.length > MAX_CONCURRENT) ripplesRef.current.shift()
    }

    function onPointerDown(e: PointerEvent) {
      spawnRipple(e.clientX, e.clientY)
    }
    window.addEventListener('pointerdown', onPointerDown, { passive: true })

    function frame(now: number) {
      ctx!.clearRect(0, 0, width, height)
      ripplesRef.current = ripplesRef.current.filter(r => now - r.start < RIPPLE_DURATION_MS)

      for (const r of ripplesRef.current) {
        const elapsed = now - r.start
        const t = elapsed / RIPPLE_DURATION_MS // 0 → 1
        // Ease-out — fast initial spread, slowing as it fades, like a real
        // wave losing energy rather than expanding at a constant rate.
        const eased = 1 - Math.pow(1 - t, 3)
        const radius = eased * MAX_RADIUS_PX
        const fade = 1 - t

        // Two concentric rings per ripple (a leading edge + a softer
        // trailing one) read as a wave crest rather than a single flat
        // circle — closer to water than a sonar ping.
        for (const [offset, widthPx, opacityMul] of [[0, 2.5, 0.55], [-26, 10, 0.22]] as const) {
          const ringRadius = Math.max(0, radius + offset)
          if (ringRadius <= 0) continue
          ctx!.beginPath()
          ctx!.arc(r.x, r.y, ringRadius, 0, Math.PI * 2)
          ctx!.strokeStyle = r.color.replace('OPACITY', String(fade * opacityMul))
          ctx!.lineWidth = widthPx
          ctx!.globalCompositeOperation = 'lighter'
          ctx!.stroke()
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
