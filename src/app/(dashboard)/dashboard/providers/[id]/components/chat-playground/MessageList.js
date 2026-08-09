"use client";

import { useEffect, useRef } from "react";
import PropTypes from "prop-types";
import MessageBubble from "./MessageBubble";

export default function MessageList({ messages, streaming }) {
  const endRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "nearest" });
  }, [messages]);

  if (messages.length === 0) {
    return (
      <div className="flex h-32 flex-col items-center justify-center gap-1 rounded-[10px] border border-dashed border-border-subtle text-text-muted">
        <span className="material-symbols-outlined text-[22px]">forum</span>
        <p className="text-xs">Send a message to test this model</p>
      </div>
    );
  }

  return (
    <div className="custom-scrollbar flex max-h-[420px] flex-col gap-3 overflow-y-auto rounded-[10px] border border-border-subtle bg-bg p-3">
      {messages.map((message) => (
        <MessageBubble key={message.id} message={message} streaming={streaming} />
      ))}
      <div ref={endRef} />
    </div>
  );
}

MessageList.propTypes = {
  messages: PropTypes.array.isRequired,
  streaming: PropTypes.bool,
};
