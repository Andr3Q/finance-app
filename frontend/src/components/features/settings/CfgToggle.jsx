export default function CfgToggle({ on, disabled, onChange }) {
  return (
    <button
      type="button"
      className={`cfg-toggle${on ? ' on' : ''}`}
      onClick={onChange}
      disabled={disabled}
      aria-label="Toggle"
    >
      <span className="cfg-toggle-thumb" />
    </button>
  )
}
