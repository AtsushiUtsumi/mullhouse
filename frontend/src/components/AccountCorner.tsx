import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { clearAccount, loadAccount } from '../api'

const POKER_TABLE_PATH = /^\/poker\/(?!api-docs$)[^/]+$/

export function AccountCorner() {
  const location = useLocation()
  const [account, setAccount] = useState(loadAccount())
  const [menuOpen, setMenuOpen] = useState(false)
  const cornerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setAccount(loadAccount())
    setMenuOpen(false)
  }, [location.pathname])

  useEffect(() => {
    if (!menuOpen) return
    const onClickOutside = (e: MouseEvent) => {
      if (cornerRef.current && !cornerRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [menuOpen])

  if (POKER_TABLE_PATH.test(location.pathname)) return null

  const handleLogout = () => {
    clearAccount()
    setAccount(null)
    setMenuOpen(false)
  }

  return (
    <div className="account-corner" ref={cornerRef}>
      {account ? (
        <div className="account-menu">
          <button type="button" className="account-corner-name" onClick={() => setMenuOpen((v) => !v)}>
            {account.username}
          </button>
          {menuOpen && (
            <div className="account-menu-dropdown">
              <Link to="/settings" className="account-menu-item" onClick={() => setMenuOpen(false)}>
                設定
              </Link>
              <button type="button" className="account-menu-item" onClick={handleLogout}>
                ログアウト
              </button>
            </div>
          )}
        </div>
      ) : (
        <Link to="/login" className="btn">ログイン</Link>
      )}
    </div>
  )
}
