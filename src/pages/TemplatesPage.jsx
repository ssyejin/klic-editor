import { useState, useEffect } from 'react'
import greeting from '../templates/greeting'
import history from '../templates/history'
import principal from '../templates/principal'
import symbol from '../templates/symbol'

const TEMPLATES = [...greeting, ...history, ...principal, ...symbol]

function stripScripts(html) {
  return html.replace(/<script[\s\S]*?<\/script>/gi, '').trim()
}

function hasScript(html) {
  return /<script/i.test(html)
}

const CATEGORIES = [...new Set(TEMPLATES.map(t => t.category))]

export default function TemplatesPage() {
  const [activeCategory, setActiveCategory] = useState(CATEGORIES[0])
  const [activeTab, setActiveTab] = useState(TEMPLATES[0])
  const [copied, setCopied] = useState(false)
  const [showPreview, setShowPreview] = useState(true)
  const [colors, setColors] = useState({ primary: '#6600BF' })

  const tabsInCategory = TEMPLATES.filter(t => t.category === activeCategory)

  function handleCategorySelect(cat) {
    setActiveCategory(cat)
    setActiveTab(TEMPLATES.find(t => t.category === cat))
    setCopied(false)
    setShowPreview(true)
  }

  function handleTabSelect(tpl) {
    setActiveTab(tpl)
    setCopied(false)
    setShowPreview(true)
  }

  useEffect(() => {
    if (!showPreview) return

    // Swiper
    let swiper
    const swiperEl = document.querySelector('.priHisSwiper')
    if (swiperEl && window.Swiper) {
      swiper = new window.Swiper('.priHisSwiper', {
        slidesPerView: 'auto',
        centeredSlides: true,
        navigation: { nextEl: '.btn-next', prevEl: '.btn-prev' },
      })
    }

    // 약력보기 팝업
    const popup = document.getElementById('preHisPopup')
    if (popup) {
      const openPopup = (e) => {
        e.preventDefault()
        popup.style.display = 'flex'
        popup.setAttribute('aria-hidden', 'false')
      }
      const closePopup = () => {
        popup.style.display = 'none'
        popup.setAttribute('aria-hidden', 'true')
      }
      const onBgClick = (e) => { if (e.target === popup) closePopup() }

      const btnViews = document.querySelectorAll('.btn-view')
      const btnClose = popup.querySelector('.btn-close')

      btnViews.forEach(btn => btn.addEventListener('click', openPopup))
      btnClose?.addEventListener('click', closePopup)
      popup.addEventListener('click', onBgClick)

      return () => {
        btnViews.forEach(btn => btn.removeEventListener('click', openPopup))
        btnClose?.removeEventListener('click', closePopup)
        popup.removeEventListener('click', onBgClick)
        swiper?.destroy(true, true)
      }
    }

    return () => swiper?.destroy(true, true)
  }, [activeTab, showPreview])

  function handleCopy(code) {
    navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="page">
      <h2>서브콘텐츠 템플릿</h2>
      <p className="section-desc">서브콘텐츠를 빠르게 복사해 사용하세요.</p>

      <div className="tpl-panel">
        {/* 왼쪽 카테고리 목록 */}
        <nav className="tpl-nav">
          {CATEGORIES.map(cat => (
            <button
              key={cat}
              className={`tpl-nav-item ${activeCategory === cat ? 'active' : ''}`}
              onClick={() => handleCategorySelect(cat)}
            >
              <span className="tpl-nav-label">{cat}</span>
            </button>
          ))}
        </nav>

        {/* 오른쪽 */}
        <div className="tpl-content">
          {/* 타입 탭 */}
          <div className="tpl-tabs">
            {tabsInCategory.map(tpl => (
              <button
                key={tpl.id}
                className={`tpl-tab ${activeTab?.id === tpl.id ? 'active' : ''}`}
                onClick={() => handleTabSelect(tpl)}
              >
                {tpl.label}
              </button>
            ))}
            <div className="tpl-btn-group">
              <button
                className={showPreview ? 'active' : ''}
                onClick={() => setShowPreview(v => !v)}
              >
                {showPreview ? '코드 보기' : '미리보기'}
              </button>
              <button onClick={() => handleCopy(activeTab.code)}>
                {copied ? '복사됨' : '복사'}
              </button>
            </div>
          </div>

          {/* 미리보기 / 코드 */}
          {showPreview ? (
            <div className="tpl-preview">
              <div className="tpl-color-bar">
                <label>
                  주색
                  <input type="color" value={colors.primary} onChange={e => setColors(v => ({ ...v, primary: e.target.value }))} />
                  <span>{colors.primary}</span>
                </label>
                <button onClick={() => setColors({ primary: '#6600BF' })}>초기화</button>
              </div>
              {hasScript(activeTab.code) && (
                <p className="tpl-preview-notice">※ script(GSAP 애니메이션)는 미리보기에서 동작하지 않습니다.</p>
              )}
              <div
                className="markup-preview"
                style={{ '--color-primary': colors.primary }}
                dangerouslySetInnerHTML={{ __html: stripScripts(activeTab.code) }}
              />
            </div>
          ) : (
            <pre className="result-code">{stripScripts(activeTab.code)}</pre>
          )}
        </div>
      </div>
    </div>
  )
}
