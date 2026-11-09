import * as pdfjsLib from 'pdfjs-dist'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import mammoth from 'mammoth'
import { compressImageUnderBytes } from './imageUtils'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl

const TEXT_EXTENSIONS = ['.txt', '.csv', '.md']

// Scanned (image-only) PDFs render each page as an image instead — capped
// so a very long scanned program doesn't balloon into dozens of vision
// requests worth of payload. Most trainer plans fit well inside this.
const MAX_SCANNED_PDF_PAGES = 10

async function extractPdfText(file: File): Promise<string> {
  const buf = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise
  const parts: string[] = []
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    const pageText = content.items.map(it => ('str' in it ? it.str : '')).join(' ')
    parts.push(pageText)
  }
  return parts.join('\n\n')
}

/** Renders a canvas-drawn PDF page down to a size-safe JPEG, the same
    shrink-until-it-fits approach used for photos — a page rendered at full
    resolution can be surprisingly large, and this is headed to the same
    vision API with the same payload ceiling. */
async function renderCanvasUnderBytes(canvas: HTMLCanvasElement, maxBytes: number): Promise<string> {
  const qualities = [0.8, 0.65, 0.5, 0.35]
  let best = ''
  for (const q of qualities) {
    const dataUrl = canvas.toDataURL('image/jpeg', q)
    best = dataUrl
    if (dataUrl.length <= maxBytes) return dataUrl
  }
  return best
}

/** Renders up to `MAX_SCANNED_PDF_PAGES` pages of a PDF to JPEG data URLs —
    the fallback for a scanned/image-only PDF (common for a plan someone
    photographed, printed-and-scanned, or exported from a design tool with
    no real text layer), where `extractPdfText` comes back empty since
    there's nothing to read as text. Renders every page up to the cap, not
    just the first, so a multi-day plan spread across several scanned pages
    doesn't lose its later days. */
async function renderPdfPagesToImages(file: File): Promise<string[]> {
  const buf = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise
  const pageCount = Math.min(pdf.numPages, MAX_SCANNED_PDF_PAGES)
  const images: string[] = []
  for (let i = 1; i <= pageCount; i++) {
    const page = await pdf.getPage(i)
    const viewport = page.getViewport({ scale: 1.5 })
    const canvas = document.createElement('canvas')
    canvas.width = viewport.width
    canvas.height = viewport.height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas not supported')
    await page.render({ canvas, canvasContext: ctx, viewport }).promise
    images.push(await renderCanvasUnderBytes(canvas, 2_500_000))
  }
  return images
}

async function extractDocxText(file: File): Promise<string> {
  const buf = await file.arrayBuffer()
  const result = await mammoth.extractRawText({ arrayBuffer: buf })
  return result.value
}

export type ExtractedFileContent =
  | { kind: 'text'; text: string }
  | { kind: 'image'; dataUrls: string[] }

/** Reads whatever file format a trainer might hand someone a workout plan
    in — PDF, Word doc, plain text/CSV, or a straight-up photo/screenshot —
    and normalizes it to either extracted text or one-or-more image data
    URLs, so the caller can route it to the right AI parser without caring
    which format it started as. Returns null when the format isn't
    recognized or nothing readable came out of it. */
export async function extractFileContent(file: File): Promise<ExtractedFileContent | null> {
  const name = file.name.toLowerCase()
  const type = file.type

  if (type.startsWith('image/')) {
    const dataUrl = await compressImageUnderBytes(file)
    return { kind: 'image', dataUrls: [dataUrl] }
  }

  if (type === 'application/pdf' || name.endsWith('.pdf')) {
    const text = (await extractPdfText(file)).trim()
    if (text.length >= 20) return { kind: 'text', text }
    const dataUrls = await renderPdfPagesToImages(file)
    return dataUrls.length > 0 ? { kind: 'image', dataUrls } : null
  }

  if (
    type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    name.endsWith('.docx')
  ) {
    const text = (await extractDocxText(file)).trim()
    return text ? { kind: 'text', text } : null
  }

  if (type.startsWith('text/') || TEXT_EXTENSIONS.some(ext => name.endsWith(ext))) {
    const text = (await file.text()).trim()
    return text ? { kind: 'text', text } : null
  }

  return null
}
