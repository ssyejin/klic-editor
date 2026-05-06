export async function extractTextFromImage(base64, contentType) {
  const response = await fetch('/api/ocr', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ base64, contentType }),
  })

  if (!response.ok) {
    let message = `서버 오류 (${response.status})`
    try {
      const error = await response.json()
      message = error.error || message
    } catch {}
    throw new Error(message)
  }

  const data = await response.json()
  return data.text
}
