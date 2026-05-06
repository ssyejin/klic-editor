import { useState, useRef, useEffect } from 'react'
import { useRecoilState } from 'recoil'
import { pdfToImages } from '../services/pdfParser'
import { convertPageToMarkup } from '../services/pdfMarkupApi'
import { pdfResultState } from '../store/atoms'

const PAGE_SEP = '<!-- PAGE_BREAK -->'

function combinePages(pages) {
  return pages
    .filter(p => p.markup)
    .map(p => `<!-- PAGE:${p.page} -->\n${p.markup}`)
    .join(`\n${PAGE_SEP}\n`)
}

function splitToPages(combined) {
  return combined.split(PAGE_SEP).reduce((acc, chunk) => {
    const match = chunk.match(/<!--\s*PAGE:(\d+)\s*-->\n([\s\S]*)/)
    if (match) acc[parseInt(match[1])] = match[2].trim()
    return acc
  }, {})
}

export default function PdfConverter() {
  const [status, setStatus] = useState('idle')
  const [pages, setPages] = useState([])
  const [errorMsg, setErrorMsg] = useState('')
  const inputRef = useRef(null)
  const [editorResult, setEditorResult] = useRecoilState(pdfResultState)
  const isInternalUpdate = useRef(false)
  const [lightboxImg, setLightboxImg] = useState(null)

  // pages → editorResultState 동기화
  useEffect(() => {
    const combined = combinePages(pages)
    if (combined) {
      isInternalUpdate.current = true
      setEditorResult(combined)
    }
  }, [pages])

  // AI가 editorResultState 수정 → pages에 반영
  useEffect(() => {
    if (isInternalUpdate.current) {
      isInternalUpdate.current = false
      return
    }
    if (!editorResult || pages.length === 0) return

    const pageMap = splitToPages(editorResult)
    if (Object.keys(pageMap).length === 0) return

    setPages(prev => prev.map(p => ({
      ...p,
      markup: pageMap[p.page] ?? p.markup,
    })))
  }, [editorResult])

  async function handleFile(file) {
    if (!file || file.type !== 'application/pdf') return
    setStatus('loading')
    setPages([])
    setErrorMsg('')

    try {
      const images = await pdfToImages(file)
      setPages(images.map(img => ({ ...img, markup: '', loading: false })))
      setStatus('done')
    } catch (err) {
      setErrorMsg(err.message)
      setStatus('error')
    }
  }

  async function convertPage(pageNum) {
    setPages(prev => prev.map(p => p.page === pageNum ? { ...p, loading: true } : p))

    try {
      const target = pages.find(p => p.page === pageNum)
      const markup = await convertPageToMarkup(target.base64)
      setPages(prev => prev.map(p => p.page === pageNum ? { ...p, markup, loading: false } : p))
    } catch (err) {
      setPages(prev => prev.map(p => p.page === pageNum ? { ...p, markup: `오류: ${err.message}`, loading: false } : p))
    }
  }

  async function convertAll() {
    for (const p of pages) {
      await convertPage(p.page)
    }
  }

  return (
    <div className="converter">
      {lightboxImg && (
        <div className="lightbox" onClick={() => setLightboxImg(null)}>
          <img src={lightboxImg} alt="확대 보기" />
        </div>
      )}
      <div
        className="drop-zone"
        onClick={() => inputRef.current.click()}
        onDrop={(e) => { e.preventDefault(); handleFile(e.dataTransfer.files[0]) }}
        onDragOver={(e) => e.preventDefault()}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".pdf"
          style={{ display: 'none' }}
          onChange={(e) => handleFile(e.target.files[0])}
        />
        {status === 'loading'
          ? <p>PDF 렌더링 중...</p>
          : <p>PDF 파일을 드래그하거나 클릭해서 업로드</p>
        }
      </div>

      {status === 'error' && <div className="error-box">{errorMsg}</div>}

      {status === 'done' && pages.length > 0 && (
        <div className="pdf-result">
          <div className="pdf-actions">
            <span>{pages.length}페이지</span>
            <button className="convert-btn" onClick={convertAll}>전체 변환</button>
          </div>

          {pages.map(({ page, base64, markup, loading }) => (
            <div key={page} className="pdf-page">
              <div className="pdf-page-header">
                <span>{page}페이지</span>
                <button className="ocr-btn" onClick={() => convertPage(page)} disabled={loading}>
                  {loading ? '변환 중...' : 'HTML 변환'}
                </button>
              </div>

              <div className="pdf-page-body">
                <img
                  src={`data:image/jpeg;base64,${base64}`}
                  alt={`${page}페이지`}
                  className="pdf-thumb"
                  onClick={() => setLightboxImg(`data:image/jpeg;base64,${base64}`)}
                />
                {markup && (
                  <div className="pdf-markup">
                    <div className="result-header">
                      <span>마크업</span>
                      <button onClick={() => navigator.clipboard.writeText(markup)}>복사</button>
                    </div>
                    <pre className="result-code">{markup}</pre>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
