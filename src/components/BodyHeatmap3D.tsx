import { useMemo, useRef, useState, useCallback } from 'react'
import { Canvas } from '@react-three/fiber'
import * as THREE from 'three'
import type { VisualRegion } from '../lib/muscleMap'
import type { RegionLoad } from '../hooks/useMuscleLoad'
import './BodyHeatmap3D.css'

// Reuses the app's existing palette (globals.css) — mirrored as hex since
// Three.js materials need JS color values, not CSS custom properties.
const STATUS_COLOR: Record<RegionLoad['status'], string> = {
  none:     '#636366', // neutral gray — untrained (lighter, for contrast against the dark canvas)
  under:    '#0A84FF', // blue
  onTarget: '#30D158', // green
  over:     '#FF453A', // red (possibly overtrained)
}

function colorFor(load: RegionLoad | undefined): THREE.Color {
  if (!load) return new THREE.Color(STATUS_COLOR.none)
  if (load.status === 'under') {
    // Fade blue → green as it approaches target, instead of a flat color,
    // so "deeper shade" reads as more-trained within the "under" band too.
    const t = Math.min(1, load.pct / 0.5)
    return new THREE.Color(STATUS_COLOR.under).lerp(new THREE.Color(STATUS_COLOR.onTarget), t)
  }
  return new THREE.Color(STATUS_COLOR[load.status])
}

const ARC = Math.PI * 1.08 // ~195°, shells overlap slightly at both seams

/** Half-cylinder shell — one visually-independent colorable/clickable
    "face" of a limb. `facing` rotates the shell's arc to point front (+z)
    or back (-z); which exact rotation sign does that is unimportant to
    reason about in the abstract — verified empirically by screenshot. */
function Shell({
  radiusTop, radiusBottom, height, y, x = 0, facing, color, onPick,
}: {
  radiusTop: number; radiusBottom: number; height: number; y: number; x?: number
  facing: 'front' | 'back'
  color: THREE.Color
  onPick: () => void
}) {
  const geometry = useMemo(
    () => new THREE.CylinderGeometry(radiusTop, radiusBottom, height, 20, 1, true, -ARC / 2, ARC),
    [radiusTop, radiusBottom, height]
  )
  return (
    <mesh
      geometry={geometry}
      position={[x, y, 0]}
      rotation={[0, facing === 'front' ? Math.PI / 2 : -Math.PI / 2, 0]}
      onClick={onPick}
    >
      <meshStandardMaterial color={color} side={THREE.DoubleSide} roughness={0.6} />
    </mesh>
  )
}

function Sphere({ radius, x, y, z = 0, color, onPick }: {
  radius: number; x: number; y: number; z?: number; color: THREE.Color; onPick?: () => void
}) {
  return (
    <mesh position={[x, y, z]} onClick={onPick}>
      <sphereGeometry args={[radius, 16, 16]} />
      <meshStandardMaterial color={color} roughness={0.6} />
    </mesh>
  )
}

function Cylinder({ radius, height, x, y, z = 0, color, onPick }: {
  radius: number; height: number; x: number; y: number; z?: number; color: THREE.Color; onPick?: () => void
}) {
  return (
    <mesh position={[x, y, z]} onClick={onPick}>
      <cylinderGeometry args={[radius, radius * 0.85, height, 16]} />
      <meshStandardMaterial color={color} roughness={0.6} />
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
  // Proportions: wider shoulders tapering to narrower hips for 'male',
  // narrower shoulders with comparatively wider hips for 'female', a
  // neutral in-between otherwise.
  const shoulderR = sex === 'male' ? 0.26 : sex === 'female' ? 0.19 : 0.225
  const hipR       = sex === 'male' ? 0.17 : sex === 'female' ? 0.21 : 0.19
  const armX = shoulderR + 0.06
  const legX = hipR * 0.6

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

  return (
    <group rotation={[0, rotationY, 0]}>
      {/* Head + neck (neutral, not a tracked region) */}
      <Sphere radius={0.14} x={0} y={1.15} color={new THREE.Color(STATUS_COLOR.none)} />
      <Cylinder radius={0.07} height={0.14} x={0} y={0.97} color={new THREE.Color(STATUS_COLOR.none)} />

      {/* Torso: front split into chest (upper) / core (lower); back is one "Back" shell */}
      <Shell radiusTop={shoulderR} radiusBottom={(shoulderR + hipR) / 2} height={0.46} y={0.66}
        facing="front" color={c.chest} onPick={() => onPick('chest')} />
      <Shell radiusTop={(shoulderR + hipR) / 2} radiusBottom={hipR} height={0.44} y={0.21}
        facing="front" color={c.core} onPick={() => onPick('core')} />
      <Shell radiusTop={shoulderR} radiusBottom={hipR} height={0.9} y={0.44}
        facing="back" color={c.back} onPick={() => onPick('back')} />

      {/* Shoulders */}
      <Sphere radius={0.09} x={-armX} y={0.88} color={c.shoulders} onPick={() => onPick('shoulders')} />
      <Sphere radius={0.09} x={armX} y={0.88} color={c.shoulders} onPick={() => onPick('shoulders')} />

      {/* Arms: front = biceps, back = triceps, one shell pair spanning shoulder-to-wrist */}
      {[-1, 1].map(side => (
        <group key={side}>
          <Shell radiusTop={0.075} radiusBottom={0.055} height={0.72} y={0.5} x={side * armX}
            facing="front" color={c.biceps} onPick={() => onPick('biceps')} />
          <Shell radiusTop={0.075} radiusBottom={0.055} height={0.72} y={0.5} x={side * armX}
            facing="back" color={c.triceps} onPick={() => onPick('triceps')} />
        </group>
      ))}

      {/* Glutes — back-of-hip only, no front counterpart */}
      <Sphere radius={0.1} x={-legX} y={-0.02} z={-0.08} color={c.glutes} onPick={() => onPick('glutes')} />
      <Sphere radius={0.1} x={legX} y={-0.02} z={-0.08} color={c.glutes} onPick={() => onPick('glutes')} />

      {/* Thighs: front = quads, back = hamstrings */}
      {[-1, 1].map(side => (
        <group key={side}>
          <Shell radiusTop={0.14} radiusBottom={0.11} height={0.55} y={-0.28} x={side * legX}
            facing="front" color={c.quads} onPick={() => onPick('quads')} />
          <Shell radiusTop={0.14} radiusBottom={0.11} height={0.55} y={-0.28} x={side * legX}
            facing="back" color={c.hamstrings} onPick={() => onPick('hamstrings')} />
        </group>
      ))}

      {/* Calves — not split front/back */}
      <Cylinder radius={0.09} height={0.5} x={-legX} y={-0.8} color={c.calves} onPick={() => onPick('calves')} />
      <Cylinder radius={0.09} height={0.5} x={legX} y={-0.8} color={c.calves} onPick={() => onPick('calves')} />

      {/* Feet — cosmetic only */}
      <mesh position={[-legX, -1.08, 0.04]}><boxGeometry args={[0.1, 0.06, 0.2]} /><meshStandardMaterial color={STATUS_COLOR.none} /></mesh>
      <mesh position={[legX, -1.08, 0.04]}><boxGeometry args={[0.1, 0.06, 0.2]} /><meshStandardMaterial color={STATUS_COLOR.none} /></mesh>
    </group>
  )
}

interface BodyHeatmap3DProps {
  regions: Record<VisualRegion, RegionLoad>
  sex: 'male' | 'female' | 'other' | undefined
  onSelectRegion: (region: VisualRegion) => void
}

export default function BodyHeatmap3D({ regions, sex, onSelectRegion }: BodyHeatmap3DProps) {
  const [rotationY, setRotationY] = useState(Math.PI / 6)
  const [contextLost, setContextLost] = useState(false)
  const dragging = useRef(false)
  const lastX = useRef(0)
  const dragDistance = useRef(0)

  const handlePick = useCallback((region: VisualRegion) => {
    if (dragDistance.current > 6) return
    onSelectRegion(region)
  }, [onSelectRegion])

  function onPointerDown(e: React.PointerEvent) {
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    dragging.current = true
    lastX.current = e.clientX
    dragDistance.current = 0
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!dragging.current) return
    e.preventDefault()
    const dx = e.clientX - lastX.current
    dragDistance.current += Math.abs(dx)
    lastX.current = e.clientX
    setRotationY(r => r + dx * 0.012)
  }
  function onPointerUp(e: React.PointerEvent) {
    dragging.current = false
    if (e.currentTarget.hasPointerCapture?.(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId)
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
        camera={{ position: [0, 0.05, 4.8], fov: 30 }}
        gl={{ toneMapping: THREE.NoToneMapping }}
        onCreated={handleCreated}
      >
        <ambientLight intensity={1.6} />
        <directionalLight position={[2, 3, 4]} intensity={2.4} />
        <directionalLight position={[-2, -1, -3]} intensity={1.1} />
        <Figure regions={regions} sex={sex} rotationY={rotationY} onPick={handlePick} />
      </Canvas>
    </div>
  )
}
