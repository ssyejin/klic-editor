const API_KEY = import.meta.env.VITE_GROQ_API_KEY
const API_URL = 'https://api.groq.com/openai/v1/chat/completions'

const SYSTEM_PROMPT = `당신은 문서 마크업 변환 전문가입니다. PDF 페이지 이미지를 보고 내용을 다음 규칙에 따라 HTML로 변환하세요.

변환 규칙:
- 큰 제목 → <h2>
- 소제목 → <h3>
- 본문 단락 → <p>
- 순서 없는 목록 → <ul><li>...</li></ul>
- 순서 있는 목록 → <ol><li>...</li></ol>
- 표의 첫 번째 행은 <thead><tr>...</tr></thead>, 나머지는 <tbody>
- 표는 반드시 <div class="tbl_st"><table><caption>표 내용 요약</caption>...</table></div> 구조로 감싸기
- thead 셀은 <th>, tbody 셀은 <td>
- HTML 코드만 반환하고 설명이나 마크다운 코드블록은 제외하세요
- 이미지, 장식 요소는 무시하세요`

export async function convertPageToMarkup(base64) {
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({
      model: 'meta-llama/llama-4-scout-17b-16e-instruct',
      messages: [
        {
          role: 'system',
          content: SYSTEM_PROMPT,
        },
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: { url: `data:image/jpeg;base64,${base64}` },
            },
            {
              type: 'text',
              text: '이 PDF 페이지를 HTML 마크업으로 변환해주세요.',
            },
          ],
        },
      ],
    }),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error?.message || '변환 실패')
  }

  const data = await response.json()
  return data.choices?.[0]?.message?.content?.trim() || ''
}
