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

  doc.querySelectorAll('style, script, meta, link, head').forEach(el => el.remove())

  const KEEP_ATTRS = ['colspan', 'rowspan']
  doc.querySelectorAll('*').forEach(el => {
    Array.from(el.attributes).forEach(attr => {
      if (!KEEP_ATTRS.includes(attr.name)) el.removeAttribute(attr.name)
    })
  })

  const tables = doc.querySelectorAll('table')
  if (tables.length === 0) return doc.body.innerText.slice(0, 3000)

  return Array.from(tables).map(t => t.outerHTML).join('\n')
}

function maskCellText(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const map = {}
  doc.querySelectorAll('td, th').forEach((cell, i) => {
    const key = `KCELL${i}END`
    map[key] = cell.textContent.trim()
    cell.innerHTML = key
  })
  return { masked: doc.body.innerHTML, map }
}

function restoreCellText(html, map) {
  return Object.entries(map).reduce((acc, [key, val]) => acc.replaceAll(key, val), html)
}

function buildCaption(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  doc.querySelectorAll('table').forEach(table => {
    const headers = Array.from(table.querySelectorAll('thead th'))
      .map(th => th.textContent.trim())
      .filter(Boolean)
    if (headers.length === 0) return
    const caption = table.querySelector('caption') || doc.createElement('caption')
    caption.textContent = `${headers.join(', ')} 에 관한 정보 제공`
    if (!table.querySelector('caption')) table.prepend(caption)
  })
  return doc.body.innerHTML
}

function countTheadRows(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  return doc.querySelectorAll('thead tr').length
}

function countTotalRows(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  return doc.querySelectorAll('tr').length
}

function applyTheadCount(html, n) {
  const doc = new DOMParser().parseFromString(html, 'text/html')

  doc.querySelectorAll('table').forEach(table => {
    const allRows = Array.from(table.querySelectorAll('tr'))
    let thead = table.querySelector('thead') || doc.createElement('thead')
    let tbody = table.querySelector('tbody') || doc.createElement('tbody')
    const caption = table.querySelector('caption')
    const colgroup = table.querySelector('colgroup')

    thead.innerHTML = ''
    tbody.innerHTML = ''

    allRows.forEach((row, i) => {
      if (i < n) {
        row.querySelectorAll('td').forEach(td => {
          const th = doc.createElement('th')
          th.innerHTML = td.innerHTML
          Array.from(td.attributes).forEach(a => th.setAttribute(a.name, a.value))
          td.replaceWith(th)
        })
        thead.appendChild(row)
      } else {
        row.querySelectorAll('th').forEach(th => {
          const td = doc.createElement('td')
          td.innerHTML = th.innerHTML
          Array.from(th.attributes).forEach(a => td.setAttribute(a.name, a.value))
          th.replaceWith(td)
        })
        tbody.appendChild(row)
      }
    })

    table.innerHTML = ''
    if (caption) table.appendChild(caption)
    if (colgroup) table.appendChild(colgroup)
    table.appendChild(thead)
    table.appendChild(tbody)
  })

  return doc.body.innerHTML
}

export default function FileConverter() {
  const [status, setStatus] = useState('idle')
  const [result, setResult] = useRecoilState(editorResultState)
  const [errorMsg, setErrorMsg] = useState('')
  const [theadCount, setTheadCount] = useState(1)
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
      const { masked, map } = maskCellText(cleaned)
      const html = await convertTablesToHtml(masked)
      const restored = restoreCellText(html, map)
      const normalized = restored ? restored.replace(/<colgroup>[\s\S]*?<\/colgroup>/gi, '<colgroup>\n<col style="width:auto;">\n</colgroup>') : ''
      const adjusted = normalized ? applyTheadCount(normalized, 1) : ''
      const captioned = adjusted ? buildCaption(adjusted) : ''
      const formatted = captioned ? formatHtml(captioned) : '표를 찾을 수 없습니다.'
      setResult(formatted)
      setTheadCount(1)
      setStatus('done')
    } catch (err) {
      setErrorMsg(err.message)
      setStatus('error')
    }
  }

  function handleTheadChange(delta) {
    const total = countTotalRows(result)
    const next = Math.min(Math.max(1, theadCount + delta), total - 1)
    if (next === theadCount) return
    const updated = formatHtml(buildCaption(applyTheadCount(result, next)))
    setTheadCount(next)
    setResult(updated)
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
            <div className="thead-control">
              <span>thead</span>
              <button onClick={() => handleTheadChange(-1)}>-</button>
              <span>{theadCount}줄</span>
              <button onClick={() => handleTheadChange(1)}>+</button>
            </div>
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
