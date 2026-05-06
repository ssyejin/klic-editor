import FileConverter from '../components/FileConverter'

export default function TableConverter() {
  return (
    <div className="page">
      <h2>표 변환기</h2>
      <p className="section-desc">한글 문서에서 표를 복사해서 붙여넣으면 HTML로 변환해줍니다.</p>
      <FileConverter />
    </div>
  )
}
