import { useMemo, useRef, useState, useCallback, useEffect } from 'react'
import { Canvas, useLoader, useThree, type ThreeEvent } from '@react-three/fiber'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import * as THREE from 'three'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { REGION_LABEL, type VisualRegion } from '../lib/muscleMap'
import type { RegionLoad } from '../hooks/useMuscleLoad'
import './BodyHeatmap3D.css'

// Reuses the app's existing palette (globals.css) — mirrored as hex since
// Three.js materials need JS color values, not CSS custom properties.
const STATUS_COLOR: Record<RegionLoad['status'], string> = {
  none:     '#9CA3AF', // neutral grey — untrained (not a skin/race tone)
  under:    '#5B7FFF', // blue
  onTarget: '#34D399', // green
  over:     '#F2545B', // red (possibly overtrained)
}
const NEUTRAL = new THREE.Color(STATUS_COLOR.none)

/** Blue → green within the "under target" band so a deeper shade still reads
    as more-trained progress; flat color for onTarget/over. No blend toward a
    flesh tone here (unlike the old primitive figure) — this mesh already has
    real anatomical shape and baked ambient occlusion, so status colors stay
    fully saturated for maximum before/after contrast. */
function colorFor(load: RegionLoad | undefined): THREE.Color {
  if (!load || load.status === 'none') return NEUTRAL.clone()
  if (load.status === 'under') {
    const t = Math.min(1, load.pct / 0.5)
    return new THREE.Color(STATUS_COLOR.under).lerp(new THREE.Color(STATUS_COLOR.onTarget), t)
  }
  return new THREE.Color(STATUS_COLOR[load.status])
}

const MODEL_URL = '/models/muscles.glb'

/** Maps the model's 48 top-level anatomical nodes (see public/models/CREDITS.md
    for provenance) to the app's 10 tracked VisualRegions. A node mapped to
    `null` has no corresponding entry in muscleMap.ts's data model — it's
    rendered in the neutral tone for anatomical completeness (so the body
    doesn't have gaps at the neck/hands/feet/adductors) but isn't clickable,
    since there's no training status to show for it. This is the ONLY place
    that associates mesh node names with regions — all status values still
    come from useMuscleLoad.ts via the `regions` prop. */
const NODE_REGION: Record<string, VisualRegion | null> = {
  pec_major_upper: 'chest', pec_major_lower: 'chest',
  anterior_delt: 'shoulders', lateral_delt: 'shoulders', posterior_delt: 'shoulders', rotator_cuff: 'shoulders',
  upper_lats: 'back', lower_lats: 'back', upper_traps: 'back', mid_traps: 'back', lower_traps: 'back',
  rhomboids: 'back', teres_major: 'back', erector_spinae: 'back', serratus_anterior: 'back',
  biceps: 'biceps', brachialis: 'biceps', brachioradialis: 'biceps',
  forearm_flexors: 'biceps', forearm_extensors: 'biceps',
  triceps_lateral: 'triceps', triceps_long: 'triceps', triceps_medial: 'triceps',
  rectus_abdominis: 'core', obliques: 'core', transverse_abdominis: 'core', hip_flexors: 'core',
  vastus_group: 'quads', rectus_femoris: 'quads',
  medial_hamstrings: 'hamstrings', lateral_hamstrings: 'hamstrings',
  glute_max: 'glutes', glute_med: 'glutes',
  gastrocnemius: 'calves', soleus: 'calves', tibialis_anterior: 'calves', fibularis: 'calves',
  // Present in the mesh but not tracked by the workout data model — neutral,
  // not selectable.
  adductors: null, hip_rotators: null, neck_flexors: null, neck_extensors: null,
  hand_muscles: null, foot_muscles: null, breathing: null,
  // Non-muscle context shapes (head/skull, bones, tendons, see-through
  // hand/foot skin) — always neutral, never selectable.
  body_context: null, context_bone: null, context_tendon: null, context_skin: null,
}

/** Which way the body needs to face (radians, 0 = facing the camera) for a
    region to actually be visible — drives the quick-select row's auto-turn. */
const REGION_FACING: Record<VisualRegion, number> = {
  chest: 0, shoulders: 0, biceps: 0, core: 0, quads: 0, calves: 0,
  back: Math.PI, triceps: Math.PI, hamstrings: Math.PI, glutes: Math.PI,
}

const QUICK_SELECT_REGIONS: VisualRegion[] = [
  'chest', 'shoulders', 'back', 'biceps', 'triceps', 'core', 'quads', 'hamstrings', 'glutes', 'calves',
]

/** Walks up from the exact mesh the raycaster hit to find which top-level
    named node it belongs to — a click lands on one of a region's several
    sub-primitives (e.g. one of the atlas pieces making up "upper_lats"), not
    the named node itself. */
function findRegionNode(obj: THREE.Object3D | null): string | null {
  let cur: THREE.Object3D | null = obj
  while (cur) {
    if (cur.name && cur.name in NODE_REGION) return cur.name
    cur = cur.parent
  }
  return null
}

function isMesh(obj: THREE.Object3D): obj is THREE.Mesh {
  return (obj as THREE.Mesh).isMesh === true
}

/** Recomputes an orthographic camera's frustum to a fixed world-space height
    (with the container's current pixel aspect ratio) whenever the canvas
    resizes — R3F's own orthographic default sizes 1 unit = 1 pixel, which
    doesn't work once the model is normalized to a few world units tall. */
function FitCamera({ viewHeight }: { viewHeight: number }) {
  const { size, camera } = useThree()
  useEffect(() => {
    const ortho = camera as THREE.OrthographicCamera
    const aspect = size.width / Math.max(1, size.height)
    ortho.left = (-viewHeight * aspect) / 2
    ortho.right = (viewHeight * aspect) / 2
    ortho.top = viewHeight / 2
    ortho.bottom = -viewHeight / 2
    ortho.near = 0.1
    ortho.far = 20
    ortho.updateProjectionMatrix()
  }, [size, viewHeight, camera])
  return null
}

interface FigureProps {
  regions: Record<VisualRegion, RegionLoad>
  selectedRegion: VisualRegion | null
  rotationY: number
  onPick: (region: VisualRegion) => void
}

function Figure({ regions, selectedRegion, rotationY, onPick }: FigureProps) {
  const gltf = useLoader(GLTFLoader, MODEL_URL)

  // Clone the object graph per-mount (geometries/buffers stay shared with
  // useLoader's cache — only materials are cloned, since those are what this
  // component mutates to show training status).
  const root = useMemo(() => {
    const cloned = gltf.scene.clone(true)
    cloned.traverse(obj => {
      if (isMesh(obj)) {
        obj.material = Array.isArray(obj.material)
          ? obj.material.map(m => m.clone())
          : obj.material.clone()
      }
    })

    // Glutes are purely posterior — from a front-on view there's no glute
    // geometry for a ray to hit at all, so the region is simply unreachable
    // without rotating to the back. Add two invisible, click-only proxy
    // volumes at the hip sides (real glute_max/glute_med bounding box,
    // pulled forward in Z toward the body's center depth) so tapping "the
    // side of the hip" from the front also resolves to glutes. They render
    // nothing (fully transparent, no depth write) and sit in open space the
    // front-facing core/quad meshes don't occupy there, so they never shadow
    // a real click.
    const gluteNodes = ['glute_max', 'glute_med']
      .map(n => cloned.getObjectByName(n))
      .filter((n): n is THREE.Object3D => n != null)
    if (gluteNodes.length > 0) {
      const box = new THREE.Box3()
      gluteNodes.forEach(n => box.expandByObject(n))
      const size = box.getSize(new THREE.Vector3())
      const center = box.getCenter(new THREE.Vector3())
      const proxyGeo = new THREE.BoxGeometry(size.x * 0.22, size.y * 0.8, size.z * 1.6)
      const proxyMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, depthTest: false })
      for (const side of [-1, 1]) {
        const proxy = new THREE.Mesh(proxyGeo, proxyMat.clone())
        proxy.name = side < 0 ? 'glute_max' : 'glute_med' // reuses an existing NODE_REGION key — either resolves to 'glutes'
        proxy.position.set(center.x + side * size.x * 0.47, center.y, center.z * 0.15)
        proxy.renderOrder = -1 // never visually occludes real geometry, even if a future tweak makes it visible by mistake
        cloned.add(proxy)
      }
    }

    return cloned
  }, [gltf])

  useEffect(() => () => {
    root.traverse(obj => {
      if (isMesh(obj)) {
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material]
        mats.forEach(m => m.dispose())
      }
    })
  }, [root])

  // Auto-fit: normalize to a known world-space height regardless of the
  // asset's native scale/offset, so framing never depends on guessing the
  // source file's units.
  const TARGET_HEIGHT = 2.85
  const { scale, position } = useMemo(() => {
    const box = new THREE.Box3().setFromObject(root)
    const size = box.getSize(new THREE.Vector3())
    const center = box.getCenter(new THREE.Vector3())
    const s = TARGET_HEIGHT / Math.max(0.0001, size.y)
    return { scale: s, position: [-center.x * s, -center.y * s, -center.z * s] as [number, number, number] }
  }, [root])

  // Every mesh descendant of each named node, resolved once per load.
  const meshesByNode = useMemo(() => {
    const map = new Map<string, THREE.Mesh[]>()
    for (const nodeName of Object.keys(NODE_REGION)) {
      const node = root.getObjectByName(nodeName)
      if (!node) continue
      const meshes: THREE.Mesh[] = []
      node.traverse(o => { if (isMesh(o)) meshes.push(o) })
      map.set(nodeName, meshes)
    }
    return map
  }, [root])

  // Recolor on training-status or selection change — never on every frame.
  useEffect(() => {
    for (const [nodeName, region] of Object.entries(NODE_REGION)) {
      const meshes = meshesByNode.get(nodeName)
      if (!meshes) continue
      const color = region ? colorFor(regions[region]) : NEUTRAL
      const selected = region != null && region === selectedRegion
      for (const mesh of meshes) {
        const mat = mesh.material as THREE.MeshStandardMaterial
        mat.color.copy(color)
        if (selected) {
          mat.emissive.setRGB(1, 1, 1)
          mat.emissiveIntensity = 0.3
        } else {
          mat.emissiveIntensity = 0
        }
      }
    }
  }, [regions, selectedRegion, meshesByNode])

  const handleClick = useCallback((e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    const nodeName = findRegionNode(e.object)
    if (!nodeName) return
    const region = NODE_REGION[nodeName]
    if (region) onPick(region)
  }, [onPick])

  return (
    <group rotation={[0, rotationY, 0]}>
      <primitive object={root} scale={scale} position={position} onClick={handleClick} />
    </group>
  )
}

interface BodyHeatmap3DProps {
  regions: Record<VisualRegion, RegionLoad>
  sex: 'male' | 'female' | 'other' | undefined
  selectedRegion: VisualRegion | null
  onSelectRegion: (region: VisualRegion) => void
}

const DRAG_SENSITIVITY = 0.014
const FRICTION = 0.945
const MAX_VELOCITY = 1.6 // px/ms — caps how fast a flick can launch the coast
const CLICK_DRAG_GUARD = 6 // px of total movement before a tap stops counting as a tap

/** Shortest signed angular distance from `from` to `to` (both in radians),
    folded into (-π, π] — so animating "to" never spins the long way around
    just because the raw rotation value has accumulated past a full turn
    (flicks/drags are never clamped back into 0–2π, by design). */
function shortestDelta(from: number, to: number): number {
  const twoPi = Math.PI * 2
  let delta = (to - from) % twoPi
  if (delta > Math.PI) delta -= twoPi
  if (delta < -Math.PI) delta += twoPi
  return delta
}

const HOLD_SPIN_SPEED = 0.028 // rad/frame while a hold-to-spin arrow is pressed
const TARGET_EASE = 0.12 // fraction of remaining distance closed per frame when turning to face a region

export default function BodyHeatmap3D({ regions, selectedRegion, onSelectRegion }: BodyHeatmap3DProps) {
  const [rotationY, setRotationY] = useState(0) // start facing the camera head-on
  const [contextLost, setContextLost] = useState(false)
  const dragging = useRef(false)
  const lastX = useRef(0)
  const lastMoveTime = useRef(0)
  const velocity = useRef(0) // px/ms, most-recent drag speed — carried into the release coast
  const dragDistance = useRef(0)
  const rafId = useRef<number>()
  const holdDirection = useRef(0) // -1 / 0 / 1 — which way a held arrow button is spinning, if any
  const rotationYRef = useRef(0) // mirrors state for reads inside RAF loops without stale closures

  useEffect(() => { rotationYRef.current = rotationY }, [rotationY])
  useEffect(() => () => { if (rafId.current) cancelAnimationFrame(rafId.current) }, [])

  const handlePick = useCallback((region: VisualRegion) => {
    if (dragDistance.current > CLICK_DRAG_GUARD) return
    onSelectRegion(region)
  }, [onSelectRegion])

  // Only one animation driver owns rafId at a time — every entry point below
  // calls this first, so a drag, a flick-coast, a hold-spin, and a
  // quick-select turn can never fight over the same rotation value.
  function stopAutoRotate() {
    if (rafId.current) { cancelAnimationFrame(rafId.current); rafId.current = undefined }
    holdDirection.current = 0
  }

  function onPointerDown(e: React.PointerEvent) {
    stopAutoRotate()
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
    if (dragDistance.current > CLICK_DRAG_GUARD && !e.currentTarget.hasPointerCapture(e.pointerId)) {
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

  function endDrag(e: React.PointerEvent) {
    if (!dragging.current) return
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

  // Press-and-hold arrow buttons — continuous rotation at a fixed speed for
  // as long as the pointer stays down, stopping the instant it lifts (or
  // leaves the button, so a drag-off doesn't leave it spinning forever).
  function startHoldSpin(direction: -1 | 1) {
    stopAutoRotate()
    holdDirection.current = direction
    const spin = () => {
      if (holdDirection.current === 0) { rafId.current = undefined; return }
      setRotationY(r => r + holdDirection.current * HOLD_SPIN_SPEED)
      rafId.current = requestAnimationFrame(spin)
    }
    rafId.current = requestAnimationFrame(spin)
  }
  function stopHoldSpin() {
    holdDirection.current = 0
    stopAutoRotate()
  }

  // Quick-select: smoothly ease-turn to face whichever side the tapped
  // region lives on, then open its detail same as a direct tap would.
  function turnToFace(targetFacing: number) {
    stopAutoRotate()
    const animate = () => {
      const delta = shortestDelta(rotationYRef.current, targetFacing)
      if (Math.abs(delta) < 0.004) {
        setRotationY(r => r + delta)
        rafId.current = undefined
        return
      }
      setRotationY(r => r + delta * TARGET_EASE)
      rafId.current = requestAnimationFrame(animate)
    }
    rafId.current = requestAnimationFrame(animate)
  }

  function handleQuickSelect(region: VisualRegion) {
    turnToFace(REGION_FACING[region])
    onSelectRegion(region)
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
    <div className="bh3d-wrap">
      <div
        className="bh3d-canvas-wrap"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <button
          className="bh3d-spin-arrow bh3d-spin-arrow--left"
          aria-label="Hold to spin left"
          onPointerDown={e => { e.stopPropagation(); startHoldSpin(-1) }}
          onPointerUp={stopHoldSpin}
          onPointerLeave={stopHoldSpin}
          onPointerCancel={stopHoldSpin}
        >
          <ChevronLeft size={18} />
        </button>
        <button
          className="bh3d-spin-arrow bh3d-spin-arrow--right"
          aria-label="Hold to spin right"
          onPointerDown={e => { e.stopPropagation(); startHoldSpin(1) }}
          onPointerUp={stopHoldSpin}
          onPointerLeave={stopHoldSpin}
          onPointerCancel={stopHoldSpin}
        >
          <ChevronRight size={18} />
        </button>
        <Canvas
          orthographic
          dpr={[1, 2]}
          camera={{ position: [0, 0, 6], near: 0.1, far: 20 }}
          gl={{ toneMapping: THREE.NoToneMapping, antialias: true }}
          onCreated={handleCreated}
        >
          <FitCamera viewHeight={3.0} />
          <ambientLight intensity={1.4} />
          <directionalLight position={[2, 3, 4]} intensity={2.0} />
          <directionalLight position={[-2.5, 0.5, -2]} intensity={0.9} />
          <directionalLight position={[0, -2, 2]} intensity={0.3} />
          <Figure regions={regions} selectedRegion={selectedRegion} rotationY={rotationY} onPick={handlePick} />
        </Canvas>
      </div>

      {/* Quick-select — tap a muscle group to auto-turn the body to face it
          and open its detail, for anyone who'd rather not hunt for the right
          angle themselves. */}
      <div className="bh3d-quickselect">
        {QUICK_SELECT_REGIONS.map(region => (
          <button
            key={region}
            className={`bh3d-quickselect-btn ${selectedRegion === region ? 'bh3d-quickselect-btn--active' : ''}`}
            onClick={() => handleQuickSelect(region)}
          >
            {REGION_LABEL[region]}
          </button>
        ))}
      </div>
    </div>
  )
}
