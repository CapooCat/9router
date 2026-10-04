// Minimal llama-server stand-in for capability-detection tests.
//
// Payload shapes mirror llama.cpp tools/server: get_res_models / get_res_props
// (server-context.cpp) for single-model mode, and the router listing + router
// /props placeholder (server-models.cpp) for `--models-dir` router mode.
import http from "node:http";

export const THINKING_TEMPLATE =
  "{%- if enable_thinking is defined and enable_thinking -%}<think>\n{%- endif -%}{{ messages }}";
export const PLAIN_TEMPLATE = "{% for m in messages %}{{ m.role }}: {{ m.content }}\n{% endfor %}";

function singleModels(modelId, { vision }) {
  return {
    models: [{
      name: modelId,
      model: modelId,
      type: "model",
      capabilities: vision ? ["completion", "multimodal"] : ["completion"],
      details: { format: "gguf" },
    }],
    object: "list",
    data: [{
      id: modelId,
      object: "model",
      owned_by: "llamacpp",
      meta: { n_ctx: 32768, n_ctx_train: 262144, n_params: 8e9 },
    }],
  };
}

function modelProps(modelId, { vision, template, templateCaps }) {
  return {
    default_generation_settings: { n_ctx: 32768, params: { reasoning_format: "deepseek" } },
    model_alias: modelId,
    modalities: { vision, video: false, audio: false },
    chat_template: template,
    chat_template_caps: templateCaps,
  };
}

function routerModels(modelId, { vision, status }) {
  return {
    object: "list",
    data: [{
      id: modelId,
      object: "model",
      owned_by: "llamacpp",
      status: { value: status },
      architecture: {
        input_modalities: vision ? ["text", "image"] : ["text"],
        output_modalities: ["text"],
      },
    }],
  };
}

// Router's own /props (no ?model=) is a placeholder with no modalities.
const ROUTER_PROPS = {
  role: "router",
  model_alias: "llama-server",
  model_path: "none",
  default_generation_settings: { params: {}, n_ctx: 0 },
};

/**
 * @param {object} opts
 * @param {"single"|"router"} [opts.mode]
 * @param {string} opts.modelId
 * @param {boolean} [opts.vision]          - mmproj loaded
 * @param {string} [opts.template]         - chat_template source
 * @param {object} [opts.templateCaps]     - chat_template_caps
 * @param {string} [opts.status]           - router mode model status
 * @returns {Promise<{ baseUrl: string, requests: string[], autoloadHits: string[], close: () => void }>}
 */
export function startFakeLlamaServer({
  mode = "single",
  modelId,
  vision = true,
  template = THINKING_TEMPLATE,
  templateCaps = { supports_tools: true, supports_preserve_reasoning: true, supports_reasoning_effort: false },
  status = "loaded",
}) {
  const requests = [];
  // /props?model=X probes that would make a router spawn the model.
  const autoloadHits = [];
  const server = http.createServer((req, res) => {
    requests.push(req.url);
    const url = new URL(req.url, "http://x");
    let body = null;
    if (url.pathname === "/v1/models" || url.pathname === "/models") {
      body = mode === "router" ? routerModels(modelId, { vision, status }) : singleModels(modelId, { vision });
    } else if (url.pathname === "/props") {
      const model = url.searchParams.get("model");
      if (mode !== "router") {
        body = modelProps(modelId, { vision, template, templateCaps });
      } else if (!model) {
        body = ROUTER_PROPS;
      } else {
        const autoload = url.searchParams.get("autoload") !== "false";
        if (autoload) autoloadHits.push(model);
        // Unloaded + autoload=false → llama.cpp refuses instead of spawning.
        if (model === modelId && (status === "loaded" || autoload)) {
          body = modelProps(modelId, { vision, template, templateCaps });
        }
      }
    }
    if (!body) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(body));
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve({
    baseUrl: `http://127.0.0.1:${server.address().port}/v1`,
    requests,
    autoloadHits,
    close: () => server.close(),
  })));
}
