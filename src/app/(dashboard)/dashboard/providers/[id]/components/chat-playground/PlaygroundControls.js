"use client";

import PropTypes from "prop-types";
import { Badge, Input, Select } from "@/shared/components";
import { formatTokens } from "./metrics";

export default function PlaygroundControls({
  modelOptions,
  modelId,
  onModelChange,
  requestModel,
  caps,
  systemPrompt,
  onSystemPromptChange,
  temperature,
  onTemperatureChange,
  maxTokens,
  onMaxTokensChange,
  disabled,
}) {
  const options = modelOptions.map((m) => ({
    value: m.id,
    label: m.name && m.name !== m.id ? `${m.id} — ${m.name}` : m.id,
  }));

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Select
          className="min-w-0 flex-1"
          options={options}
          value={modelId}
          onChange={(e) => onModelChange(e.target.value)}
          placeholder={options.length ? "Select a model" : "No models available"}
          disabled={disabled || options.length === 0}
        />
        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
          {caps?.contextWindow > 0 && (
            <Badge size="sm" icon="database">{formatTokens(caps.contextWindow)} ctx</Badge>
          )}
          {caps?.maxOutput > 0 && (
            <Badge size="sm" icon="output">{formatTokens(caps.maxOutput)} out</Badge>
          )}
        </div>
      </div>

      {requestModel && (
        <code className="truncate rounded bg-sidebar px-1.5 py-0.5 font-mono text-[11px] text-text-muted">
          {requestModel}
        </code>
      )}

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
        <Input
          className="sm:col-span-2"
          placeholder="System prompt (optional)"
          value={systemPrompt}
          onChange={(e) => onSystemPromptChange(e.target.value)}
          disabled={disabled}
        />
        <Input
          type="number"
          step="0.1"
          min="0"
          max="2"
          placeholder="temperature"
          value={temperature}
          onChange={(e) => onTemperatureChange(e.target.value)}
          disabled={disabled}
        />
        <Input
          type="number"
          min="1"
          max={caps?.maxOutput || undefined}
          placeholder="max_tokens"
          value={maxTokens}
          onChange={(e) => onMaxTokensChange(e.target.value)}
          hint={caps?.maxOutput > 0 ? `≤ ${formatTokens(caps.maxOutput)}` : undefined}
          disabled={disabled}
        />
      </div>
    </div>
  );
}

PlaygroundControls.propTypes = {
  modelOptions: PropTypes.array.isRequired,
  modelId: PropTypes.string,
  onModelChange: PropTypes.func.isRequired,
  requestModel: PropTypes.string,
  caps: PropTypes.object,
  systemPrompt: PropTypes.string.isRequired,
  onSystemPromptChange: PropTypes.func.isRequired,
  temperature: PropTypes.string.isRequired,
  onTemperatureChange: PropTypes.func.isRequired,
  maxTokens: PropTypes.string.isRequired,
  onMaxTokensChange: PropTypes.func.isRequired,
  disabled: PropTypes.bool,
};
