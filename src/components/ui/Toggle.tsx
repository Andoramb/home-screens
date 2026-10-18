'use client';

interface ToggleProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}

export default function Toggle({ label, checked, onChange, disabled = false }: ToggleProps) {
  return (
    <label
      className={`flex items-center justify-between gap-2 ${
        disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'
      }`}
    >
      <span className="text-xs text-hs-text-muted">{label}</span>
      <Switch checked={checked} onChange={onChange} disabled={disabled} />
    </label>
  );
}

interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  /** The accessible name, for a switch whose label is not the wrapping element. */
  ariaLabel?: string;
}

/** The switch on its own, for a row that lays out its own label (a sortable list row). */
export function Switch({ checked, onChange, disabled = false, ariaLabel }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative shrink-0 w-9 h-5 rounded-full transition-colors ${
        checked ? 'bg-hs-accent' : 'bg-hs-border-strong'
      } ${disabled ? 'cursor-not-allowed' : ''}`}
    >
      <span
        className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
          checked ? 'translate-x-4' : ''
        }`}
      />
    </button>
  );
}
