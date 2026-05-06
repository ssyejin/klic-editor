const TABLE_SYSTEM_PROMPT = `당신은 문서 변환 전문가입니다. 제공된 HTML에서 표를 찾아 아래 규칙대로 변환하세요.

변환 규칙:
- 모든 표는 <div class="tbl_st"><table>...</table></div>로 감싸세요
- <caption> → <colgroup> → <thead> → <tbody> 순서를 반드시 지키세요
- 표 내용을 한 줄로 요약한 <caption>을 가장 먼저 넣으세요
- <colgroup>은 열 수만큼 <col>을 넣되 width 속성은 쓰지 마세요
- 헤더 행(열을 설명하는 제목 행)은 몇 줄이든 전부 <thead>에 넣으세요. 헤더가 2줄 이상이면 모두 <thead>에 넣어야 합니다
- thead 셀은 <th>, tbody 셀은 <td>로 변환하세요
- colspan, rowspan은 반드시 그대로 유지하세요
- HTML 코드만 반환하고 마크다운 코드블록(\`\`\`)은 쓰지 마세요
- 표가 없으면 빈 문자열을 반환하세요`

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { content } = req.body
  if (!content) return res.status(400).json({ error: '내용이 필요합니다.' })

  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: TABLE_SYSTEM_PROMPT },
          { role: 'user', content: `다음 문서 내용에서 표를 HTML로 변환해주세요:\n\n${content}` },
        ],
      }),
    })

    if (!response.ok) {
      const error = await response.json()
      return res.status(response.status).json({ error: error.error?.message || 'API 호출 실패' })
    }

    const data = await response.json()
    const html = data.choices?.[0]?.message?.content?.trim() || ''
    res.json({ html })
  } catch (err) {
    res.status(500).json({ error: `변환 실패: ${err.message}` })
  }
}
