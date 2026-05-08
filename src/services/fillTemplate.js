const API_KEY = import.meta.env.VITE_GROQ_API_KEY
const API_URL = 'https://api.groq.com/openai/v1/chat/completions'

async function fetchWithRetry(url, options, retries = 3) {
  for (let attempt = 0; attempt < retries; attempt++) {
    const res = await fetch(url, options)
    if (res.status !== 429) return res
    if (attempt < retries - 1) await new Promise(r => setTimeout(r, 3000 * (attempt + 1)))
  }
  throw new Error('요청이 너무 많습니다. 잠시 후 다시 시도해주세요.')
}

export async function fillTemplateWithContent(markup, templateCode, ocrText = '') {
  const response = await fetchWithRetry(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      max_tokens: 4096,
      messages: [
        {
          role: 'system',
          content: `You are a content migration specialist for Korean school websites.
Your job is to fill an HTML template with real content extracted from an old school website.

CRITICAL RULES:
1. The template contains ONLY sample/placeholder text — nothing in it is real content. You must replace ALL of it.
2. Keep every HTML tag, class, attribute, and comment exactly as-is. Never alter the HTML structure.
3. Do NOT translate anything. All Korean must stay Korean.
4. Return ONLY the filled HTML. No explanations, no markdown fences, no extra text.

WHAT TO FIND AND REPLACE:
- ○○기관 / ○○학교 → actual school name (e.g. 서울초등학교, 부산중학교)
- 홍 길 동 / 홍길동 → actual principal's name extracted from the source
- 교장 → keep as 교장 unless source shows 교감 or other title
- 인사말 본문 (text inside .txt or .txt-wrap) → replace with the actual greeting text from the source; preserve natural paragraph breaks using <br> or <p> tags matching the template structure
- 리드 문구 / 슬로건 (text inside .lead-txt, .lead-wrap, <h4>, <strong> near top) → replace with the school's actual slogan or opening phrase if found; otherwise craft a short, appropriate Korean phrase based on the school name and greeting content
- Organization Name → replace with the school name in English if available, or romanized Korean school name
- Great Organization! / similar English text → replace with an English rendering of the school's slogan or name
- 더 강한 기관으로 더 빛나는 미래를 향해 → replace with actual slogan or a fitting phrase derived from the greeting content

OCR TEXT PRIORITY: If OCR-extracted text is provided, it is the most accurate source for the greeting body — use it as the primary content for the main text area.`,
        },
        {
          role: 'user',
          content: `[기존 학교 사이트 마크업]\n${markup}${ocrText ? `\n\n[이미지 OCR 텍스트 — 인사말 본문으로 우선 사용]\n${ocrText}` : ''}\n\n[채울 템플릿 — 모든 예시 텍스트를 실제 내용으로 교체할 것]\n${templateCode}`,
        },
      ],
    }),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error?.message || '템플릿 채우기 실패')
  }

  const data = await response.json()
  return data.choices?.[0]?.message?.content?.trim() || ''
}
