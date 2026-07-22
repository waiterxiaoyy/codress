import { useEffect, useRef, useState, type ReactNode } from "react";

export interface SelectOption {
  value: string;
  label: string;
  description?: string;
}

/**
 * Codress 通用下拉框。
 *
 * 状态、间距与交互契约见 docs/contracts/ui-components.md。商店筛选和普通表单
 * 都应复用本组件，避免原生 select / datalist 在 Electron 中表现不一致。
 */
export function UnifiedSelect({
  value,
  options,
  onChange,
  placeholder = "请选择",
  ariaLabel = "选择选项",
  disabled = false,
  icon,
}: {
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  ariaLabel?: string;
  disabled?: boolean;
  icon?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const selected = options.find((option) => option.value === value);

  useEffect(() => {
    if (!open) return;
    const onMouseDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);

  return (
    <div className={`category-select unified-select ${open ? "open" : ""} ${disabled ? "disabled" : ""}`} ref={rootRef}>
      <button
        className="category-trigger"
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
      >
        {icon && <span className="category-trigger-icon">{icon}</span>}
        <span className="unified-select-value">{(selected?.label ?? value) || placeholder}</span>
        <svg className="category-chevron" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="m6 8 4 4 4-4" />
        </svg>
      </button>
      {open && (
        <div className="category-menu unified-select-menu" role="listbox" aria-label={ariaLabel}>
          {options.length === 0 ? (
            <div className="unified-select-empty">暂无选项</div>
          ) : options.map((option) => (
            <button
              className={`category-option ${value === option.value ? "selected" : ""}`}
              type="button"
              role="option"
              aria-selected={value === option.value}
              key={option.value}
              onClick={() => { onChange(option.value); setOpen(false); }}
            >
              <span className="unified-select-option-copy">
                <span>{option.label}</span>
                {option.description && <small>{option.description}</small>}
              </span>
              {value === option.value && <CheckIcon />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function CheckIcon() {
  return (
    <svg className="category-check" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m5 10 3 3 7-7" />
    </svg>
  );
}
