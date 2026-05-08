const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'

async function callGroq(body) {
  const res = await fetch(GROQ_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
    },
    body: JSON.stringify(body),
  })
  return res
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { base64, contentType } = req.body
  if (!base64 || !contentType) return res.status(400).json({ error: 'base64와 contentType이 필요합니다.' })

  try {
    const response = await callGroq({
      model: 'meta-llama/llama-4-scout-17b-16e-instruct',
      max_tokens: 8192,
      messages: [
        {
          role: 'system',
          content: 'You are an expert OCR specialist for Korean text. Extract text from images with perfect accuracy, preserving all line breaks and paragraph structure exactly as they appear. Never summarize, translate, or alter any content.',
        },
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: { url: `data:${contentType};base64,${base64}` },
            },
            {
              type: 'text',
              text: '이 이미지는 한국 학교 웹사이트의 인사말 이미지입니다. 이미지에 있는 모든 한국어 텍스트를 한 글자도 빠짐없이 정확하게 추출하세요. 줄바꿈과 문단 구조를 원본 그대로 유지하세요. 텍스트 이외의 설명, 주석, 코드펜스는 절대 출력하지 마세요.',
            },
          ],
        },
      ],
    })

    if (response.status === 429) {
      return res.status(429).json({ error: 'API 한도 초과 — 잠시 후 다시 시도하세요.' })
    }
    if (!response.ok) {
      const error = await response.json()
      return res.status(response.status).json({ error: error.error?.message || 'OCR 실패' })
    }

    const data = await response.json()
    const text = data.choices?.[0]?.message?.content?.trim() || ''
    res.json({ text })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}
