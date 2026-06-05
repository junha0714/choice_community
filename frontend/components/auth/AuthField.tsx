import type { ReactNode } from "react";
import { AUTH_INPUT, AUTH_LABEL } from "@/lib/auth-form-classes";

type AuthFieldProps = {
  id: string;
  label: ReactNode;
  type?: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete?: string;
  placeholder?: string;
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  hint?: string;
};

export function AuthField({
  id,
  label,
  type = "text",
  value,
  onChange,
  autoComplete,
  placeholder,
  required,
  minLength,
  maxLength,
  hint,
}: AuthFieldProps) {
  return (
    <div>
      <label htmlFor={id} className={AUTH_LABEL}>
        {label}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        placeholder={placeholder}
        required={required}
        minLength={minLength}
        maxLength={maxLength}
        className={AUTH_INPUT}
      />
      {hint ? (
        <p className="mt-1 text-xs text-zinc-500 dark:text-[#8fa3b8]">{hint}</p>
      ) : null}
    </div>
  );
}
