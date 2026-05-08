const API_KEY = import.meta.env.VITE_GROQ_API_KEY
const API_URL = 'https://api.groq.com/openai/v1/chat/completions'

const SYSTEM_PROMPT = `You are an expert document markup converter. Convert a PDF page image to HTML following these rules exactly.

Rules:
- Big title → <h2>
- Subtitle → <h3>
- Body paragraph → <p>
- Unordered list → <ul><li>...</li></ul>
- Ordered list → <ol><li>...</li></ol>
- Wrap every table: <div class="tbl_st"><table><caption>brief summary</caption>...</table></div>
- First row(s) → <thead><tr>...</tr></thead>, remaining rows → <tbody>
- thead cells → <th>, tbody cells → <td>
- Preserve colspan and rowspan attributes exactly as shown in the image
- Line breaks inside cells → use <br>
- Return only the HTML code. No explanations, no markdown code fences.
- Ignore decorative images.

CRITICAL for tables:
- Output EVERY row. Never truncate or summarize rows.
- Count all rows in the image before you start writing. Include every single row in the output.
- Do not skip rows even if they look repetitive or similar.`

export async function convertPageToMarkup(base64) {
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({
      model: 'meta-llama/llama-4-scout-17b-16e-instruct',
      max_tokens: 8192,
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
              text: 'Convert this PDF page to HTML markup. Include ALL rows of every table without exception.',
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
