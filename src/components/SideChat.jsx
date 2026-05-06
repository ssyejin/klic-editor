import { useState, useRef, useEffect } from 'react'
import { useRecoilState } from 'recoil'
import { useLocation } from 'react-router-dom'
import { sendMessage, isHtmlResponse } from '../services/chatApi'
import { editorResultState, pdfResultState, markupResultState } from '../store/atoms'

export default function SideChat() {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [toast, setToast] = useState('')
  const location = useLocation()
  const [editorHtml, setEditorHtml] = useRecoilState(editorResultState)
  const [pdfHtml, setPdfHtml] = useRecoilState(pdfResultState)
  const [markupHtml, setMarkupHtml] = useRecoilState(markupResultState)

  const { currentHtml, setCurrentHtml } = {
    '/pdf':    { currentHtml: pdfHtml,    setCurrentHtml: setPdfHtml },
    '/markup': { currentHtml: markupHtml, setCurrentHtml: setMarkupHtml },
  }[location.pathname] ?? { currentHtml: editorHtml, setCurrentHtml: setEditorHtml }
  const bottomRef = useRef(null)
  const toastTimer = useRef(null)

  function showToast(msg) {
    setToast(msg)
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(''), 3000)
  }

  async function handleSend() {
    const text = input.trim()
    if (!text || loading) return

    const userMsg = { role: 'user', content: text }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setLoading(true)

    try {
      const reply = await sendMessage([...messages, userMsg], currentHtml)

      if (isHtmlResponse(reply)) {
        setCurrentHtml(reply)
        showToast('변환 결과를 수정했어요.')
      } else {
        showToast(reply)
      }
    } catch (err) {
      showToast(`오류: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="chat-bar">
      {toast && <div className="chat-toast">{toast}</div>}
      <div className="chat-input-row">
        <textarea
          className="chat-input"
          placeholder="예: td는 왼쪽 정렬해줘"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              handleSend()
            }
          }}
          rows={2}
        />
        <button className="chat-send" onClick={handleSend} disabled={loading}>
          {loading ? '...' : '전송'}
        </button>
      </div>
    </div>
  )
}
