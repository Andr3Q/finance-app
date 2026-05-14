import { useState } from 'react'
import { isInstalled, getInstallPrompt, clearInstallPrompt } from '../../services/installPrompt.js'

function CfgInstallStep({ n, text }) {
  return (
    <div className="cfg-install-step">
      <div className="cfg-step-n">{n}</div>
      <div className="cfg-step-text">{text}</div>
    </div>
  )
}

export default function InstallCard() {
  const [appInstalled, setAppInstalled] = useState(() => isInstalled())
  const [installMode,  setInstallMode]  = useState('idle')
  const [platform] = useState(() => {
    const ua = navigator.userAgent
    return { isIOS: /iPhone|iPad|iPod/.test(ua) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(ua)) }
  })

  const handleInstall = async () => {
    const prompt = getInstallPrompt()
    if (!prompt) { setInstallMode('fallback'); return }
    setInstallMode('installing')
    try {
      prompt.prompt()
      const { outcome } = await prompt.userChoice
      clearInstallPrompt()
      if (outcome === 'accepted') { setAppInstalled(true); setInstallMode('idle') }
      else { setInstallMode('fallback') }
    } catch { setInstallMode('fallback') }
  }

  if (appInstalled) return null

  return (
    <div className="cfg-card cfg-install-card r11">
      <div className="cfg-card-head">
        <img src="/icon-192.png" alt="" className="cfg-app-ico" />
        <div>
          <div className="cfg-ch-title">Instalar Finance</div>
          <div className="cfg-ch-sub">Acesse com um toque, sem abrir o navegador</div>
        </div>
      </div>
      <div className="cfg-card-body">
        {platform.isIOS ? (
          <div className="cfg-install-steps">
            <CfgInstallStep n="1" text={<>Toque no botão <strong style={{ color: 'var(--c)' }}>Compartilhar</strong> na barra do Safari</>} />
            <CfgInstallStep n="2" text={<>Role e toque em <strong style={{ color: 'var(--c)' }}>"Adicionar à Tela de Início"</strong></>} />
            <CfgInstallStep n="3" text={<>Toque em <strong style={{ color: 'var(--c)' }}>"Adicionar"</strong> no canto superior direito</>} />
          </div>
        ) : installMode === 'fallback' ? (
          <div className="cfg-install-steps">
            <CfgInstallStep n="1" text={<>Toque no menu <strong style={{ color: 'var(--c)' }}>⋮</strong> no canto superior direito do Chrome</>} />
            <CfgInstallStep n="2" text={<>Toque em <strong style={{ color: 'var(--c)' }}>"Instalar app"</strong> ou <strong style={{ color: 'var(--c)' }}>"Adicionar à tela inicial"</strong></>} />
          </div>
        ) : (
          <button className="cfg-btn-primary" style={{ width: '100%', justifyContent: 'center' }}
            onClick={handleInstall} disabled={installMode === 'installing'}>
            {installMode === 'installing' ? 'Instalando…' : '⚡ Instalar agora'}
          </button>
        )}
      </div>
    </div>
  )
}
