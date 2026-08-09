"use client";

import { useState } from "react";
import PropTypes from "prop-types";
import { useCopyToClipboard } from "@/shared/hooks/useCopyToClipboard";
import MetricsStrip from "./MetricsStrip";

export default function MessageBubble({ message, streaming }) {
  const [showThinking, setShowThinking] = useState(false);
  const { copied, copy } = useCopyToClipboard();

  const isUser = message.role === "user";
  const hasError = !!message.error;
  const isPending = !isUser && !hasError && !message.content && !message.reasoning;

  return (
    <div className={`flex flex-col gap-1 ${isUser ? "items-end" : "items-start"}`}>
      <div
        className={[
          "group max-w-[92%] min-w-0 rounded-[10px] border px-3 py-2 text-sm whitespace-pre-wrap break-words",
          isUser
            ? "border-brand-500/30 bg-brand-500/10 text-text-main"
            : hasError
              ? "border-red-500/40 bg-red-500/5 text-red-600 dark:text-red-400"
              : "border-border-subtle bg-surface-2 text-text-main",
        ].join(" ")}
      >
        {message.reasoning && !hasError && (
          <div className="mb-2">
            <button
              onClick={() => setShowThinking((v) => !v)}
              className="flex items-center gap-1 text-[11px] text-text-muted hover:text-primary"
            >
              <span className="material-symbols-outlined text-[14px]">
                {showThinking ? "expand_more" : "chevron_right"}
              </span>
              Thinking
            </button>
            {showThinking && (
              <p className="mt-1 border-l-2 border-border pl-2 text-xs italic text-text-muted">{message.reasoning}</p>
            )}
          </div>
        )}
        
        {hasError ? message.error : message.content.trim()}

        {isPending && (
          <div className="flex justify-between items-center relative min-h-[20px] min-w-[20px]">
            <span className="material-symbols-outlined absolute left-0.5 animate-spin text-[14px]! text-text-muted">
              progress_activity
            </span>
          </div>
        )}

        {message.stopped && <span className="ml-1 text-[10px] text-text-muted">(stopped)</span>}

        {!isUser && !hasError && message.content && !streaming && (
          <button
            onClick={() => copy(message.content, message.id)}
            className="ml-2 size-4 align-middle text-text-muted opacity-100 transition-opacity hover:text-primary sm:opacity-0 sm:group-hover:opacity-100"
            title="Copy reply"
          >
            <span className="material-symbols-outlined text-[14px]!">
              {copied === message.id ? "check" : "content_copy"}
            </span>
          </button>
        )}
      </div>

      {!isUser && <MetricsStrip metrics={message.metrics} />}
    </div>
  );
}

MessageBubble.propTypes = {
  message: PropTypes.shape({
    id: PropTypes.string.isRequired,
    role: PropTypes.string.isRequired,
    content: PropTypes.string,
    reasoning: PropTypes.string,
    error: PropTypes.string,
    stopped: PropTypes.bool,
    metrics: PropTypes.object,
  }).isRequired,
  streaming: PropTypes.bool,
};
