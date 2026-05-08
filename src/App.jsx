import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Nav from './components/Nav'
import SideChat from './components/SideChat'
import TableConverter from './pages/TableConverter'
import MarkupFetcherPage from './pages/MarkupFetcherPage'
import PdfConverter from './pages/PdfConverter'
import TemplatesPage from './pages/TemplatesPage'
import BatchPage from './pages/BatchPage'
import './App.css'

function App() {
  return (
    <BrowserRouter>
      <Nav />
      <main className="main">
        <Routes>
          <Route path="/" element={<TableConverter />} />
          <Route path="/markup" element={<MarkupFetcherPage />} />
          <Route path="/pdf" element={<PdfConverter />} />
          <Route path="/templates" element={<TemplatesPage />} />
          <Route path="/batch" element={<BatchPage />} />
        </Routes>
      </main>
      <SideChat />
    </BrowserRouter>
  )
}

export default App
