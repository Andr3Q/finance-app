// Campo das telas de acesso no desktop (design "Nancy Desktop"): rótulo, campo de 50px e, se houver, o erro colado nele.
export default function AuthFieldDesktop({ id, name, label, error, ...inputProps }) {
  return (
    <div className="ad-field">
      <label className="ad-label" htmlFor={id}>{label}</label>
      <input
        id={id} name={name}
        className={`ad-input${error ? ' err' : ''}`}
        aria-invalid={error ? 'true' : undefined}
        {...inputProps}
      />
      {error && <span className="ad-error">{error}</span>}
    </div>
  )
}
