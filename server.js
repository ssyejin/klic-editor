import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import fetch from 'node-fetch'

const app = express()
const PORT = 3001

app.use(cors({ origin: process.env.ALLOWED_ORIGIN || 'http://localhost:5173' }))
app.use(express.json({ limit: '50mb' }))

function isSafeUrl(url) {
  try {
    const { hostname, protocol } = new URL(url)
    if (!['http:', 'https:'].includes(protocol)) return false
    // 내부망/루프백 차단 (SSRF 방지)
    if (/^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|0\.0\.0\.0|::1)/.test(hostname)) return false
    return true
  } catch {
    return false
  }
}

app.post('/api/fetch-markup', async (req, res) => {
  const { url } = req.body

  if (!url) return res.status(400).json({ error: 'URL이 필요합니다.' })
  if (!isSafeUrl(url)) return res.status(400).json({ error: '허용되지 않는 URL입니다.' })

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      timeout: 10000,
    })

    if (!response.ok) {
      return res.status(response.status).json({ error: `페이지를 가져올 수 없습니다. (${response.status})` })
    }

    const html = await response.text()
    res.json({ html })
  } catch (err) {
    res.status(500).json({ error: `요청 실패: ${err.message}` })
  }
})

app.post('/api/fetch-image', async (req, res) => {
  const { url } = req.body

  if (!url) return res.status(400).json({ error: 'URL이 필요합니다.' })
  if (!isSafeUrl(url)) return res.status(400).json({ error: '허용되지 않는 URL입니다.' })

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      timeout: 10000,
    })

    if (!response.ok) {
      return res.status(response.status).json({ error: '이미지를 가져올 수 없습니다.' })
    }

    const contentType = response.headers.get('content-type') || 'image/jpeg'
    const buffer = await response.arrayBuffer()
    const base64 = Buffer.from(buffer).toString('base64')

    res.json({ base64, contentType })
  } catch (err) {
    res.status(500).json({ error: `요청 실패: ${err.message}` })
  }
})

app.post('/api/ocr', async (req, res) => {
  const { base64, contentType } = req.body

  if (!base64 || !contentType) {
    return res.status(400).json({ error: 'base64와 contentType이 필요합니다.' })
  }

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
})

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
- Return empty string if no tables found

--- 예시 ---
입력:
<table>
<tr><td colspan="2">지역별 현황</td><td colspan="2">실적</td></tr>
<tr><td>시도</td><td>시군구</td><td>건수</td><td>금액</td></tr>
<tr><td>서울</td><td>강남구</td><td>12</td><td>3,200</td></tr>
</table>

출력:
<div class="tbl_st"><table>
<caption>지역별 실적 현황</caption>
<colgroup><col><col><col><col></colgroup>
<thead>
<tr><th colspan="2">지역별 현황</th><th colspan="2">실적</th></tr>
<tr><th>시도</th><th>시군구</th><th>건수</th><th>금액</th></tr>
</thead>
<tbody>
<tr><td>서울</td><td>강남구</td><td>12</td><td>3,200</td></tr>
</tbody>
</table></div>`

function theadInstruction(theadRows) {
  if (theadRows === 'auto') return 'Determine header rows automatically based on content structure.'
  return `Put exactly ${theadRows} row(s) into <thead>. No more, no less.`
}

app.post('/api/convert-table', async (req, res) => {
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
})

app.listen(PORT, () => {
  console.log(`서버 실행 중: http://localhost:${PORT}`)
})
