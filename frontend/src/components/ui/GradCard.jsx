const PARTICLES = [
  { left:  4, size: 3, delay: 0,   dur: 2.8 },
  { left: 16, size: 4, delay: 1.1, dur: 3.3 },
  { left: 30, size: 3, delay: 0.5, dur: 2.5 },
  { left: 46, size: 5, delay: 1.7, dur: 3.6 },
  { left: 60, size: 3, delay: 0.3, dur: 2.9 },
  { left: 74, size: 4, delay: 1.3, dur: 3.1 },
  { left: 86, size: 3, delay: 0.8, dur: 2.6 },
  { left: 95, size: 4, delay: 2.0, dur: 3.4 },
]

export default function GradCard({ icon, iconBg, iconBorder, title, sub, badge, right, children }) {
  return (
    <div className="cfg-card">
      <div className="gc-head">
        <div className="gc-glow" />
        <div className="gc-particles" aria-hidden="true">
          {PARTICLES.map((p, i) => (
            <span key={i} className="gc-particle" style={{
              left: `${p.left}%`, width: p.size, height: p.size,
              animationDelay: `${p.delay}s`, animationDuration: `${p.dur}s`,
            }} />
          ))}
        </div>
        <div className="cfg-ch-ico gc-ico" style={{ background: iconBg, border: `1px solid ${iconBorder}` }}>
          {icon}
        </div>
        <div style={{ flex: 1, minWidth: 0, position: 'relative', zIndex: 1 }}>
          <div className="cfg-ch-title">{title}{badge}</div>
          <div className="cfg-ch-sub">{sub}</div>
        </div>
        {right && <div style={{ flexShrink: 0, position: 'relative', zIndex: 1 }}>{right}</div>}
      </div>
      <div className="cfg-card-body">
        {children}
      </div>
    </div>
  )
}
