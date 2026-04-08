import fs from 'node:fs'

export interface UploadedTokenMetadata {
  metadataUri: string
}

export async function uploadTokenMetadata(input: {
  name: string
  symbol: string
  description: string
  imagePath: string | null
  twitter?: string
  telegram?: string
  website?: string
}): Promise<UploadedTokenMetadata> {
  const formData = new FormData()
  formData.append('name', input.name)
  formData.append('symbol', input.symbol)
  formData.append('description', input.description)
  formData.append('showName', 'true')
  if (input.twitter) formData.append('twitter', input.twitter)
  if (input.telegram) formData.append('telegram', input.telegram)
  if (input.website) formData.append('website', input.website)

  if (input.imagePath) {
    const imageBuffer = fs.readFileSync(input.imagePath)
    const ext = input.imagePath.split('.').pop()?.toLowerCase() ?? 'png'
    const mimeType = ext === 'jpg' || ext === 'jpeg'
      ? 'image/jpeg'
      : ext === 'gif'
        ? 'image/gif'
        : ext === 'webp'
          ? 'image/webp'
          : 'image/png'
    const blob = new Blob([imageBuffer], { type: mimeType })
    formData.append('file', blob, `token.${ext}`)
  }

  const response = await fetch('https://pump.fun/api/ipfs', { method: 'POST', body: formData })
  if (!response.ok) throw new Error('Failed to upload token metadata')
  const json = await response.json() as { metadataUri?: string }
  if (!json.metadataUri) throw new Error('Metadata upload did not return a metadataUri')
  return { metadataUri: json.metadataUri }
}
