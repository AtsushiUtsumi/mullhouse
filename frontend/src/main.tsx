import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Home } from './pages/Home'
import { RangeApp } from './pages/RangeApp'
import { PokerLobby } from './pages/PokerLobby'
import { PokerTable } from './pages/PokerTable'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/range" element={<RangeApp />} />
        <Route path="/poker" element={<PokerLobby />} />
        <Route path="/poker/:tableId" element={<PokerTable />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)
