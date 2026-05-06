const SERVER_URL = 'http://localhost:3001'

export async function convertTablesToHtml(documentContent) {
  const response = await fetch(`${SERVER_URL}/api/convert-table`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: documentContent }),
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
  return data.html || ''
}
