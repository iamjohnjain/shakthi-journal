import { useMemo, useRef, useState, useCallback, useEffect } from 'react'
import { Canvas } from '@react-three/fiber'
import * as THREE from 'three'
import type { VisualRegion } from '../lib/muscleMap'
import type { RegionLoad } from '../hooks/useMuscleLoad'
import './BodyHeatmap3D.css'

// Reuses the app's existing palette (globals.css) — mirrored as hex since
// Three.js materials need JS color values, not CSS custom properties.
const STATUS_COLOR: Record<RegionLoad['status'], string> = {
  none:     '#C89676', // warm flesh tone — untrained (reads as skin, not painted plastic)
  under:    '#5B7FFF', // blue
  onTarget: '#34D399', // green
  over:     '#F2545B', // red (possibly overtrained)
}
const NEUTRAL = new THREE.Color(STATUS_COLOR.none)
const EYE = new THREE.Color('#2B2118')

function colorFor(load: RegionLoad | undefined): THREE.Color {
  if (!load) return NEUTRAL.clone()
  let c: THREE.Color
  if (load.status === 'under') {
    // Fade blue → green as it approaches target, instead of a flat color,
    // so "deeper shade" reads as more-trained within the "under" band too.
    const t = Math.min(1, load.pct / 0.5)
    c = new THREE.Color(STATUS_COLOR.under).lerp(new THREE.Color(STATUS_COLOR.onTarget), t)
  } else {
    c = new THREE.Color(STATUS_COLOR[load.status])
  }
  // A light blend toward the flesh tone keeps a trained region reading as
  // "this part of the body, highlighted" rather than a disconnected block
  // of saturated paint — subtle enough that status colors stay legible.
  return c.lerp(NEUTRAL, 0.12)
}

const ARC = Math.PI * 1.1 // ~198°, split shells overlap slightly at both seams
const SEGMENTS = 40 // angular resolution — smooth, round curves rather than faceted blocks

type Profile = [y: number, radius: number][]

/** Turns a handful of hand-placed (height, radius) keypoints into a dense,
    continuously-smooth curve via Catmull-Rom spline interpolation — the
    keypoints mark where flesh should bulge/taper (a bicep peak, a waist
    pinch), and the spline fills in a natural, rounded transition between
    them instead of the straight-line facets a raw Lathe would show with
    so few points. */
function smoothProfile(keypoints: Profile, samples = 48): Profile {
  const pts = keypoints.map(([y, r]) => new THREE.Vector3(r, y, 0))
  const curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.5)
  return curve.getPoints(samples).map(p => [p.y, Math.max(0.012, p.x)] as [number, number])
}

/** A continuously-contoured body-part shell, revolved from a hand-authored
    height→radius profile (so limbs taper/bulge like muscle instead of
    reading as stacked cones). `facing` splits it into an independently
    colorable front or back half when the region needs one (torso: chest
    vs back; arms: biceps vs triceps; thighs: quads vs hamstrings); omit it
    for a single all-the-way-around piece (calves). */
function Revolve({
  profile, x = 0, facing, color, onPick,
}: {
  profile: Profile
  x?: number
  facing?: 'front' | 'back'
  color: THREE.Color
  onPick?: () => void
}) {
  const geometry = useMemo(() => {
    // The back half gets a hair more radius than the front — with matching
    // radii the two shells sit exactly coplanar at the overlap seam and
    // z-fight (a flickering/jagged line); this keeps the back shell
    // strictly outside the front one there instead.
    const scale = facing === 'back' ? 1.045 : 1
    const points = smoothProfile(profile).map(([y, r]) => new THREE.Vector2(r * scale, y))
    return facing
      ? new THREE.LatheGeometry(points, SEGMENTS, -ARC / 2, ARC)
      : new THREE.LatheGeometry(points, SEGMENTS)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile, facing])

  return (
    <mesh
      geometry={geometry}
      position={[x, 0, 0]}
      rotation={facing ? [0, facing === 'front' ? Math.PI / 2 : -Math.PI / 2, 0] : [0, 0, 0]}
      onClick={onPick}
    >
      <meshStandardMaterial color={color} side={THREE.DoubleSide} roughness={0.55} metalness={0.02} />
    </mesh>
  )
}

function Blob({ radius, x, y, z = 0, scale, color, onPick }: {
  radius: number; x: number; y: number; z?: number
  scale?: [number, number, number]
  color: THREE.Color; onPick?: () => void
}) {
  return (
    <mesh position={[x, y, z]} scale={scale} onClick={onPick}>
      <sphereGeometry args={[radius, 28, 24]} />
      <meshStandardMaterial color={color} roughness={0.55} metalness={0.02} />
    </mesh>
  )
}

interface FigureProps {
  regions: Record<VisualRegion, RegionLoad>
  sex: 'male' | 'female' | 'other' | undefined
  rotationY: number
  onPick: (region: VisualRegion) => void
}

function Figure({ regions, sex, rotationY, onPick }: FigureProps) {
  // Key silhouette radii — wider shoulders tapering to a narrower waist for
  // 'male', narrower shoulders with comparatively fuller hips for 'female',
  // a neutral in-between otherwise.
  const shoulderR = sex === 'male' ? 0.27 : sex === 'female' ? 0.205 : 0.238
  const chestR    = sex === 'male' ? 0.25 : sex === 'female' ? 0.205 : 0.227
  const waistR    = sex === 'male' ? 0.165 : sex === 'female' ? 0.15 : 0.158
  const hipR      = sex === 'male' ? 0.18 : sex === 'female' ? 0.215 : 0.197
  const armX = shoulderR + 0.065
  const legX = hipR * 0.62

  const c = {
    chest:      colorFor(regions.chest),
    core:       colorFor(regions.core),
    back:       colorFor(regions.back),
    shoulders:  colorFor(regions.shoulders),
    biceps:     colorFor(regions.biceps),
    triceps:    colorFor(regions.triceps),
    quads:      colorFor(regions.quads),
    hamstrings: colorFor(regions.hamstrings),
    glutes:     colorFor(regions.glutes),
    calves:     colorFor(regions.calves),
  }

  // ── Profiles (height → radius, hand-tuned for a human silhouette) ──
  // Torso: one canonical set of keypoints spanning hip to shoulder, split
  // at the waistline (y=0.45) into the "core" and "chest" front shells so
  // they share an exact radius at the seam (no mismatch, no visible notch)
  // — the back shell reuses the same keypoints scaled slightly larger so
  // it fully encloses the front shells in the overlap zone instead of
  // z-fighting with them.
  const torsoKeypoints: Profile = useMemo(() => [
    [0.00, hipR * 0.90], [0.09, hipR], [0.20, waistR * 1.08], [0.30, waistR],
    [0.45, (waistR + chestR) / 2], [0.57, chestR * 0.96],
    [0.70, chestR], [0.82, chestR * 0.93], [0.92, shoulderR * 0.88],
  ], [hipR, waistR, chestR, shoulderR])

  const coreProfile: Profile = useMemo(
    () => torsoKeypoints.filter(([y]) => y <= 0.45),
    [torsoKeypoints]
  )
  const chestProfile: Profile = useMemo(
    () => torsoKeypoints.filter(([y]) => y >= 0.45),
    [torsoKeypoints]
  )
  const backProfile = torsoKeypoints

  const armProfile: Profile = useMemo(() => [
    [0.88, 0.072], [0.76, 0.076], [0.58, 0.063],
    [0.47, 0.050], [0.32, 0.047], [0.17, 0.038],
  ], [])

  const thighProfile: Profile = useMemo(() => [
    [0.00, hipR * 0.82], [-0.20, 0.140], [-0.40, 0.116], [-0.53, 0.090],
  ], [hipR])

  const calfProfile: Profile = useMemo(() => [
    [-0.53, 0.082], [-0.68, 0.093], [-0.88, 0.068], [-1.01, 0.050],
  ], [])

  return (
    <group rotation={[0, rotationY, 0]}>
      {/* Head (slightly oval) + tapered neck */}
      <Blob radius={0.135} x={0} y={1.16} scale={[0.92, 1.08, 0.96]} color={NEUTRAL} />
      <Revolve profile={[[0.90, 0.075], [0.97, 0.065], [1.04, 0.07]]} color={NEUTRAL} />
      {/* A simple face — the one unambiguous "this side is the front" cue,
          since an abstract body has no other inherent front/back tell. */}
      <Blob radius={0.016} x={-0.045} y={1.175} z={0.112} color={EYE} />
      <Blob radius={0.016} x={0.045} y={1.175} z={0.112} color={EYE} />

      {/* Torso: front split into chest (upper) / core (lower); back is one continuous "Back" shell */}
      <Revolve profile={chestProfile} facing="front" color={c.chest} onPick={() => onPick('chest')} />
      <Revolve profile={coreProfile} facing="front" color={c.core} onPick={() => onPick('core')} />
      <Revolve profile={backProfile} facing="back" color={c.back} onPick={() => onPick('back')} />

      {/* Shoulders (deltoid caps, blend into the arm profile below) */}
      <Blob radius={0.095} x={-armX} y={0.88} color={c.shoulders} onPick={() => onPick('shoulders')} />
      <Blob radius={0.095} x={armX} y={0.88} color={c.shoulders} onPick={() => onPick('shoulders')} />

      {/* Arms: front = biceps, back = triceps, continuous shoulder-to-wrist taper */}
      {[-1, 1].map(side => (
        <group key={side}>
          <Revolve profile={armProfile} x={side * armX} facing="front" color={c.biceps} onPick={() => onPick('biceps')} />
          <Revolve profile={armProfile} x={side * armX} facing="back" color={c.triceps} onPick={() => onPick('triceps')} />
          <Blob radius={0.042} x={side * armX} y={0.13} scale={[1, 1.2, 0.75]} color={NEUTRAL} />
        </group>
      ))}

      {/* Glutes — back-of-hip only, no front counterpart */}
      <Blob radius={0.105} x={-legX} y={0.02} z={-0.07} scale={[1, 0.85, 1]} color={c.glutes} onPick={() => onPick('glutes')} />
      <Blob radius={0.105} x={legX} y={0.02} z={-0.07} scale={[1, 0.85, 1]} color={c.glutes} onPick={() => onPick('glutes')} />

      {/* Thighs: front = quads, back = hamstrings */}
      {[-1, 1].map(side => (
        <group key={side}>
          <Revolve profile={thighProfile} x={side * legX} facing="front" color={c.quads} onPick={() => onPick('quads')} />
          <Revolve profile={thighProfile} x={side * legX} facing="back" color={c.hamstrings} onPick={() => onPick('hamstrings')} />
        </group>
      ))}

      {/* Calves — full-revolve, not split front/back */}
      <Revolve profile={calfProfile} x={-legX} color={c.calves} onPick={() => onPick('calves')} />
      <Revolve profile={calfProfile} x={legX} color={c.calves} onPick={() => onPick('calves')} />

      {/* Feet — cosmetic only */}
      <Blob radius={0.07} x={-legX} y={-1.05} z={0.05} scale={[0.9, 0.45, 1.7]} color={NEUTRAL} />
      <Blob radius={0.07} x={legX} y={-1.05} z={0.05} scale={[0.9, 0.45, 1.7]} color={NEUTRAL} />
    </group>
  )
}

interface BodyHeatmap3DProps {
  regions: Record<VisualRegion, RegionLoad>
  sex: 'male' | 'female' | 'other' | undefined
  onSelectRegion: (region: VisualRegion) => void
}

const DRAG_SENSITIVITY = 0.014
const FRICTION = 0.945
const MAX_VELOCITY = 1.6 // px/ms — caps how fast a flick can launch the coast

export default function BodyHeatmap3D({ regions, sex, onSelectRegion }: BodyHeatmap3DProps) {
  const [rotationY, setRotationY] = useState(0) // start facing the camera head-on — unambiguously "this is the front"
  const [contextLost, setContextLost] = useState(false)
  const dragging = useRef(false)
  const lastX = useRef(0)
  const lastMoveTime = useRef(0)
  const velocity = useRef(0) // px/ms, most-recent drag speed — carried into the release coast
  const dragDistance = useRef(0)
  const rafId = useRef<number>()

  useEffect(() => () => { if (rafId.current) cancelAnimationFrame(rafId.current) }, [])

  const handlePick = useCallback((region: VisualRegion) => {
    if (dragDistance.current > 6) return
    onSelectRegion(region)
  }, [onSelectRegion])

  function stopCoast() {
    if (rafId.current) { cancelAnimationFrame(rafId.current); rafId.current = undefined }
  }

  function onPointerDown(e: React.PointerEvent) {
    stopCoast()
    dragging.current = true
    lastX.current = e.clientX
    lastMoveTime.current = performance.now()
    velocity.current = 0
    dragDistance.current = 0
    // Pointer capture is NOT acquired here — doing it unconditionally on
    // every pointerdown redirects the matching pointerup away from the
    // canvas underneath, which silently breaks R3F's click-to-select on
    // every plain tap (it never sees a pointerup to resolve a click from).
    // It's acquired lazily in onPointerMove, only once a real drag is
    // confirmed, so a tap reaches the canvas untouched.
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!dragging.current) return
    const now = performance.now()
    const dx = e.clientX - lastX.current
    const dt = Math.max(1, now - lastMoveTime.current)
    dragDistance.current += Math.abs(dx)
    lastX.current = e.clientX
    lastMoveTime.current = now
    if (dragDistance.current > 6 && !e.currentTarget.hasPointerCapture(e.pointerId)) {
      // Now it's a real drag, not a tap — prevent the browser's native
      // text-selection drag and keep tracking the pointer even if it
      // wanders outside this element mid-gesture.
      e.preventDefault()
      e.currentTarget.setPointerCapture(e.pointerId)
    }
    // Clamp — a very small `dt` between synthetic/dropped-frame move events
    // can otherwise produce an unrealistically huge velocity and a coast
    // that spins far longer than a real flick ever would.
    velocity.current = Math.max(-MAX_VELOCITY, Math.min(MAX_VELOCITY, dx / dt))
    setRotationY(r => r + dx * DRAG_SENSITIVITY)
  }

  function onPointerUp(e: React.PointerEvent) {
    dragging.current = false
    if (e.currentTarget.hasPointerCapture?.(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId)
    }
    // Flick-to-spin: keep rotating at the release velocity, decaying smoothly,
    // instead of stopping dead the instant the finger lifts.
    if (Math.abs(velocity.current) > 0.03) {
      const coast = () => {
        velocity.current *= FRICTION
        setRotationY(r => r + velocity.current * 16 * DRAG_SENSITIVITY)
        if (Math.abs(velocity.current) > 0.002) {
          rafId.current = requestAnimationFrame(coast)
        } else {
          rafId.current = undefined
        }
      }
      rafId.current = requestAnimationFrame(coast)
    }
  }

  function handleCreated({ gl }: { gl: THREE.WebGLRenderer }) {
    gl.domElement.addEventListener('webglcontextlost', e => {
      e.preventDefault()
      setContextLost(true)
    })
  }

  if (contextLost) {
    return (
      <div className="bh3d-lost">
        <p>3D view lost — tap to reload.</p>
        <button onClick={() => setContextLost(false)}>Reload</button>
      </div>
    )
  }

  return (
    <div
      className="bh3d-canvas-wrap"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerUp}
    >
      <Canvas
        dpr={[1, 2]}
        camera={{ position: [0, 0.05, 4.9], fov: 30 }}
        gl={{ toneMapping: THREE.NoToneMapping, antialias: true }}
        onCreated={handleCreated}
      >
        <ambientLight intensity={1.5} />
        <directionalLight position={[2, 3, 4]} intensity={2.2} />
        <directionalLight position={[-2.5, 0.5, -2]} intensity={1.0} />
        <directionalLight position={[0, -2, 2]} intensity={0.35} />
        <Figure regions={regions} sex={sex} rotationY={rotationY} onPick={handlePick} />
      </Canvas>
    </div>
  )
}
