import { motion } from 'motion/react'
import type { ReactNode, MouseEventHandler, CSSProperties } from 'react'

/** The bottom-sheet panel inside an overlay (TemplateModal, QuickWeightModal,
    the various picker sheets) — slides up + fades in on open, and actually
    slides back down on close instead of just vanishing. Exit is
    deliberately quicker than the entrance (180ms vs 280ms) — a fast exit
    reads as responsive, a slow one reads as sluggish, and nobody is
    "reading" a sheet on the way out the way they might be taking in its
    content on the way in. Drop this in as the modal's existing outer
    panel `<div>` — it doesn't touch anything about the modal's own
    content, header, or footer. */
export default function AnimatedSheet({
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
      initial={{ y: '12%', opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: '8%', opacity: 0 }}
      transition={{ type: 'spring', damping: 28, stiffness: 320 }}
    >
      {children}
    </motion.div>
  )
}
