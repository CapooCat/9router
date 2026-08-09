"use client";

import { useState } from "react";
import PropTypes from "prop-types";
import { Button, Card } from "@/shared/components";
import { useModelCaps } from "@/shared/hooks/useModelCaps";
import { usePlaygroundChat } from "./usePlaygroundChat";
import PlaygroundControls from "./PlaygroundControls";
import MessageList from "./MessageList";
import ContextMeter from "./ContextMeter";
import Composer from "./Composer";

/**
 * Chat playground for one provider — composition only.
 * Transport lives in streamChat.js, state in usePlaygroundChat.js, math in metrics.js.
 */
export default function ChatPlaygroundCard({
  providerId,
  providerDisplayAlias,
  modelOptions,
  resolveThinkingSuffix,
  canSend,
}) {
  const { getCaps } = useModelCaps();
  const [pickedModelId, setPickedModelId] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [temperature, setTemperature] = useState("");
  const [maxTokens, setMaxTokens] = useState("");

  // Derived, not stored: falls back to the first model, and self-heals when the
  // picked one disappears (disabled or removed from the models card).
  const modelId = modelOptions.some((m) => m.id === pickedModelId)
    ? pickedModelId
    : (modelOptions[0]?.id || "");

  const thinkingSuffix = modelId ? resolveThinkingSuffix?.(modelId) : null;
  const requestModel = modelId
    ? `${providerDisplayAlias}/${modelId}${thinkingSuffix ? `(${thinkingSuffix})` : ""}`
    : "";
  const caps = modelId ? getCaps(`${providerId}/${modelId}`) : null;

  const { messages, input, setInput, send, stop, clear, streaming, context } = usePlaygroundChat({
    requestModel,
    systemPrompt,
    temperature,
    maxTokens,
  });

  const disabled = !canSend || !modelId || streaming;
  const disabledHint = !canSend
    ? "Add a connection to this provider first"
    : !modelId
      ? "No model selected"
      : "";

  return (
    <Card
      title="Chat Playground"
      subtitle="Send a real request through the router and measure it"
      action={
        messages.length > 0 && (
          <Button variant="ghost" size="sm" icon="delete_sweep" onClick={clear}>
            Clear
          </Button>
        )
      }
    >
      <div className="flex flex-col gap-3">
        <PlaygroundControls
          modelOptions={modelOptions}
          modelId={modelId}
          onModelChange={setPickedModelId}
          requestModel={requestModel}
          caps={caps}
          systemPrompt={systemPrompt}
          onSystemPromptChange={setSystemPrompt}
          temperature={temperature}
          onTemperatureChange={setTemperature}
          maxTokens={maxTokens}
          onMaxTokensChange={setMaxTokens}
          disabled={streaming}
        />

        <MessageList messages={messages} streaming={streaming} />

        <ContextMeter
          used={context.used}
          estimated={context.estimated}
          contextWindow={caps?.contextWindow}
          maxOutput={caps?.maxOutput}
        />

        <Composer
          value={input}
          onChange={setInput}
          onSend={send}
          onStop={stop}
          streaming={streaming}
          disabled={disabled && !streaming}
          disabledHint={disabledHint}
        />
      </div>
    </Card>
  );
}

ChatPlaygroundCard.propTypes = {
  providerId: PropTypes.string.isRequired,
  providerDisplayAlias: PropTypes.string.isRequired,
  modelOptions: PropTypes.arrayOf(
    PropTypes.shape({ id: PropTypes.string.isRequired, name: PropTypes.string })
  ).isRequired,
  resolveThinkingSuffix: PropTypes.func,
  canSend: PropTypes.bool,
};
