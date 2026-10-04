"use client";

// [fork] Models card for media-provider pages (embedding, image, stt, video,
// systemone, …). Drop-in replacement for providers/components/ModelsCard —
// same props — adding remove, as the LLM provider page has it: built-in models
// are disabled (hidden from listings, restorable from the "Disabled models"
// chips); custom models are deleted.
// Kept in its own file so upstream merges of ModelsCard/page.js stay clean; the
// media detail page swaps it in through its single ModelsCard import.

import { useCallback, useEffect, useState } from "react";
import PropTypes from "prop-types";
import { Card, Button, Modal } from "@/shared/components";
import { getModelsByProviderId, getModelKind } from "@/shared/constants/models";
import { getProviderAlias } from "@/shared/constants/providers";
import { useCopyToClipboard } from "@/shared/hooks/useCopyToClipboard";
import ModelRow from "@/app/(dashboard)/dashboard/providers/[id]/ModelRow";

// Custom models (all providers) + disabled ids for this alias. A failed request
// leaves that half null so the current state is kept.
async function loadModelState(providerAlias) {
  try {
    const [customRes, disabledRes] = await Promise.all([
      fetch("/api/models/custom", { cache: "no-store" }),
      fetch(`/api/models/disabled?providerAlias=${encodeURIComponent(providerAlias)}`, { cache: "no-store" }),
    ]);
    const customData = await customRes.json();
    const disabledData = await disabledRes.json();
    return {
      custom: customRes.ok ? (customData.models || []) : null,
      disabled: disabledRes.ok ? (disabledData.ids || []) : null,
    };
  } catch (e) {
    console.log("MediaModelsCard fetch error:", e);
    return { custom: null, disabled: null };
  }
}

function AddMediaModelModal({ isOpen, onSave, onClose }) {
  const [modelId, setModelId] = useState("");

  const handleSave = () => {
    if (!modelId.trim()) return;
    onSave(modelId.trim());
    setModelId("");
  };

  return (
    <Modal isOpen={isOpen} title="Add Custom Model" onClose={onClose}>
      <div className="flex flex-col gap-4">
        <div>
          <label htmlFor="media-model-id-input" className="text-xs text-text-muted mb-1 block">Model ID</label>
          <input
            id="media-model-id-input"
            className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:border-primary"
            value={modelId}
            onChange={(e) => setModelId(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSave()}
            placeholder="e.g. tts-1-hd"
            autoFocus
          />
        </div>
        <div className="flex gap-2">
          <Button onClick={handleSave} fullWidth disabled={!modelId.trim()}>Add</Button>
          <Button onClick={onClose} variant="ghost" fullWidth>Cancel</Button>
        </div>
      </div>
    </Modal>
  );
}

AddMediaModelModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onSave: PropTypes.func.isRequired,
  onClose: PropTypes.func.isRequired,
};

export default function MediaModelsCard({ providerId, kindFilter, providerAliasOverride }) {
  const { copied, copy } = useCopyToClipboard();
  const [customModels, setCustomModels] = useState([]);
  const [disabledIds, setDisabledIds] = useState([]);
  const [modelTestResults, setModelTestResults] = useState({});
  const [testingModelId, setTestingModelId] = useState(null);
  const [testError, setTestError] = useState("");
  const [showAddModel, setShowAddModel] = useState(false);

  const providerAlias = providerAliasOverride || getProviderAlias(providerId);
  const effectiveType = kindFilter || "llm";

  const applyModelState = useCallback(({ custom, disabled }) => {
    if (custom) setCustomModels(custom);
    if (disabled) setDisabledIds(disabled);
  }, []);

  const fetchData = useCallback(
    async () => applyModelState(await loadModelState(providerAlias)),
    [providerAlias, applyModelState],
  );

  useEffect(() => {
    let alive = true;
    loadModelState(providerAlias).then((state) => { if (alive) applyModelState(state); });
    return () => { alive = false; };
  }, [providerAlias, applyModelState]);

  const notifyModelsChanged = () => {
    if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("customModelChanged"));
  };

  const handleAddCustomModel = async (modelId) => {
    try {
      const res = await fetch("/api/models/custom", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ providerAlias, id: modelId, type: effectiveType }),
      });
      if (res.ok) {
        await fetchData();
        notifyModelsChanged();
      }
    } catch (e) { console.log("add custom model error:", e); }
  };

  const handleDeleteCustomModel = async (modelId) => {
    try {
      const params = new URLSearchParams({ providerAlias, id: modelId, type: effectiveType });
      const res = await fetch(`/api/models/custom?${params}`, { method: "DELETE" });
      if (res.ok) {
        await fetchData();
        notifyModelsChanged();
      }
    } catch (e) { console.log("delete custom model error:", e); }
  };

  // Disabled ids are keyed by provider alias (shared with the LLM page), so
  // enable/disable one id at a time — never the alias-wide "enable all".
  const handleDisableModel = async (modelId) => {
    try {
      const res = await fetch("/api/models/disabled", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ providerAlias, ids: [modelId] }),
      });
      if (res.ok) await fetchData();
    } catch (e) { console.log("disable model error:", e); }
  };

  const handleEnableModel = async (modelId) => {
    try {
      const params = new URLSearchParams({ providerAlias, id: modelId });
      const res = await fetch(`/api/models/disabled?${params}`, { method: "DELETE" });
      if (res.ok) await fetchData();
    } catch (e) { console.log("enable model error:", e); }
  };

  const handleTestModel = async (modelId) => {
    if (testingModelId) return;
    setTestingModelId(modelId);
    try {
      const res = await fetch("/api/models/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: `${providerAlias}/${modelId}`, kind: kindFilter }),
      });
      const data = await res.json();
      setModelTestResults((prev) => ({ ...prev, [modelId]: data.ok ? "ok" : "error" }));
      setTestError(data.ok ? "" : (data.error || "Model not reachable"));
    } catch {
      setModelTestResults((prev) => ({ ...prev, [modelId]: "error" }));
      setTestError("Network error");
    } finally { setTestingModelId(null); }
  };

  // Built-in models of this kind
  const allBuiltIn = getModelsByProviderId(providerId);
  const builtInModels = kindFilter
    ? allBuiltIn.filter((m) => (m.kinds ? m.kinds.includes(kindFilter) : getModelKind(m, "llm") === kindFilter))
    : allBuiltIn;
  const disabledSet = new Set(disabledIds);
  const activeBuiltIn = builtInModels.filter((m) => !disabledSet.has(m.id));
  const disabledBuiltIn = builtInModels.filter((m) => disabledSet.has(m.id));

  // Custom models for this provider + kind, dedupe vs built-in
  const myCustomModels = customModels.filter(
    (m) => m.providerAlias === providerAlias
      && getModelKind(m, "llm") === effectiveType
      && !builtInModels.some((b) => b.id === m.id)
  );

  return (
    <>
      <Card>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Models{kindFilter ? ` — ${kindFilter.toUpperCase()}` : ""}</h2>
        </div>
        {testError && <p className="text-xs text-red-500 mb-3 break-words">{testError}</p>}

        <div className="flex flex-wrap gap-3">
          {myCustomModels.map((model) => (
            <ModelRow
              key={`${model.id}-${model.type}`}
              model={{ id: model.id, name: model.name }}
              fullModel={`${providerAlias}/${model.id}`}
              copied={copied}
              onCopy={copy}
              onDeleteAlias={() => handleDeleteCustomModel(model.id)}
              testStatus={modelTestResults[model.id]}
              onTest={() => handleTestModel(model.id)}
              isTesting={testingModelId === model.id}
              isCustom
            />
          ))}

          {activeBuiltIn.map((model) => (
            <ModelRow
              key={model.id}
              model={model}
              fullModel={`${providerAlias}/${model.id}`}
              copied={copied}
              onCopy={copy}
              testStatus={modelTestResults[model.id]}
              onTest={() => handleTestModel(model.id)}
              isTesting={testingModelId === model.id}
              isFree={model.isFree}
              onDisable={() => handleDisableModel(model.id)}
            />
          ))}

          <button
            onClick={() => setShowAddModel(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-dashed border-black/15 dark:border-white/15 text-xs text-text-muted hover:text-primary hover:border-primary/40 transition-colors"
          >
            <span className="material-symbols-outlined text-sm">add</span>
            Add Model
          </button>
        </div>

        {disabledBuiltIn.length > 0 && (
          <div className="w-full mt-4">
            <p className="text-xs text-text-muted mb-2">Disabled models ({disabledBuiltIn.length}):</p>
            <div className="flex flex-wrap gap-2">
              {disabledBuiltIn.map((m) => (
                <button
                  key={m.id}
                  onClick={() => handleEnableModel(m.id)}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-dashed border-black/10 dark:border-white/10 text-xs text-text-muted hover:text-primary hover:border-primary/40 hover:bg-primary/5 transition-colors"
                  title="Restore model"
                >
                  <span className="material-symbols-outlined text-[13px]">add</span>
                  {m.id}
                </button>
              ))}
            </div>
          </div>
        )}
      </Card>

      <AddMediaModelModal
        isOpen={showAddModel}
        onSave={async (modelId) => {
          await handleAddCustomModel(modelId);
          setShowAddModel(false);
        }}
        onClose={() => setShowAddModel(false)}
      />
    </>
  );
}

MediaModelsCard.propTypes = {
  providerId: PropTypes.string.isRequired,
  kindFilter: PropTypes.string,
  providerAliasOverride: PropTypes.string,
};
