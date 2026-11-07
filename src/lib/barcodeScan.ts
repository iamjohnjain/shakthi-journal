export interface ScannedProduct {
  barcode: string
  food: string
  qtyNum: number
  qtyUnit: string
  calories: number
  proteinG: number
  carbsG: number
  fatG: number
}

/** Tries to decode a barcode or QR code from a captured photo. Returns null
    (not a barcode photo — fall through to AI vision analysis) rather than
    throwing, since "no barcode found" is the expected outcome for most food
    photos, not a failure. */
export async function decodeBarcodeFromImage(file: File | Blob): Promise<string | null> {
  // zxing is a sizeable dependency (barcode/QR format decoders) only needed
  // when someone actually uses the Photo tab — code-split it out of the main
  // bundle rather than loading it on every page view.
  const [{ BrowserMultiFormatReader }, { NotFoundException }] = await Promise.all([
    import('@zxing/browser'),
    import('@zxing/library'),
  ])
  const reader = new BrowserMultiFormatReader()
  const url = URL.createObjectURL(file)
  try {
    const result = await reader.decodeFromImageUrl(url)
    return result.getText()
  } catch (e) {
    if (e instanceof NotFoundException) return null
    return null // any other decode error — just fall through, never block the flow
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** Looks up a scanned barcode via Open Food Facts — free, open, no API key.
    Returns null if the product isn't in their database (common for
    regional/store-brand items) rather than throwing. */
export async function lookupBarcode(barcode: string): Promise<ScannedProduct | null> {
  try {
    const resp = await fetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json`)
    if (!resp.ok) return null
    const data = await resp.json()
    if (data.status !== 1 || !data.product) return null

    const p = data.product
    const nutr = p.nutriments ?? {}
    const name: string = p.product_name || p.generic_name || p.brands || 'Scanned item'
    const servingG: number = typeof p.serving_quantity === 'number' && p.serving_quantity > 0 ? p.serving_quantity : 100
    const per100 = {
      calories: Number(nutr['energy-kcal_100g']) || 0,
      proteinG: Number(nutr['proteins_100g']) || 0,
      carbsG:   Number(nutr['carbohydrates_100g']) || 0,
      fatG:     Number(nutr.fat_100g) || 0,
    }
    if (per100.calories === 0) return null // no usable nutrition data for this product

    const scale = servingG / 100
    return {
      barcode,
      food: p.brands ? `${name} (${p.brands})` : name,
      qtyNum: servingG,
      qtyUnit: 'g',
      calories: Math.round(per100.calories * scale),
      proteinG: Math.round(per100.proteinG * scale),
      carbsG:   Math.round(per100.carbsG   * scale),
      fatG:     Math.round(per100.fatG     * scale),
    }
  } catch {
    return null
  }
}
