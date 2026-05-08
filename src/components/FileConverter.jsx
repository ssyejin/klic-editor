import { useState, useRef, useEffect } from 'react'
import { useRecoilState } from 'recoil'
import { convertTablesToHtml } from '../services/claudeApi'
import { editorResultState } from '../store/atoms'
import { formatHtml } from '../utils/formatHtml'

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

function applyScrollGr(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  doc.querySelectorAll('table').forEach(table => {
    let maxCols = 0
    let maxRowText = 0
    table.querySelectorAll('tr').forEach(row => {
      let cols = 0
      let textLen = 0
      row.querySelectorAll('td, th').forEach(cell => {
        cols += parseInt(cell.getAttribute('colspan') || 1)
        textLen += cell.textContent.trim().length
      })
      maxCols = Math.max(maxCols, cols)
      maxRowText = Math.max(maxRowText, textLen)
    })
    const needs = maxCols >= 5 || (maxCols >= 3 && maxRowText > 100)
    if (!needs) return
    const wrapper = table.closest('.tbl_st') || table.parentElement
    if (wrapper) wrapper.classList.add('scroll_gr')
  })
  return doc.body.innerHTML
}

function buildCaption(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  doc.querySelectorAll('table').forEach(table => {
    const headers = Array.from(table.querySelectorAll('thead th'))
      .map(th => th.textContent.trim())
      .filter(Boolean)
    if (headers.length === 0) return
    const caption = table.querySelector('caption') || doc.createElement('caption')
    caption.textContent = `${headers.join(', ')}에 관한 정보 제공`
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
  const previewRef = useRef(null)
  const measuredResult = useRef(null)

  useEffect(() => {
    if (!result || result === measuredResult.current) return
    if (!previewRef.current) return

    const frame = requestAnimationFrame(() => {
      const preview = previewRef.current
      if (!preview) return

      let changed = false
      preview.querySelectorAll('.tbl_st').forEach(wrapper => {
        const table = wrapper.querySelector('table')
        if (!table) return
        if (table.scrollWidth > wrapper.clientWidth + 1) {
          if (wrapper.classList.contains('scroll_gr')) {
            wrapper.classList.remove('scroll_gr')
            changed = true
          }
          if (!wrapper.classList.contains('scroll_wide')) {
            wrapper.classList.add('scroll_wide')
            changed = true
          }
        }
      })

      if (changed) {
        const newResult = formatHtml(preview.innerHTML)
        measuredResult.current = newResult
        setResult(newResult)
      } else {
        measuredResult.current = result
      }
    })

    return () => cancelAnimationFrame(frame)
  }, [result])

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
      const scrolled = captioned ? applyScrollGr(captioned) : ''
      const formatted = scrolled ? formatHtml(scrolled) : '표를 찾을 수 없습니다.'
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
    const updated = formatHtml(applyScrollGr(buildCaption(applyTheadCount(result, next))))
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
          <textarea
            className="result-code"
            value={result}
            onChange={e => setResult(e.target.value)}
            spellCheck={false}
          />
          <div className="result-preview">
            <p className="preview-label">미리보기</p>
            <div ref={previewRef} dangerouslySetInnerHTML={{ __html: result }} />
          </div>
        </div>
      )}
    </div>
  )
}
