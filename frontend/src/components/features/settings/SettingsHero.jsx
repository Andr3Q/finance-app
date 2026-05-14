export default function SettingsHero({ user, isPro }) {
  const initials = user.name
    ? user.name.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase()
    : '?'

  return (
    <div className="cfg-hero r1">
      <div className="cfg-hero-glow-bg" />
      <div className="cfg-hero-particles" aria-hidden="true">
        {[
          { left:  4, size: 3, delay: 0,   dur: 2.8 },
          { left: 13, size: 4, delay: 0.9, dur: 3.2 },
          { left: 25, size: 3, delay: 1.5, dur: 2.5 },
          { left: 38, size: 5, delay: 0.4, dur: 3.5 },
          { left: 52, size: 3, delay: 1.1, dur: 2.9 },
          { left: 65, size: 4, delay: 0.7, dur: 3.1 },
          { left: 78, size: 3, delay: 1.8, dur: 2.6 },
          { left: 89, size: 4, delay: 0.3, dur: 3.3 },
          { left: 96, size: 3, delay: 1.3, dur: 2.7 },
        ].map((p, i) => (
          <span key={i} className="cfg-hero-particle" style={{
            left: `${p.left}%`, width: p.size, height: p.size,
            animationDelay: `${p.delay}s`, animationDuration: `${p.dur}s`,
          }} />
        ))}
      </div>
      <div className="cfg-av">
        {initials}
        <div className="cfg-av-glow" />
      </div>
      <div className="cfg-hero-info">
        <div className="cfg-hero-name">{user.name || 'Usuário'}</div>
        <div className="cfg-hero-email">{user.email}</div>
        <div className="cfg-hero-badges">
          <span className={`cfg-badge ${isPro ? 'pro' : 'free'}`}>{isPro ? 'Pro ✨' : 'Grátis'}</span>
        </div>
      </div>
    </div>
  )
}
