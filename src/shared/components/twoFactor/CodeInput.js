"use client";

import Input from "@/shared/components/Input";

const TOTP_LENGTH = 6;
// 12 chars + 2 dashes in the XXXX-XXXX-XXXX display form.
const BACKUP_LENGTH = 14;

/**
 * One-time-code field, shared by the login challenge and the profile-page flows.
 *
 * `onChange` receives the sanitised string, not an event — every call site wants the
 * cleaned value and nothing else.
 *
 * Note `Input`'s `className` lands on the wrapper div, so the centred mono styling
 * has to go through `inputClassName`.
 */
export default function CodeInput({
  mode = "totp",
  value,
  onChange,
  onComplete,
  onSubmitKey,
  inputId,
  label,
  error,
  hint,
  disabled = false,
  autoFocus = false,
  ...props
}) {
  const isTotp = mode === "totp";
  const maxLength = isTotp ? TOTP_LENGTH : BACKUP_LENGTH;

  const handleChange = (event) => {
    const raw = event.target.value;
    const next = isTotp
      ? raw.replace(/\D/g, "").slice(0, TOTP_LENGTH)
      : raw.toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, maxLength);

    onChange?.(next);
    // Auto-submit only for TOTP: a backup code is variable-looking and a typo would
    // burn a one-time code plus a rate-limited attempt.
    if (isTotp && next.length === TOTP_LENGTH) onComplete?.(next);
  };

  return (
    <Input
      id={inputId}
      type="text"
      label={label}
      value={value}
      onChange={handleChange}
      error={error}
      hint={hint}
      disabled={disabled}
      autoFocus={autoFocus}
      maxLength={maxLength}
      // inputMode (not type="number") keeps the numeric keypad without spinners,
      // and without browsers ignoring maxLength.
      inputMode={isTotp ? "numeric" : "text"}
      autoComplete="one-time-code"
      autoCorrect="off"
      spellCheck={false}
      aria-invalid={error ? "true" : undefined}
      placeholder={isTotp ? "000000" : "XXXX-XXXX-XXXX"}
      onKeyDown={(event) => {
        if (event.key === "Enter" && onSubmitKey) {
          event.preventDefault();
          onSubmitKey();
        }
      }}
      inputClassName="text-center font-mono tracking-[0.3em] text-[20px] sm:text-[20px] py-3"
      {...props}
    />
  );
}
