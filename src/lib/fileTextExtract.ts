import * as pdfjsLib from 'pdfjs-dist'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import mammoth from 'mammoth'
import { compressImageToDataUrl } from './imageUtils'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl

const TEXT_EXTENSIONS = ['.txt', '.csv', '.md']

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

/** Renders a PDF's first page to a JPEG data URL — the fallback for a
    scanned/image-only PDF (common for a plan someone photographed and
    exported, or printed-and-scanned), where `extractPdfText` comes back
    empty since there's no real text layer to read. */
async function renderPdfFirstPageToImage(file: File): Promise<string> {
  const buf = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise
  const page = await pdf.getPage(1)
  const viewport = page.getViewport({ scale: 2 })
  const canvas = document.createElement('canvas')
  canvas.width = viewport.width
  canvas.height = viewport.height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas not supported')
  await page.render({ canvas, canvasContext: ctx, viewport }).promise
  return canvas.toDataURL('image/jpeg', 0.85)
}

async function extractDocxText(file: File): Promise<string> {
  const buf = await file.arrayBuffer()
  const result = await mammoth.extractRawText({ arrayBuffer: buf })
  return result.value
}

export type ExtractedFileContent =
  | { kind: 'text'; text: string }
  | { kind: 'image'; dataUrl: string }

/** Reads whatever file format a trainer might hand someone a workout plan
    in — PDF, Word doc, plain text/CSV, or a straight-up photo/screenshot —
    and normalizes it to either extracted text or an image data URL, so the
    caller can route it to the right AI parser without caring which format
    it started as. Returns null when the format isn't recognized or nothing
    readable came out of it. */
export async function extractFileContent(file: File): Promise<ExtractedFileContent | null> {
  const name = file.name.toLowerCase()
  const type = file.type

  if (type.startsWith('image/')) {
    const dataUrl = await compressImageToDataUrl(file, 1800, 0.85)
    return { kind: 'image', dataUrl }
  }

  if (type === 'application/pdf' || name.endsWith('.pdf')) {
    const text = (await extractPdfText(file)).trim()
    if (text.length >= 20) return { kind: 'text', text }
    const dataUrl = await renderPdfFirstPageToImage(file)
    return { kind: 'image', dataUrl }
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
