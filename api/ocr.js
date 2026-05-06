export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { base64, contentType } = req.body
  if (!base64 || !contentType) return res.status(400).json({ error: 'base64와 contentType이 필요합니다.' })

  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'meta-llama/llama-4-scout-17b-16e-instruct',
        max_tokens: 8192,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image_url',
                image_url: { url: `data:${contentType};base64,${base64}` },
              },
              {
                type: 'text',
                text: '이 이미지에 있는 모든 텍스트를 빠짐없이 순서대로 추출하세요. 중간에 끊지 말고 끝까지 출력하세요. 설명이나 부연 없이 텍스트만 출력하세요.',
              },
            ],
          },
        ],
      }),
    })

    if (!response.ok) {
      const error = await response.json()
      return res.status(response.status).json({ error: error.error?.message || 'OCR 실패' })
    }

    const data = await response.json()
    const text = data.choices?.[0]?.message?.content?.trim() || ''
    res.json({ text })
  } catch (err) {
    res.status(500).json({ error: `OCR 요청 실패: ${err.message}` })
  }
}
