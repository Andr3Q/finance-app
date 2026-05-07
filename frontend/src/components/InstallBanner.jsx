import { useState, useEffect } from 'react'

const DISMISS_KEY = 'install-banner-dismissed'
const DISMISS_DAYS = 7

export default function InstallBanner() {
  const [prompt,  setPrompt]  = useState(null)
  const [visible, setVisible] = useState(false)
  const [hiding,  setHiding]  = useState(false)
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    setIsMobile(window.innerWidth <= 768)

    if (window.matchMedia('(display-mode: standalone)').matches || navigator.standalone) return

    const dismissed = localStorage.getItem(DISMISS_KEY)
    if (dismissed) {
      const daysAgo = (Date.now() - Number(dismissed)) / 86400000
      if (daysAgo < DISMISS_DAYS) return
    }

    const handler = (e) => {
      e.preventDefault()
      setPrompt(e)
      setVisible(true)
    }
    const onInstalled = () => animateHide()

    window.addEventListener('beforeinstallprompt', handler)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', handler)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  const animateHide = () => {
    setHiding(true)
    setTimeout(() => { setVisible(false); setHiding(false) }, 300)
  }

  const handleDismiss = () => {
    localStorage.setItem(DISMISS_KEY, String(Date.now()))
    animateHide()
  }

  const handleInstall = async () => {
    if (!prompt) return
    prompt.prompt()
    const { outcome } = await prompt.userChoice
    setPrompt(null)
    if (outcome === 'accepted') animateHide()
    else handleDismiss()
  }

  if (!visible) return null

  // ── Desktop: canto inferior direito, compacto ──────────
  if (!isMobile) {
    return (
      <div style={{
        position: 'fixed',
        bottom: 24, right: 24,
        width: 300,
        zIndex: 210,
      }}>
        <div style={{
          animation: `${hiding ? 'bannerOut .28s' : 'bannerIn .32s cubic-bezier(.34,1.56,.64,1)'} forwards`,
        }}>
          <div style={{
            background: 'rgba(3,18,22,.96)',
            border: '1px solid rgba(0,255,204,.22)',
            borderRadius: 16,
            padding: '14px 16px',
            backdropFilter: 'blur(20px)',
            boxShadow: '0 8px 32px rgba(0,0,0,.5), 0 0 0 1px rgba(0,255,204,.06)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <img src="/icon-192.png" alt="" style={{ width: 36, height: 36, borderRadius: 9, flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--t1)', fontFamily: 'var(--fd)' }}>
                  Instalar FinançasPro
                </div>
                <div style={{ fontSize: 11, color: 'var(--t2)', marginTop: 1 }}>
                  Acesso rápido na tela inicial
                </div>
              </div>
              <button onClick={handleDismiss} style={{ background: 'none', border: 'none', color: 'var(--t3)', cursor: 'pointer', padding: 2, flexShrink: 0 }} aria-label="Fechar">
                <svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14">
                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd"/>
                </svg>
              </button>
            </div>
            <button
              onClick={handleInstall}
              style={{
                width: '100%', background: 'linear-gradient(135deg, var(--c), #00a89a)',
                color: '#021a14', border: 'none', borderRadius: 10,
                padding: '9px 0', fontSize: 13, fontWeight: 800,
                fontFamily: 'var(--fd)', cursor: 'pointer',
                boxShadow: '0 4px 12px rgba(0,255,204,.25)',
                transition: 'transform .1s',
              }}
              onMouseDown={e => e.currentTarget.style.transform = 'scale(.97)'}
              onMouseUp={e => e.currentTarget.style.transform = 'scale(1)'}
            >
              ⚡ Instalar app
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── Mobile: acima da pill nav ──────────────────────────
  return (
    <div style={{
      position: 'fixed',
      bottom: 'calc(88px + env(safe-area-inset-bottom, 0px))',
      left: '50%', transform: 'translateX(-50%)',
      width: 'calc(100% - 32px)', maxWidth: 400,
      zIndex: 210,
    }}>
      <div style={{
        animation: `${hiding ? 'bannerOut .28s' : 'bannerIn .32s cubic-bezier(.34,1.56,.64,1)'} forwards`,
      }}>
        <div style={{
          background: 'linear-gradient(135deg, rgba(0,255,204,.1) 0%, rgba(0,180,216,.05) 100%)',
          border: '1px solid rgba(0,255,204,.25)',
          borderRadius: 20,
          padding: '14px 16px',
          backdropFilter: 'blur(20px)',
          boxShadow: '0 8px 32px rgba(0,0,0,.4), 0 0 0 1px rgba(0,255,204,.08)',
          display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <img src="/icon-192.png" alt="" style={{ width: 44, height: 44, borderRadius: 12, flexShrink: 0, boxShadow: '0 2px 8px rgba(0,0,0,.3)' }} />

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--t1)', fontFamily: 'var(--fd)', marginBottom: 2 }}>
              Instalar FinançasPro
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--t2)' }}>
              Acesso rápido direto na tela inicial
            </div>
          </div>

          <button
            onClick={handleInstall}
            style={{
              flexShrink: 0,
              background: 'linear-gradient(135deg, var(--c), #00a89a)',
              color: '#021a14', border: 'none', borderRadius: 12,
              padding: '8px 14px', fontSize: 12, fontWeight: 800,
              fontFamily: 'var(--fd)', cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(0,255,204,.3)',
              WebkitTapHighlightColor: 'transparent',
              transition: 'transform .1s',
            }}
            onMouseDown={e => e.currentTarget.style.transform = 'scale(.93)'}
            onMouseUp={e => e.currentTarget.style.transform = 'scale(1)'}
            onTouchStart={e => e.currentTarget.style.transform = 'scale(.93)'}
            onTouchEnd={e => e.currentTarget.style.transform = 'scale(1)'}
          >
            Instalar
          </button>

          <button
            onClick={handleDismiss}
            style={{ flexShrink: 0, background: 'none', border: 'none', color: 'var(--t3)', cursor: 'pointer', padding: 4, WebkitTapHighlightColor: 'transparent' }}
            aria-label="Fechar"
          >
            <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd"/>
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}
