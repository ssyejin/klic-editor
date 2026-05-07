const TABLE_SYSTEM_PROMPT = `You are an HTML table conversion expert. Convert tables found in the provided HTML according to the rules below.

CRITICAL: Never translate any text. Keep all text exactly as it appears in the original language (Korean, English, etc.). Only change the HTML structure, not the content.

Rules:
- Wrap every table with <div class="tbl_st"><table>...</table></div>
- Order must be: <caption> → <colgroup> → <thead> → <tbody>
- Add <caption> first, summarizing the table content in one line using the original language
- Add <col> elements in <colgroup> matching the number of columns, no width attribute
- All header rows go into <thead>, even if there are multiple header rows
- Header cells use <th>, body cells use <td>
- Preserve all colspan and rowspan attributes exactly
- Return HTML code only, no markdown code blocks
- Return empty string if no tables found`

function theadInstruction(theadRows) {
  if (theadRows === 'auto') return 'Determine header rows automatically based on content structure.'
  return `Put exactly ${theadRows} row(s) into <thead>. No more, no less.`
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { content, theadRows = 'auto' } = req.body
  if (!content) return res.status(400).json({ error: '내용이 필요합니다.' })

  const prompt = TABLE_SYSTEM_PROMPT + `\n- thead rows: ${theadInstruction(theadRows)}`

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
          { role: 'system', content: prompt },
          { role: 'user', content: `Convert the tables in the following content to HTML. DO NOT translate any text — keep every word exactly as written in the original language.\n\n${content}` },
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
