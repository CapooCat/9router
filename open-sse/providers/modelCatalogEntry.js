// Public /v1/models entry shape — the WRITE-side counterpart of upstreamCaps.js.
//
// upstreamCaps.js exists because there is no standard field for per-model limits:
// every gateway invented its own key. The same problem hits us from the other
// side — clients (Cline, Roo, Kilo, Hermes, aider, LibreChat, opencode, …) each
// read a different key, and OpenAI's own /v1/models carries no limits at all, so
// there is no "correct" single field to emit. A client that finds none of its
// keys either refuses the model or silently assumes ~4k context.
//
// So we emit the same limits under every key family we know a client reads:
//   context_length / max_input_tokens        (OpenRouter, LiteLLM-shaped)
//   max_completion_tokens / max_output_tokens
//   top_provider.{context_length,max_completion_tokens}   (OpenRouter)
//   limit.{context,output}                   (models.dev / opencode)
//   capabilities.{contextWindow,maxOutput}   (9router's own shape — unchanged)
// Redundant by design: the cost of an extra key is bytes, the cost of a missing
// key is a client that can't size its context.
//
// Deliberately NOT emitted: a bare top-level `max_tokens`. It means OUTPUT cap
// in some catalogs and CONTEXT window in others (see MAX_OUTPUT_READERS note in
// upstreamCaps.js) — emitting it would make some readers size context at 64k.

import { DEFAULT_CAPABILITIES } from "./capabilities.js";

// OpenAI clients that validate the entry schema require `created` to be a
// number. Fixed constant rather than Date.now(): the value carries no real
// information (we don't track model release dates) and a stable response keeps
// it cacheable.
export const MODEL_CREATED_AT = 1700000000;

// caps flag → OpenRouter-style input modality name ("file" is OpenRouter's
// name for PDF/document input).
const INPUT_MODALITIES = [
  ["image", "vision"],
  ["audio", "audioInput"],
  ["video", "videoInput"],
  ["file", "pdf"],
];

const OUTPUT_MODALITIES = [
  ["image", "imageOutput"],
  ["audio", "audioOutput"],
];

// Params the translator layer accepts for every LLM route. Tool / reasoning
// params are appended per model from its capabilities.
const BASE_SUPPORTED_PARAMETERS = [
  "max_tokens",
  "temperature",
  "top_p",
  "stop",
  "frequency_penalty",
  "presence_penalty",
  "seed",
  "response_format",
];

/**
 * OpenRouter-style `architecture` block for a capability set.
 * @returns {{ modality: string, input_modalities: string[], output_modalities: string[], tokenizer: string, instruct_type: null }}
 */
export function architectureFromCaps(caps) {
  const input = ["text", ...INPUT_MODALITIES.filter(([, flag]) => caps?.[flag]).map(([name]) => name)];
  const output = ["text", ...OUTPUT_MODALITIES.filter(([, flag]) => caps?.[flag]).map(([name]) => name)];
  return {
    modality: `${input.join("+")}->${output.join("+")}`,
    input_modalities: input,
    output_modalities: output,
    tokenizer: "Other",
    instruct_type: null,
  };
}

/** Params a client may send for this model, OpenRouter's `supported_parameters`. */
export function supportedParametersFromCaps(caps) {
  const params = [...BASE_SUPPORTED_PARAMETERS];
  if (caps?.tools) params.push("tools", "tool_choice");
  if (caps?.reasoning) params.push("reasoning", "include_reasoning", "reasoning_effort");
  return params;
}

// $/1M tokens (our internal unit) → $/token decimal string (OpenRouter's unit).
// Strings, not numbers: OpenRouter emits strings and clients parseFloat them,
// and a string avoids 5e-7 exponent notation that some parsers mishandle.
function perTokenString(perMillion) {
  if (typeof perMillion !== "number" || !Number.isFinite(perMillion) || perMillion < 0) return null;
  if (perMillion === 0) return "0";
  return (perMillion / 1e6).toFixed(12).replace(/0+$/, "").replace(/\.$/, "");
}

/**
 * OpenRouter-style `pricing` block from an internal pricing record
 * ($/1M tokens). Returns null when nothing usable is known, so callers can omit
 * the key rather than advertise a free model.
 */
export function pricingBlockFromRates(rates) {
  if (!rates || typeof rates !== "object") return null;
  const prompt = perTokenString(rates.input);
  const completion = perTokenString(rates.output);
  if (prompt === null && completion === null) return null;
  const block = {
    prompt: prompt ?? "0",
    completion: completion ?? "0",
    request: "0",
    image: "0",
    web_search: "0",
    internal_reasoning: perTokenString(rates.reasoning) ?? completion ?? "0",
  };
  const cached = perTokenString(rates.cached);
  if (cached !== null) block.input_cache_read = cached;
  const cacheWrite = perTokenString(rates.cache_creation);
  if (cacheWrite !== null) block.input_cache_write = cacheWrite;
  return block;
}

function positiveInt(value) {
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : null;
}

/**
 * Add the OpenAI-compatible metadata a client needs to size its context to a
 * /v1/models entry. Mutates and returns `entry`.
 *
 * `capabilities` (9router's own shape) is left exactly as it was — this only
 * ADDS the cross-client aliases, so existing consumers (dashboard,
 * 9router-fetching-9router) keep working.
 *
 * @param {object} entry  partially built entry — must already have `id`
 * @param {object|null} caps  resolved capabilities, or null for kinds that have none
 * @param {object} [options]
 * @param {object|null} [options.pricing]  internal $/1M rates, from getPricingForModel()
 */
export function decorateModelEntry(entry, caps, options = {}) {
  if (!entry || typeof entry !== "object") return entry;
  if (typeof entry.created !== "number") entry.created = MODEL_CREATED_AT;
  if (!entry.object) entry.object = "model";

  const pricing = pricingBlockFromRates(options.pricing);
  if (pricing) entry.pricing = pricing;

  if (!caps) return entry;

  const contextWindow = positiveInt(caps.contextWindow);
  // maxOutput can't exceed the window; upstream catalogs sometimes say it does.
  const maxOutput = contextWindow
    ? Math.min(positiveInt(caps.maxOutput) ?? contextWindow, contextWindow)
    : positiveInt(caps.maxOutput);

  if (contextWindow) {
    entry.context_length = contextWindow;
    entry.max_input_tokens = contextWindow;
  }
  if (maxOutput) {
    entry.max_output_tokens = maxOutput;
    entry.max_completion_tokens = maxOutput;
  }
  if (contextWindow || maxOutput) {
    entry.top_provider = {
      context_length: contextWindow,
      max_completion_tokens: maxOutput,
      is_moderated: false,
    };
    entry.limit = { context: contextWindow, output: maxOutput };
  }

  entry.architecture = architectureFromCaps(caps);
  entry.supported_parameters = supportedParametersFromCaps(caps);
  return entry;
}

// How one capability key is combined across a combo's members.
//   flags   — every member must have it, else the combo can't promise it
//   numbers — the smallest, so the value holds no matter which member serves
//   rest    — only when every member agrees (thinkingFormat / thinkingRange:
//             disagreeing members have no single answer, and picking one
//             member's wire format would misdescribe the others)
function combineCapabilityValues(values) {
  if (values.some((value) => typeof value === "boolean")) {
    return values.every((value) => value === true);
  }
  if (values.every((value) => typeof value === "number")) {
    return Math.min(...values);
  }
  const [first, ...rest] = values;
  return rest.every((value) => value === first) ? first : null;
}

/**
 * Capabilities of a combo (model list with fallback), derived from its members.
 *
 * A combo can serve any of its members, so it may only advertise what EVERY
 * member can honour. Over-advertising the window is the damaging direction —
 * the client packs a prompt that the fallback model then has to reject.
 *
 * @param {object[]} memberCaps  resolved capabilities per member model
 * @returns {object|null} null when no member resolved
 */
export function comboCapsFromMembers(memberCaps) {
  const members = (memberCaps || []).filter((caps) => caps && typeof caps === "object");
  if (members.length === 0) return null;
  if (members.length === 1) return { ...members[0] };

  // Start from the first member so keys outside DEFAULT_CAPABILITIES (provider
  // extras) survive; every known key is then recombined across all members.
  const combined = { ...members[0] };
  for (const key of Object.keys(DEFAULT_CAPABILITIES)) {
    combined[key] = combineCapabilityValues(members.map((caps) => caps[key]));
  }
  return combined;
}
