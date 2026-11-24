import { useEffect } from 'react'

// A plain module-level counter rather than React state/context on purpose:
// `PullToRefresh` wraps the ENTIRE Dashboard page, while the things that
// need to block it (GoalRing's Weight Goal modal, and potentially others
// later) are portaled to `document.body` — a completely separate DOM
// subtree. Trying to stop the pull gesture by intercepting/stopping touch
// events at the DOM level turned out to be fragile (propagation order,
// portal boundaries, preventDefault vs. stopPropagation subtleties all
// had to line up exactly right, and still kept finding new gaps). Having
// PullToRefresh itself just ask "is anything blocking me right now?" at
// the start of its own touch handlers sidesteps all of that entirely —
// it doesn't matter where in the DOM the blocking thing lives.
let blockCount = 0

export function isPullToRefreshBlocked(): boolean {
  return blockCount > 0
}

/** Call with `active: true` for as long as something (a modal, a sheet)
 *  must prevent the pull-to-refresh gesture anywhere on the page — e.g.
 *  `useBlockPullToRefresh(showDetail)` in a modal component. Safe to call
 *  from multiple components at once (reference-counted, not a boolean). */
export function useBlockPullToRefresh(active: boolean) {
  useEffect(() => {
    if (!active) return
    blockCount += 1
    return () => { blockCount -= 1 }
  }, [active])
}
