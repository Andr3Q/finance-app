import { useState, useEffect } from 'react'
import { getInstallPrompt, clearInstallPrompt, isInstalled } from '../services/installPrompt.js'

const DISMISS_KEY  = 'install-banner-dismissed'
const DISMISS_DAYS = 7

export default function InstallBanner() {
  const [visible,  setVisible]  = useState(false)
  const [hiding,   setHiding]   = useState(false)
  const [mode,     setMode]     = useState('install') // 'install' | 'installing' | 'fallback'
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    setIsMobile(window.innerWidth <= 768)

    // Já instalado → nunca mostrar
    if (isInstalled()) return

    // Fechado recentemente → aguardar
    const dismissed = localStorage.getItem(DISMISS_KEY)
    if (dismissed && (Date.now() - Number(dismissed)) / 86400000 < DISMISS_DAYS) return

    // Mostrar imediatamente — não depende do beforeinstallprompt
    setVisible(true)

    window.addEventListener('appinstalled', () => animateHide())
  }, [])

  const animateHide = () => {
    setHiding(true)
    setTimeout(() => { setVisible(false); setHiding(false); setMode('install') }, 300)
  }

  const handleClose = () => {
    localStorage.setItem(DISMISS_KEY, String(Date.now()))
    animateHide()
  }

  const handleInstall = async () => {
    const prompt = getInstallPrompt()
    if (!prompt) { setMode('fallback'); return }
    setMode('installing')
    try {
      prompt.prompt()
      const { outcome } = await prompt.userChoice
      clearInstallPrompt()
      if (outcome === 'accepted') {
        animateHide()
      } else {
        setMode('fallback')
      }
    } catch {
      setMode('fallback')
    }
  }

  if (!visible) return null

  const posDesktop = { position: 'fixed', bottom: 24, right: 24, width: 300, zIndex: 210 }
  const posMobile  = {
    position: 'fixed',
    bottom: 'calc(88px + env(safe-area-inset-bottom, 0px))',
    left: '50%', transform: 'translateX(-50%)',
    width: 'calc(100% - 32px)', maxWidth: 400, zIndex: 210,
  }

  const anim = { animation: `${hiding ? 'bannerOut .28s' : 'bannerIn .32s cubic-bezier(.34,1.56,.64,1)'} forwards` }

  return (
    <div style={isMobile ? posMobile : posDesktop}>
      <div style={anim}>
        {isMobile
          ? <MobileBanner mode={mode} onInstall={handleInstall} onClose={handleClose} />
          : <DesktopBanner mode={mode} onInstall={handleInstall} onClose={handleClose} />
        }
      </div>
    </div>
  )
}

function MobileBanner({ mode, onInstall, onClose }) {
  return (
    <div style={{
      background: 'linear-gradient(135deg, rgba(0,255,204,.1) 0%, rgba(0,180,216,.05) 100%)',
      border: '1px solid rgba(0,255,204,.25)', borderRadius: 20,
      padding: '14px 16px', backdropFilter: 'blur(20px)',
      boxShadow: '0 8px 32px rgba(0,0,0,.4)',
    }}>
      {mode === 'fallback' ? (
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ fontSize: 22, flexShrink: 0, marginTop: 2 }}>📲</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--t1)', fontFamily: 'var(--fd)', marginBottom: 4 }}>
              Como instalar manualmente
            </div>
            <div style={{ fontSize: 12, color: 'var(--t2)', lineHeight: 1.5 }}>
              Toque no menu <strong style={{ color: 'var(--t1)' }}>⋮</strong> do Chrome → <strong style={{ color: 'var(--c)' }}>"Instalar app"</strong>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--t3)', cursor: 'pointer', padding: 4, flexShrink: 0 }} aria-label="Fechar">
            <XIcon />
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <img src="/icon-192.png" alt="" style={{ width: 44, height: 44, borderRadius: 12, flexShrink: 0, boxShadow: '0 2px 8px rgba(0,0,0,.3)' }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--t1)', fontFamily: 'var(--fd)', marginBottom: 2 }}>
              Instalar FinançasPro
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--t2)' }}>Acesso rápido na tela inicial</div>
          </div>
          <button
            onClick={onInstall}
            disabled={mode === 'installing'}
            style={{
              flexShrink: 0,
              background: mode === 'installing' ? 'rgba(0,255,204,.3)' : 'linear-gradient(135deg, var(--c), #00a89a)',
              color: '#021a14', border: 'none', borderRadius: 12,
              padding: '8px 14px', fontSize: 12, fontWeight: 800,
              fontFamily: 'var(--fd)', cursor: mode === 'installing' ? 'default' : 'pointer',
              WebkitTapHighlightColor: 'transparent', transition: 'transform .1s',
              display: 'flex', alignItems: 'center', gap: 6,
            }}
            onTouchStart={e => { if (mode !== 'installing') e.currentTarget.style.transform = 'scale(.93)' }}
            onTouchEnd={e => e.currentTarget.style.transform = 'scale(1)'}
          >
            {mode === 'installing'
              ? <><span style={{ width: 10, height: 10, border: '2px solid #021a14', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin .7s linear infinite', display: 'inline-block' }} /> Aguarde</>
              : 'Instalar'
            }
          </button>
          <button onClick={onClose} style={{ flexShrink: 0, background: 'none', border: 'none', color: 'var(--t3)', cursor: 'pointer', padding: 4, WebkitTapHighlightColor: 'transparent' }} aria-label="Fechar">
            <XIcon />
          </button>
        </div>
      )}
    </div>
  )
}

function DesktopBanner({ mode, onInstall, onClose }) {
  return (
    <div style={{
      background: 'rgba(3,18,22,.96)', border: '1px solid rgba(0,255,204,.22)',
      borderRadius: 16, padding: '14px 16px', backdropFilter: 'blur(20px)',
      boxShadow: '0 8px 32px rgba(0,0,0,.5)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: mode === 'fallback' ? 0 : 12 }}>
        {mode === 'fallback'
          ? <span style={{ fontSize: 20 }}>📲</span>
          : <img src="/icon-192.png" alt="" style={{ width: 36, height: 36, borderRadius: 9, flexShrink: 0 }} />
        }
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--t1)', fontFamily: 'var(--fd)' }}>
            {mode === 'fallback' ? 'Como instalar' : 'Instalar FinançasPro'}
          </div>
          <div style={{ fontSize: 11, color: mode === 'fallback' ? 'var(--t1)' : 'var(--t2)', marginTop: 2, lineHeight: 1.5 }}>
            {mode === 'fallback'
              ? <>Menu <strong>⋮</strong> do Chrome → <strong style={{ color: 'var(--c)' }}>"Instalar app"</strong></>
              : 'Acesso rápido na tela inicial'
            }
          </div>
        </div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--t3)', cursor: 'pointer', padding: 2, flexShrink: 0 }} aria-label="Fechar">
          <XIcon size={14} />
        </button>
      </div>
      {mode !== 'fallback' && (
        <button
          onClick={onInstall}
          disabled={mode === 'installing'}
          style={{
            width: '100%',
            background: mode === 'installing' ? 'rgba(0,255,204,.3)' : 'linear-gradient(135deg, var(--c), #00a89a)',
            color: '#021a14', border: 'none', borderRadius: 10,
            padding: '9px 0', fontSize: 13, fontWeight: 800,
            fontFamily: 'var(--fd)', cursor: mode === 'installing' ? 'default' : 'pointer',
            transition: 'transform .1s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
          }}
          onMouseDown={e => { if (mode !== 'installing') e.currentTarget.style.transform = 'scale(.97)' }}
          onMouseUp={e => e.currentTarget.style.transform = 'scale(1)'}
        >
          {mode === 'installing'
            ? <><span style={{ width: 10, height: 10, border: '2px solid #021a14', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin .7s linear infinite', display: 'inline-block' }} /> Aguarde...</>
            : '⚡ Instalar app'
          }
        </button>
      )}
    </div>
  )
}

function XIcon({ size = 16 }) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" width={size} height={size}>
      <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd"/>
    </svg>
  )
}
