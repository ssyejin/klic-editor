import { useState, useRef } from 'react'
import { formatHtml } from '../utils/formatHtml'
import { extractTextFromImage } from '../services/ocrApi'
import greeting from '../templates/greeting'
import history from '../templates/history'
import principal from '../templates/principal'
import symbol from '../templates/symbol'

const TEMPLATES = [...greeting, ...history, ...principal, ...symbol]

function parseInput(text) {
  return text.split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => {
      const parts = line.split('\t')
      if (parts.length >= 2) return { name: parts[0].trim(), url: parts[1].trim() }
      const urlMatch = line.match(/https?:\/\/\S+/)
      if (urlMatch) return { name: urlMatch[0], url: urlMatch[0] }
      return null
    })
    .filter(Boolean)
}

function extractImages(markup, baseUrl) {
  try {
    const origin = new URL(baseUrl).origin
    const doc = new DOMParser().parseFromString(markup, 'text/html')
    return Array.from(doc.querySelectorAll('img'))
      .map(img => {
        const src = img.getAttribute('src')
        if (!src) return null
        if (src.startsWith('http')) return src
        if (src.startsWith('//')) return `https:${src}`
        if (src.startsWith('/')) return `${origin}${src}`
        return `${origin}/${src}`
      })
      .filter(Boolean)
      .filter((src, i, arr) => arr.indexOf(src) === i)
  } catch {
    return []
  }
}

function extractContent(html, selector = '') {
  const parser = new DOMParser()

  let doc
  if (selector.trim()) {
    doc = parser.parseFromString(html, 'text/html')
    doc.querySelectorAll('script, style, noscript, iframe, svg').forEach(el => el.remove())
    const matched = Array.from(doc.querySelectorAll(selector.trim()))
    if (matched.length > 0) {
      matched.forEach(el => {
        el.querySelectorAll('*').forEach(child => {
          ['style', 'onclick', 'onload', 'onerror'].forEach(attr => child.removeAttribute(attr))
        })
      })
      return formatHtml(matched.map(el => el.outerHTML).join('\n'))
    }
  }

  const match = html.match(/<!--\s*contents\s*-->([\s\S]*?)<!--[^>]*contents[^>]*-->/i)
  const sourceHtml = match ? match[1].trim() : html
  doc = parser.parseFromString(sourceHtml, 'text/html')
  doc.querySelectorAll('script, style, noscript, iframe, svg').forEach(el => el.remove())

  const target = doc.querySelector('.greeting') || doc.getElementById('subContent') || doc.body
  target.querySelectorAll('*').forEach(el => {
    ['style', 'onclick', 'onload', 'onerror'].forEach(attr => el.removeAttribute(attr))
  })
  return formatHtml(target.innerHTML)
}


function applyOcrToTemplate(templateCode, ocrText) {
  const doc = new DOMParser().parseFromString(templateCode, 'text/html')
  const txtEl = doc.querySelector('.txt-wrap .txt') || doc.querySelector('.greeting .txt')
  if (!txtEl) return templateCode

  const paras = ocrText.trim()
    .split(/\n{2,}/)
    .filter(Boolean)
    .map(p => `<p>${p.replace(/\n/g, '<br>')}</p>`)
    .join('\n')

  txtEl.innerHTML = '\n' + paras + '\n'
  return doc.body.innerHTML
}

function applyMarkupToTemplate(sourceMarkup, templateCode) {
  const src = new DOMParser().parseFromString(sourceMarkup, 'text/html')
  const tpl = new DOMParser().parseFromString(templateCode, 'text/html')
  src.querySelectorAll('script, style, noscript').forEach(el => el.remove())

  // 본문 텍스트 매핑 — 소스의 모든 p 태그 수집 (.sign 제외)
  const tplTxt = tpl.querySelector('.txt-wrap .txt') || tpl.querySelector('.greeting .txt')
  if (tplTxt) {
    const pTags = Array.from(src.querySelectorAll('p:not(.sign)'))
      .map(p => p.textContent.trim()).filter(t => t.length > 5)
    if (pTags.length > 0) {
      tplTxt.innerHTML = '\n' + pTags.map(p => `<p>${p}</p>`).join('\n') + '\n'
    }
  }

  // .sign 매핑 — 클래스명 동일하면 바로 교체
  const srcSign = src.querySelector('.sign')
  const tplSign = tpl.querySelector('.sign')
  if (srcSign && tplSign) {
    tplSign.innerHTML = srcSign.innerHTML
  }

  return tpl.body.innerHTML
}

export default function BatchPage() {
  const [input, setInput] = useState('')
  const [selector, setSelector] = useState('')
  const [globalTemplate, setGlobalTemplate] = useState('')
  const [items, setItems] = useState([])
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [copiedIdx, setCopiedIdx] = useState(null)
  const abortRef = useRef(false)

  const CATEGORIES = [...new Set(TEMPLATES.map(t => t.category))]

  function updateItem(i, patch) {
    setItems(prev => prev.map((item, idx) => idx === i ? { ...item, ...patch } : item))
  }

  async function handleStart() {
    const parsed = parseInput(input)
    if (parsed.length === 0) return

    const globalTpl = TEMPLATES.find(t => t.id === globalTemplate)
    setItems(parsed.map(item => ({
      ...item, status: 'pending', markup: '', error: '',
      templateId: globalTemplate, editedCode: globalTpl?.code || '',
      ocrText: '', ocring: false,
    })))
    setRunning(true)
    abortRef.current = false
    setProgress({ done: 0, total: parsed.length })

    for (let i = 0; i < parsed.length; i++) {
      if (abortRef.current) break

      updateItem(i, { status: 'loading' })

      try {
        const res = await fetch('/api/fetch-markup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: parsed[i].url }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error)

        const markup = extractContent(data.html, selector)
        const images = extractImages(markup, parsed[i].url)
        updateItem(i, { status: 'done', markup, images })
      } catch (err) {
        updateItem(i, { status: 'error', error: err.message })
      }

      setProgress({ done: i + 1, total: parsed.length })
    }

    setRunning(false)
  }

  async function handleOcr(i, imgUrl) {
    updateItem(i, { ocring: imgUrl, ocrError: null })
    try {
      const res = await fetch('/api/fetch-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: imgUrl }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      const text = await extractTextFromImage(data.base64, data.contentType)
      updateItem(i, { ocring: null, ocrText: text || '', lastOcrImg: imgUrl })
    } catch (err) {
      updateItem(i, { ocring: null, ocrError: err.message, lastOcrImg: imgUrl })
    }
  }

  function handleTemplateChange(i, templateId) {
    const tpl = TEMPLATES.find(t => t.id === templateId)
    updateItem(i, { templateId, editedCode: tpl?.code || '' })
  }

  function copyText(text, key) {
    navigator.clipboard.writeText(text)
    setCopiedIdx(key)
    setTimeout(() => setCopiedIdx(null), 1500)
  }

  function copyAll() {
    const text = items
      .filter(item => item.editedCode || item.markup)
      .map(item => `<!-- ${item.name} -->\n${item.editedCode || item.markup}`)
      .join('\n\n')
    navigator.clipboard.writeText(text)
  }

  const doneCount = items.filter(i => i.status === 'done').length
  const errorCount = items.filter(i => i.status === 'error').length
  const filledCount = items.filter(i => i.editedCode && i.editedCode !== TEMPLATES.find(t => t.id === i.templateId)?.code).length

  return (
    <div className="page">
      <h2>일괄 마크업 가져오기</h2>
      <p className="section-desc">스프레드시트에서 학교명과 URL을 복사해서 붙여넣으세요.</p>

      <textarea
        className="batch-textarea"
        placeholder={'학교명\tURL\n서울초등학교\thttps://seoul.es.kr\n부산초등학교\thttps://busan.es.kr'}
        value={input}
        onChange={e => setInput(e.target.value)}
        disabled={running}
      />

      <div className="batch-options">
        <input
          className="url-input selector-input"
          type="text"
          placeholder="공통 선택자 (선택) — 예: #subContent  /  클래스 여러 개: .box_st2.ac"
          value={selector}
          onChange={e => setSelector(e.target.value)}
          disabled={running}
        />
        <select
          className="batch-tpl-select"
          value={globalTemplate}
          onChange={e => setGlobalTemplate(e.target.value)}
          disabled={running}
        >
          <option value="">템플릿 선택 (선택)</option>
          {CATEGORIES.map(cat => (
            <optgroup key={cat} label={cat}>
              {TEMPLATES.filter(t => t.category === cat).map(t => (
                <option key={t.id} value={t.id}>{t.label}</option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>

      <div className="batch-controls">
        {!running ? (
          <button className="convert-btn" onClick={handleStart} disabled={!input.trim()}>
            일괄 가져오기 시작
          </button>
        ) : (
          <button className="convert-btn batch-stop-btn" onClick={() => { abortRef.current = true }}>
            중단
          </button>
        )}
        {doneCount > 0 && !running && (
          <button className="convert-btn" onClick={copyAll}>전체 복사</button>
        )}
      </div>

      {items.length > 0 && (
        <div className="batch-progress">
          <span className="batch-progress-text">{progress.done} / {progress.total}</span>
          {doneCount > 0 && <span className="batch-stat batch-stat--done">{doneCount}개 완료</span>}
          {filledCount > 0 && <span className="batch-stat batch-stat--filled">{filledCount}개 편집됨</span>}
          {errorCount > 0 && <span className="batch-stat batch-stat--error">{errorCount}개 실패</span>}
        </div>
      )}

      <div className="batch-results">
        {items.map((item, i) => (
          <div key={i} className={`batch-item batch-item--${item.status}`}>
            <div className="batch-item-header">
              <span className="batch-item-name">{item.name}</span>
              <span className="batch-item-url">{item.url}</span>
              <div className="batch-item-actions">
                {item.status === 'pending' && <span className="batch-badge">대기</span>}
                {item.status === 'loading' && <span className="batch-badge batch-badge--loading">처리 중...</span>}
                {item.status === 'error' && <span className="batch-badge batch-badge--error" title={item.error}>실패</span>}
                {item.status === 'done' && (
                  <>
                    <select
                      className="batch-tpl-select-inline"
                      value={item.templateId}
                      onChange={e => handleTemplateChange(i, e.target.value)}
                    >
                      <option value="">템플릿 선택</option>
                      {CATEGORIES.map(cat => (
                        <optgroup key={cat} label={cat}>
                          {TEMPLATES.filter(t => t.category === cat).map(t => (
                            <option key={t.id} value={t.id}>{t.label}</option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                    {item.templateId && (
                      <button
                        className="batch-apply-btn"
                        onClick={() => {
                          const tplCode = TEMPLATES.find(t => t.id === item.templateId)?.code || ''
                          const result = item.ocrText
                            ? applyOcrToTemplate(tplCode, item.ocrText)
                            : applyMarkupToTemplate(item.markup, tplCode)
                          updateItem(i, { editedCode: result })
                        }}
                      >
                        적용
                      </button>
                    )}
                    {item.editedCode && (
                      <button onClick={() => copyText(item.editedCode, `code-${i}`)}>
                        {copiedIdx === `code-${i}` ? '복사됨' : '결과 복사'}
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>

            {item.status === 'error' && (
              <p className="batch-item-error">{item.error}</p>
            )}

            {item.status === 'done' && item.images?.length > 0 && (
              <div className="batch-thumb-row">
                <span className="batch-thumb-hint">이미지 클릭 → 텍스트 추출</span>
                {item.images.map((src, idx) => (
                  <button
                    key={idx}
                    className={`batch-thumb-btn${item.ocring === src ? ' batch-thumb-btn--loading' : ''}`}
                    onClick={() => handleOcr(i, src)}
                    disabled={!!item.ocring}
                    title={src}
                  >
                    <img src={src} alt="" className="batch-thumb" />
                    {item.ocring === src && <span className="batch-thumb-spinner">...</span>}
                  </button>
                ))}
                {item.ocrError && (
                  <>
                    <span className="batch-ocr-error">{item.ocrError}</span>
                    <button className="batch-ocr-retry" onClick={() => handleOcr(i, item.lastOcrImg)}>
                      재시도
                    </button>
                  </>
                )}
              </div>
            )}

            {item.status === 'done' && (item.ocrText || item.templateId) && (
              <div className={`batch-editor${item.ocrText && item.templateId ? ' batch-editor--split' : ''}`}>
                {item.ocrText && (
                  <div className="batch-editor-pane">
                    <div className="batch-editor-label batch-editor-label--ocr">
                      <span>OCR 추출 텍스트</span>
                    </div>
                    <textarea
                      className="batch-editor-textarea batch-editor-textarea--ocr"
                      value={item.ocrText}
                      onChange={e => updateItem(i, { ocrText: e.target.value })}
                      spellCheck={false}
                    />
                  </div>
                )}
                {item.templateId && (
                  <div className="batch-editor-pane">
                    <div className="batch-editor-label batch-editor-label--code">
                      <span>템플릿 코드 — 원하는 위치에 직접 수정</span>
                    </div>
                    <textarea
                      className="batch-editor-textarea batch-editor-textarea--code"
                      value={item.editedCode || ''}
                      onChange={e => updateItem(i, { editedCode: e.target.value })}
                      spellCheck={false}
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
