/** Draws `file` onto a canvas capped at `maxDim` on the long edge — the
    shared decode step behind both compression functions below. */
function drawToCanvas(file: File | Blob, maxDim: number): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      let { width, height } = img
      if (width > maxDim || height > maxDim) {
        const scale = maxDim / Math.max(width, height)
        width = Math.round(width * scale)
        height = Math.round(height * scale)
      }
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      if (!ctx) { reject(new Error('Canvas not supported')); return }
      ctx.drawImage(img, 0, 0, width, height)
      resolve(canvas)
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not load image')) }
    img.src = url
  })
}

/** Resizes + re-encodes a captured photo before it goes over the wire — raw
    phone camera photos are often several MB, which is slow to upload and
    can trip the edge function's payload ceiling. 1280px on the long edge is
    plenty of detail for a vision model to read a plate of food or a receipt. */
export async function compressImageToDataUrl(file: File | Blob, maxDim = 1280, quality = 0.82): Promise<string> {
  const canvas = await drawToCanvas(file, maxDim)
  return canvas.toDataURL('image/jpeg', quality)
}

/** Same idea, but keeps shrinking — quality first, then dimensions — until
    the resulting data URL is safely under `maxBytes`, instead of a single
    fixed-size pass. A phone photo or a rendered document page can vary
    enormously in how much it compresses, and a too-large payload fails
    silently at the API (rejected server-side with no specific reason the
    user can act on) rather than erroring somewhere obviously attributable —
    so for anything going to a vision model, it's worth spending a few extra
    encode passes to stay comfortably under the limit instead of guessing
    one size fits all. Always returns its best effort, even if every attempt
    still lands over budget. */
export async function compressImageUnderBytes(
  file: File | Blob, maxBytes = 3_000_000, startDim = 1600,
): Promise<string> {
  const dims = [startDim, 1280, 1000, 760, 560]
  const qualities = [0.8, 0.65, 0.5]
  let best = ''
  for (const dim of dims) {
    const canvas = await drawToCanvas(file, dim)
    for (const q of qualities) {
      const dataUrl = canvas.toDataURL('image/jpeg', q)
      best = dataUrl
      if (dataUrl.length <= maxBytes) return dataUrl
    }
  }
  return best
}
