"use client";

import { useRef, useEffect } from "react";
import PropTypes from "prop-types";
import { Button } from "@/shared/components";

const MAX_HEIGHT = 160;

export default function Composer({ value, onChange, onSend, onStop, streaming, disabled, disabledHint }) {
  const textareaRef = useRef(null);

  // Grow with content, then scroll.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight + 2, MAX_HEIGHT)}px`;
  }, [value]);

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!disabled && !streaming) onSend();
    }
  };

  return (
    <div className="mt-3 flex flex-col gap-1.5">
      <div className="flex items-end gap-2">
        <textarea
          ref={textareaRef}
          rows={1}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          placeholder={disabled ? disabledHint : "Message… (Enter to send, Shift+Enter for a new line)"}
          className="custom-scrollbar w-full resize-none rounded-[10px] border border-transparent bg-surface-2 px-3 py-2.5 text-[16px] text-text-main placeholder-text-muted/70 transition-all duration-150 focus:border-brand-500/40 focus:outline-none focus:ring-2 focus:ring-brand-500/30 disabled:cursor-not-allowed disabled:opacity-50 sm:text-sm"
        />
        {streaming ? (
          <Button variant="secondary" icon="stop_circle" onClick={onStop}>
            Stop
          </Button>
        ) : (
          <Button icon="send" onClick={onSend} disabled={disabled || !value.trim()}>
            Send
          </Button>
        )}
      </div>
      {disabled && disabledHint && <p className="text-xs text-text-muted">{disabledHint}</p>}
    </div>
  );
}

Composer.propTypes = {
  value: PropTypes.string.isRequired,
  onChange: PropTypes.func.isRequired,
  onSend: PropTypes.func.isRequired,
  onStop: PropTypes.func.isRequired,
  streaming: PropTypes.bool,
  disabled: PropTypes.bool,
  disabledHint: PropTypes.string,
};
