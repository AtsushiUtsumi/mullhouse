import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Home } from './pages/Home'
import { RangeApp } from './pages/RangeApp'
import { PokerLobby } from './pages/PokerLobby'
import { PokerTable } from './pages/PokerTable'
import { PokerApiDocs } from './pages/PokerApiDocs'
import { CreateAccount } from './pages/CreateAccount'
import { Login } from './pages/Login'
import { Settings } from './pages/Settings'
import { HandRangeEditor } from './pages/HandRangeEditor'
import { AccountCorner } from './components/AccountCorner'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AccountCorner />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/range" element={<RangeApp />} />
        <Route path="/poker" element={<PokerLobby />} />
        <Route path="/poker/api-docs" element={<PokerApiDocs />} />
        <Route path="/poker/:tableId" element={<PokerTable />} />
        <Route path="/create-account" element={<CreateAccount />} />
        <Route path="/login" element={<Login />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/hand-range-editor" element={<HandRangeEditor />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)
