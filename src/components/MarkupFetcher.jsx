import { useState } from 'react'
import { useRecoilState } from 'recoil'
import { extractTextFromImage } from '../services/ocrApi'
import { markupResultState } from '../store/atoms'
import { formatHtml } from '../utils/formatHtml'

function extractContentsRegion(rawHtml) {
  // 첫 번째 <!-- contents --> 이후, 다음 <!--.*contents.*--> 사이 추출
  const match = rawHtml.match(/<!--\s*contents\s*-->([\s\S]*?)<!--[^>]*contents[^>]*-->/i)
  return match ? match[1].trim() : null
}

function extractMarkupAndImages(html, baseUrl, selector = '') {
  const contentsHtml = extractContentsRegion(html)

  const parser = new DOMParser()
  const doc = parser.parseFromString(selector.trim() ? html : (contentsHtml ?? html), 'text/html')

  doc.querySelectorAll('script, style, noscript, iframe, svg').forEach(el => el.remove())

  let markupHtml
  if (selector.trim()) {
    const matched = Array.from(doc.querySelectorAll(selector.trim()))
    if (matched.length > 0) {
      matched.forEach(el => {
        el.querySelectorAll('*').forEach(child => {
          ['style', 'onclick', 'onload', 'onerror'].forEach(attr => child.removeAttribute(attr))
        })
      })
      markupHtml = matched.map(el => el.outerHTML).join('\n')
    }
  }

  if (!markupHtml) {
    const target = contentsHtml
      ? doc.body
      : (doc.querySelector('.greeting') || doc.getElementById('subContent') || doc.body)
    target.querySelectorAll('*').forEach(el => {
      ['style', 'onclick', 'onload', 'onerror'].forEach(attr => el.removeAttribute(attr))
    })
    markupHtml = target.innerHTML
  }

  const markup = formatHtml(markupHtml)

  const origin = new URL(baseUrl).origin
  const markupDoc = parser.parseFromString(markupHtml, 'text/html')
  const images = Array.from(markupDoc.querySelectorAll('img'))
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

  return { markup, images }
}

export default function MarkupFetcher() {
  const [url, setUrl] = useState('')
  const [selector, setSelector] = useState('')
  const [status, setStatus] = useState('idle')
  const [markup, setMarkup] = useRecoilState(markupResultState)
  const [images, setImages] = useState([])
  const [errorMsg, setErrorMsg] = useState('')
  const [showImages, setShowImages] = useState(false)
  const [ocrResults, setOcrResults] = useState({})
  const [ocrLoading, setOcrLoading] = useState({})

  async function handleFetch() {
    if (!url.trim()) return
    setStatus('loading')
    setMarkup('')
    setImages([])
    setOcrResults({})
    setErrorMsg('')

    try {
      const res = await fetch('/api/fetch-markup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

      const { markup, images } = extractMarkupAndImages(data.html, url, selector)
      setMarkup(markup)
      setImages(images)
      setShowImages(false)
      setStatus('done')
    } catch (err) {
      setErrorMsg(err.message)
      setStatus('error')
    }
  }

  async function handleOcr(imgUrl) {
    setOcrLoading(prev => ({ ...prev, [imgUrl]: true }))

    try {
      const res = await fetch('/api/fetch-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: imgUrl }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

      const text = await extractTextFromImage(data.base64, data.contentType)
      setOcrResults(prev => ({ ...prev, [imgUrl]: text || '텍스트 없음' }))
    } catch (err) {
      setOcrResults(prev => ({ ...prev, [imgUrl]: `오류: ${err.message}` }))
    } finally {
      setOcrLoading(prev => ({ ...prev, [imgUrl]: false }))
    }
  }

  function copyText(text) {
    navigator.clipboard.writeText(text)
  }

  return (
    <div className="converter">
      <div className="url-input-row">
        <input
          className="url-input"
          type="text"
          placeholder="https://example.com"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleFetch()}
        />
        <button
          className="convert-btn"
          onClick={handleFetch}
          disabled={status === 'loading' || !url.trim()}
        >
          {status === 'loading' ? '가져오는 중...' : '마크업 가져오기'}
        </button>
      </div>
      <input
        className="url-input selector-input"
        type="text"
        placeholder="추출할 영역 선택자 (선택) — 예: #subContent  /  클래스 여러 개: .box_st2.ac (공백 없이)"
        value={selector}
        onChange={(e) => setSelector(e.target.value)}
      />

      {status === 'error' && (
        <div className="error-box">{errorMsg}</div>
      )}

      {(status === 'done' || markup) && (
        <>
          <div className="result-box">
            <div className="result-header">
              <span>마크업 결과</span>
              <button onClick={() => copyText(markup)}>복사</button>
            </div>
            <pre className="result-code">{markup}</pre>
          </div>

          <div className="result-box">
            <div className="result-header"><span>미리보기</span></div>
            <div className="markup-preview" dangerouslySetInnerHTML={{ __html: markup }} />
          </div>

          {images.length > 0 && (
            <div className="image-list">
              <button className="toggle-btn" onClick={() => setShowImages(v => !v)}>
                {showImages ? '이미지 텍스트 추출 닫기' : `이미지 텍스트 추출 (${images.length}개)`}
              </button>
              {showImages && images.map((imgUrl) => (
                <div key={imgUrl} className="image-item">
                  <img src={imgUrl} alt="" className="image-thumb" />
                  <div className="image-ocr">
                    <button
                      className="ocr-btn"
                      onClick={() => handleOcr(imgUrl)}
                      disabled={ocrLoading[imgUrl]}
                    >
                      {ocrLoading[imgUrl] ? '추출 중...' : '텍스트 추출'}
                    </button>
                    {ocrResults[imgUrl] && (
                      <div className="ocr-result">
                        <pre>{ocrResults[imgUrl]}</pre>
                        <button className="copy-small" onClick={() => copyText(ocrResults[imgUrl])}>복사</button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
