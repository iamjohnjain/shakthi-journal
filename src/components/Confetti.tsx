import { useEffect, useRef } from 'react'
import './Confetti.css'

// Brand-colored pieces only (not a random rainbow) — a brief, tasteful burst
// rather than a chaotic party-popper effect, matching the rest of the app's
// restrained use of the gradient-brand palette.
const COLORS = ['#FB8A4C', '#A66BF5', '#5B7FFF', '#34D399']
const PIECE_COUNT = 56
const DURATION_MS = 1600

interface Piece {
  x: number; y: number
  vx: number; vy: number
  rotation: number; vr: number
  color: string
  size: number
  shape: 'rect' | 'circle'
}

/** A single brief confetti burst from the top of the viewport, done after
    ~1.6s and fully unmounted by the caller (via onDone) — not a persistent
    decoration, just the one-time "you did it" moment right after a workout
    is saved. Canvas-based rather than a library so the piece count/colors/
    duration stay small and deliberate. */
export default function Confetti({ onDone }: { onDone?: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = Math.min(2, window.devicePixelRatio || 1)
    const resize = () => {
      canvas.width = window.innerWidth * dpr
      canvas.height = window.innerHeight * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()

    const pieces: Piece[] = Array.from({ length: PIECE_COUNT }, () => ({
      x: window.innerWidth * (0.2 + Math.random() * 0.6),
      y: -20 - Math.random() * 80,
      vx: (Math.random() - 0.5) * 3,
      vy: 2 + Math.random() * 2.5,
      rotation: Math.random() * Math.PI * 2,
      vr: (Math.random() - 0.5) * 0.3,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      size: 5 + Math.random() * 5,
      shape: Math.random() > 0.5 ? 'rect' : 'circle',
    }))

    const gravity = 0.12
    const drag = 0.995
    let raf: number
    const start = performance.now()

    function tick(now: number) {
      const t = now - start
      ctx!.clearRect(0, 0, canvas!.width, canvas!.height)
      const fade = t > DURATION_MS - 400 ? Math.max(0, 1 - (t - (DURATION_MS - 400)) / 400) : 1

      for (const p of pieces) {
        p.vy += gravity
        p.vx *= drag
        p.x += p.vx
        p.y += p.vy
        p.rotation += p.vr

        ctx!.save()
        ctx!.globalAlpha = fade
        ctx!.translate(p.x, p.y)
        ctx!.rotate(p.rotation)
        ctx!.fillStyle = p.color
        if (p.shape === 'rect') {
          ctx!.fillRect(-p.size / 2, -p.size / 3, p.size, p.size * 0.66)
        } else {
          ctx!.beginPath()
          ctx!.arc(0, 0, p.size / 2, 0, Math.PI * 2)
          ctx!.fill()
        }
        ctx!.restore()
      }

      if (t < DURATION_MS) {
        raf = requestAnimationFrame(tick)
      } else {
        onDone?.()
      }
    }
    raf = requestAnimationFrame(tick)

    window.addEventListener('resize', resize)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
    }
    // onDone intentionally excluded — re-running this effect on every parent
    // render would restart the burst from scratch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return <canvas ref={canvasRef} className="confetti-canvas" aria-hidden="true" />
}
