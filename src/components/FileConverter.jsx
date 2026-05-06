import { useState, useRef } from 'react'
import { useRecoilState } from 'recoil'
import { convertTablesToHtml } from '../services/claudeApi'
import { editorResultState } from '../store/atoms'

const VOID_TAGS = /^<(area|base|br|col|embed|hr|img|input|link|meta|param|source|track|wbr)[\s>]/i

function formatHtml(html) {
  let indent = 0
  return html
    .replace(/>\s*</g, '>\n<')
    .split('\n')
    .map(line => {
      line = line.trim()
      if (!line) return ''
      if (line.startsWith('</')) indent = Math.max(0, indent - 1)
      const result = '  '.repeat(indent) + line
      if (!line.startsWith('</') && !line.endsWith('/>') && !VOID_TAGS.test(line) && !line.includes('</')) indent++
      return result
    })
    .filter(Boolean)
    .join('\n')
}

function cleanHtml(html) {
  const parser = new DOMParser()
  const doc = parser.parseFromString(html, 'text/html')

  // 불필요한 태그 제거
  doc.querySelectorAll('style, script, meta, link, head').forEach(el => el.remove())

  // 모든 요소에서 style, class, id 등 속성 제거, 구조 태그만 유지
  const KEEP_ATTRS = ['colspan', 'rowspan']
  doc.querySelectorAll('*').forEach(el => {
    Array.from(el.attributes).forEach(attr => {
      if (!KEEP_ATTRS.includes(attr.name)) el.removeAttribute(attr.name)
    })
  })

  // table 구조만 추출
  const tables = doc.querySelectorAll('table')
  if (tables.length === 0) return doc.body.innerText.slice(0, 3000)

  return Array.from(tables).map(t => t.outerHTML).join('\n')
}

export default function FileConverter() {
  const [status, setStatus] = useState('idle')
  const [result, setResult] = useRecoilState(editorResultState)
  const [errorMsg, setErrorMsg] = useState('')
  const editorRef = useRef(null)

  function handlePaste(e) {
    e.preventDefault()
    const html = e.clipboardData.getData('text/html')
    const text = e.clipboardData.getData('text/plain')
    document.execCommand('insertHTML', false, html || text)
  }

  async function handleConvert() {
    const content = editorRef.current?.innerHTML
    if (!content || content === '<br>') return

    setStatus('loading')
    setResult('')
    setErrorMsg('')

    try {
      const cleaned = cleanHtml(content)
      const html = await convertTablesToHtml(cleaned)
      const normalized = html ? html.replace(/<colgroup>[\s\S]*?<\/colgroup>/gi, '<colgroup>\n<col style="width:auto;">\n</colgroup>') : ''
      setResult(normalized ? formatHtml(normalized) : '표를 찾을 수 없습니다.')
      setStatus('done')
    } catch (err) {
      setErrorMsg(err.message)
      setStatus('error')
    }
  }

  function copyToClipboard() {
    navigator.clipboard.writeText(result)
  }

  return (
    <div className="converter">
      <div
        ref={editorRef}
        className="input-area"
        contentEditable
        suppressContentEditableWarning
        onPaste={handlePaste}
        data-placeholder="한글 문서에서 표를 복사해서 붙여넣기 하세요"
      />
      <button
        className="convert-btn"
        onClick={handleConvert}
        disabled={status === 'loading'}
      >
        {status === 'loading' ? '변환 중...' : 'HTML 변환'}
      </button>

      {status === 'error' && (
        <div className="error-box">{errorMsg}</div>
      )}

      {(status === 'done' || result) && (
        <div className="result-box">
          <div className="result-header">
            <span>변환 결과</span>
            <button onClick={copyToClipboard}>복사</button>
          </div>
          <pre className="result-code">{result}</pre>
          <div className="result-preview">
            <p className="preview-label">미리보기</p>
            <div dangerouslySetInnerHTML={{ __html: result }} />
          </div>
        </div>
      )}
    </div>
  )
}
