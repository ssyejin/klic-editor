import { NavLink } from 'react-router-dom'

export default function Nav() {
  return (
    <nav className="nav">
      <div className="nav-logo">Klic Editor</div>
      <ul className="nav-menu">
        <li><NavLink to="/" end>표 변환기</NavLink></li>
        <li><NavLink to="/markup">마크업 가져오기</NavLink></li>
        <li><NavLink to="/pdf">PDF 변환기</NavLink></li>
        <li><NavLink to="/templates">서브콘텐츠 템플릿</NavLink></li>
        <li><NavLink to="/batch">일괄 작업</NavLink></li>
      </ul>
    </nav>
  )
}
