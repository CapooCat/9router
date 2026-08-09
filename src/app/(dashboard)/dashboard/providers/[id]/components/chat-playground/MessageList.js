"use client";

import { useEffect, useRef, useState } from "react";
import PropTypes from "prop-types";
import MessageBubble from "./MessageBubble";

// How close to the bottom still counts as "following the stream".
const STICK_THRESHOLD_PX = 48;

export default function MessageList({ messages, streaming }) {
  const scrollRef = useRef(null);
  // Ref, not state: the autoscroll effect reads this on every delta, and a
  // setState in that path would fight the scroll handler mid-stream.
  const stickRef = useRef(true);
  const lastCountRef = useRef(0);
  // State only for the jump button's visibility — updated from the scroll event.
  const [showJump, setShowJump] = useState(false);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const stick = distanceFromBottom <= STICK_THRESHOLD_PX;
    stickRef.current = stick;
    setShowJump((prev) => (prev === !stick ? prev : !stick));
  };

  // Programmatic scroll fires onScroll, which clears the button for us.
  const jumpToBottom = () => {
    const el = scrollRef.current;
    if (!el) return;
    stickRef.current = true;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  };

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    // Sending re-arms the follow: the user asked for this turn, so jump to it
    // even if they had scrolled away while reading.
    const grew = messages.length > lastCountRef.current;
    lastCountRef.current = messages.length;
    if (grew && messages[messages.length - 1]?.role === "assistant") stickRef.current = true;

    if (stickRef.current) el.scrollTop = el.scrollHeight;
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
    <div className="relative">
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="custom-scrollbar flex max-h-[800px] flex-col gap-3 overflow-y-auto rounded-[10px] border border-border-subtle bg-bg p-3"
      >
        {messages.map((message) => (
          <MessageBubble key={message.id} message={message} streaming={streaming} />
        ))}
      </div>

      {showJump && (
        <button
          onClick={jumpToBottom}
          title="Scroll to latest"
          className="absolute bottom-4 right-2 flex size-8 -translate-x-1/2 items-center justify-center rounded-full bg-brand-500 text-white shadow-[var(--shadow-elev)] transition-colors hover:bg-brand-600"
        >
          <span className="material-symbols-outlined text-[18px]">arrow_downward</span>
        </button>
      )}
    </div>
  );
}

MessageList.propTypes = {
  messages: PropTypes.array.isRequired,
  streaming: PropTypes.bool,
};
