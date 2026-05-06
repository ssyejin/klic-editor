import MarkupFetcher from '../components/MarkupFetcher'

export default function MarkupFetcherPage() {
  return (
    <div className="page">
      <h2>마크업 가져오기</h2>
      <p className="section-desc">URL을 입력하면 해당 페이지의 마크업 구조를 가져옵니다.</p>
      <MarkupFetcher />
    </div>
  )
}
