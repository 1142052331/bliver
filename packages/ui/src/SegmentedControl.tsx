export interface SegmentOption {
  readonly value: string;
  readonly label: string;
  readonly disabled?: boolean;
}

export interface SegmentedControlProps {
  readonly label: string;
  readonly value: string;
  readonly options: readonly SegmentOption[];
  readonly onChange: (value: string) => void;
  readonly disabled?: boolean;
  readonly className?: string;
}

export function SegmentedControl({
  label,
  value,
  options,
  onChange,
  disabled = false,
  className,
}: SegmentedControlProps) {
  const classes = ['bliver-segmented', className].filter(Boolean).join(' ');

  return (
    <div className={classes} role="group" aria-label={label}>
      {options.map((option) => {
        const selected = option.value === value;

        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={selected}
            disabled={disabled || option.disabled}
            onClick={() => {
              if (!selected) onChange(option.value);
            }}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
