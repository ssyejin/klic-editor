const API_KEY = import.meta.env.VITE_GROQ_API_KEY
const API_URL = 'https://api.groq.com/openai/v1/chat/completions'

const SYSTEM_PROMPT = `당신은 AI Editor 툴의 어시스턴트입니다. 사용자가 HTML 마크업 수정을 요청하면 현재 HTML을 수정해서 반환하세요.

규칙:
- HTML 수정 요청이면 수정된 HTML 코드만 반환하세요. 설명 없이 코드만 출력하세요.
- 일반 질문이면 한국어로 친절하게 답변하세요.
- 현재 HTML이 없으면 "현재 변환된 결과가 없습니다."라고 안내하세요.
- 절대 inline style을 사용하지 마세요. 반드시 아래 클래스를 사용하세요.

정렬 클래스 규칙:
- 왼쪽 정렬 → class="al"
- 오른쪽 정렬 → class="ar"
- 가운데 정렬 → class="ac"
- float left → class="fl"
- float right → class="fr"`

export async function sendMessage(messages, currentHtml) {
  const contextMsg = currentHtml
    ? `[현재 HTML 결과]\n${currentHtml}`
    : '[현재 HTML 결과 없음]'

  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'system', content: contextMsg },
        ...messages,
      ],
    }),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error?.message || '응답 실패')
  }

  const data = await response.json()
  return data.choices?.[0]?.message?.content?.trim() || ''
}

export function isHtmlResponse(text) {
  return /<[a-z][\s\S]*>/i.test(text)
}
