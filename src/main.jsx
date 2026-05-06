import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RecoilRoot } from 'recoil'
import './index.css'
import './con_com.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <RecoilRoot>
      <App />
    </RecoilRoot>
  </StrictMode>,
)
