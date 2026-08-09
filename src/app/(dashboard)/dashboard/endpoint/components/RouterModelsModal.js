"use client";

import { useEffect, useMemo, useState } from "react";
import PropTypes from "prop-types";
import { Badge, Button, CapacityBadges, Modal } from "@/shared/components";
import { useCopyToClipboard } from "@/shared/hooks/useCopyToClipboard";
import { formatTokens } from "@/shared/utils/formatTokens";
import { countByKind, fetchRouterModels, KIND_LABELS, RELATED_ENDPOINTS } from "../routerModels";

export default function RouterModelsModal({ isOpen, onClose, apiKey }) {
  // `request` is bumped by Refresh; `result` carries the request it answered, so
  // "loading" is derived rather than set — no setState in the effect body.
  const [request, setRequest] = useState(0);
  const [result, setResult] = useState(null);
  const [query, setQuery] = useState("");
  const [kindFilter, setKindFilter] = useState("");
  const { copied, copy } = useCopyToClipboard();

  const loading = !result || result.request !== request;
  // Stable identity so the filter/count memos below don't rerun every render.
  const models = useMemo(() => result?.models || [], [result]);
  const sources = result?.sources || [];
  const error = result?.error || "";

  useEffect(() => {
    if (!isOpen) return undefined;
    const controller = new AbortController();

    fetchRouterModels({ apiKey, signal: controller.signal })
      .then(({ models: fetched, sources: fetchedSources }) => {
        if (controller.signal.aborted) return;
        setResult({ request, models: fetched, sources: fetchedSources, error: "" });
      })
      .catch((e) => {
        if (controller.signal.aborted || e?.name === "AbortError") return;
        setResult({ request, models: [], sources: [], error: e?.message || "Failed to load models" });
      });

    return () => controller.abort();
  }, [isOpen, apiKey, request]);

  const kindCounts = useMemo(() => countByKind(models), [models]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return models.filter((m) => {
      if (kindFilter && m.kind !== kindFilter) return false;
      if (!q) return true;
      return m.id.toLowerCase().includes(q) || m.owned_by.toLowerCase().includes(q);
    });
  }, [models, query, kindFilter]);

  const failed = sources.filter((s) => !s.ok);
  const origin = typeof window !== "undefined" ? window.location.origin : "";

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Router Models"
      size="xl"
      footer={
        <>
          <span className="mr-auto text-xs text-text-muted">
            {filtered.length === models.length
              ? `${models.length} models`
              : `${filtered.length} of ${models.length} models`}
          </span>
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-text-muted">
            Everything served from <code className="font-mono">{origin}</code>
          </p>
          <Button
            size="sm"
            variant="secondary"
            icon="refresh"
            onClick={() => setRequest((n) => n + 1)}
            loading={loading}
          >
            Refresh
          </Button>
        </div>

        {error && (
          <div className="rounded px-2 py-1.5 text-xs bg-red-500/10 text-red-600 dark:text-red-400">{error}</div>
        )}

        {failed.length > 0 && (
          <div className="rounded px-2 py-1.5 text-xs bg-red-500/10 text-red-600 dark:text-red-400">
            {failed.length} endpoint{failed.length === 1 ? "" : "s"} failed:{" "}
            {failed.map((s) => `${s.path} (${s.error})`).join(" · ")}
          </div>
        )}

        {loading && models.length === 0 ? (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-text-muted">
            <span className="material-symbols-outlined animate-spin text-[18px]">progress_activity</span>
            Fetching every model endpoint…
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search models or providers"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
              />
            </div>

            {kindCounts.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {kindCounts.map(({ kind, label, count }) => (
                  <button key={kind} onClick={() => setKindFilter(kindFilter === kind ? "" : kind)}>
                    <Badge size="sm" variant={kindFilter === kind ? "primary" : "default"}>
                      {label} {count}
                    </Badge>
                  </button>
                ))}
              </div>
            )}

            <div className="custom-scrollbar max-h-[55vh] overflow-y-auto rounded-lg border border-border">
              {filtered.map((model) => (
                <div
                  key={`${model.kind}:${model.id}`}
                  className="group flex items-center gap-3 border-b border-border px-3 py-2 last:border-b-0 hover:bg-sidebar/50"
                >
                  <code className="min-w-0 flex-1 truncate font-mono text-xs text-text-main">{model.id}</code>

                  {model.capabilities && (
                    <div className="hidden shrink-0 items-center gap-1 text-text-muted sm:flex">
                      <CapacityBadges caps={model.capabilities} size={16} />
                      {model.capabilities.contextWindow > 0 && (
                        <span className="ml-1 text-[10px]">{formatTokens(model.capabilities.contextWindow)} ctx</span>
                      )}
                      {model.capabilities.maxOutput > 0 && (
                        <span className="text-[10px]">· {formatTokens(model.capabilities.maxOutput)} out</span>
                      )}
                    </div>
                  )}

                  <Badge size="sm" className="shrink-0">
                    {KIND_LABELS[model.kind] || model.kind}
                  </Badge>

                  <button
                    onClick={() => copy(model.id, `${model.kind}:${model.id}`)}
                    className="shrink-0 rounded p-0.5 text-text-muted transition-opacity hover:text-primary sm:opacity-0 sm:group-hover:opacity-100"
                    title="Copy model id"
                  >
                    <span className="material-symbols-outlined text-[16px]">
                      {copied === `${model.kind}:${model.id}` ? "check" : "content_copy"}
                    </span>
                  </button>
                </div>
              ))}
              {filtered.length === 0 && <p className="p-4 text-center text-sm text-text-muted">No matching models.</p>}
            </div>

            <p className="text-[11px] text-text-muted">
              Also served:{" "}
              {RELATED_ENDPOINTS.map((e, i) => (
                <span key={e.path}>
                  {i > 0 && " · "}
                  <code className="font-mono">{e.path}</code> ({e.note})
                </span>
              ))}
            </p>
          </>
        )}
      </div>
    </Modal>
  );
}

RouterModelsModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  apiKey: PropTypes.string,
};
