import { motion } from 'motion/react'
import type { ReactNode, MouseEventHandler } from 'react'

/** A backdrop that fades in AND out — the plain CSS `fadeIn`/`animation`
    pattern used across the app's overlays only ever plays once, on mount;
    closing one of those modals is an instant unmount with no exit
    transition at all, which is one of the clearest "this wasn't polished"
    tells in an interface. Pairing this with `AnimatePresence` in the
    parent (`<AnimatePresence>{show && <AnimatedOverlay>...}</AnimatePresence>`)
    gives every overlay a real close animation for free, without touching
    any of its existing content/className/styling — this only replaces
    the outermost `<div>` the overlay already had. */
export default function AnimatedOverlay({
  className, onClick, children,
}: {
  className?: string
  onClick?: MouseEventHandler<HTMLDivElement>
  children: ReactNode
}) {
  return (
    <motion.div
      className={className}
      onClick={onClick}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
    >
      {children}
    </motion.div>
  )
}
