import { motion } from 'motion/react'
import type { ReactNode, MouseEventHandler, CSSProperties } from 'react'

/** A small anchored menu/popover (a dropdown, a picker hanging off a
    button) — scales in from its trigger and, unlike the CSS-only
    `@keyframes` version of this same idea used in a couple of places
    (ActiveWorkout's type menu, the rest-timer picker), also scales back
    OUT on close instead of just disappearing. Set `transform-origin` via
    `style` to match whichever corner the trigger sits at (the CSS
    versions already do this per-component — keep that convention here
    too). */
export default function AnimatedPopover({
  className, onClick, style, children,
}: {
  className?: string
  onClick?: MouseEventHandler<HTMLDivElement>
  style?: CSSProperties
  children: ReactNode
}) {
  return (
    <motion.div
      className={className}
      onClick={onClick}
      style={style}
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.15, ease: [0.25, 0.46, 0.45, 0.94] }}
    >
      {children}
    </motion.div>
  )
}
