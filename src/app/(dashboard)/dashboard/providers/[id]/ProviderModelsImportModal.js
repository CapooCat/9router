"use client";

import { useMemo, useState } from "react";
import PropTypes from "prop-types";
import { Button, Modal } from "@/shared/components";

export default function ProviderModelsImportModal({ isOpen, models, existingModelIds, onConfirm, onClose }) {
  const [selectedIds, setSelectedIds] = useState(() => models.map((model) => model.id));
  const [searchQuery, setSearchQuery] = useState("");
  const [saving, setSaving] = useState(false);

  const availableModels = useMemo(() => {
    const existingIds = new Set(existingModelIds);
    const seen = new Set();
    return models.filter((model) => {
      if (!model?.id || seen.has(model.id) || existingIds.has(model.id)) return false;
      seen.add(model.id);
      return true;
    });
  }, [models, existingModelIds]);

  const filteredModels = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return availableModels;
    return availableModels.filter((model) => (
      model.id.toLowerCase().includes(query) || model.name?.toLowerCase().includes(query)
    ));
  }, [availableModels, searchQuery]);

  const selectedModels = useMemo(
    () => availableModels.filter((model) => selectedIds.includes(model.id)),
    [availableModels, selectedIds],
  );

  const toggleModel = (modelId) => {
    setSelectedIds((current) => (
      current.includes(modelId)
        ? current.filter((id) => id !== modelId)
        : [...current, modelId]
    ));
  };

  const handleConfirm = async () => {
    if (selectedModels.length === 0 || saving) return;
    setSaving(true);
    try {
      await onConfirm(selectedModels);
    } finally {
      setSaving(false);
    }
  };

  const allFilteredSelected = filteredModels.length > 0 && filteredModels.every((model) => selectedIds.includes(model.id));

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Add Fetched Models"
      size="lg"
      footer={(
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={handleConfirm} loading={saving} disabled={selectedModels.length === 0}>
            Add {selectedModels.length} Model{selectedModels.length === 1 ? "" : "s"}
          </Button>
        </>
      )}
    >
      {availableModels.length === 0 ? (
        <p className="text-sm text-text-muted">All fetched models have already been added.</p>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-text-muted">Choose the models to add to this provider.</p>
          <input
            type="search"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search models"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
          />
          <label className="flex cursor-pointer items-center gap-2 text-xs text-text-muted">
            <input
              type="checkbox"
              checked={allFilteredSelected}
              onChange={() => setSelectedIds((current) => {
                const filteredIds = filteredModels.map((model) => model.id);
                return allFilteredSelected
                  ? current.filter((id) => !filteredIds.includes(id))
                  : [...new Set([...current, ...filteredIds])];
              })}
            />
            Select all shown ({filteredModels.length})
          </label>
          <div className="max-h-80 overflow-y-auto rounded-lg border border-border custom-scrollbar">
            {filteredModels.map((model) => (
              <label key={model.id} className="flex cursor-pointer items-center gap-3 border-b border-border px-3 py-2 last:border-b-0 hover:bg-sidebar/50">
                <input
                  type="checkbox"
                  checked={selectedIds.includes(model.id)}
                  onChange={() => toggleModel(model.id)}
                />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-text-main">{model.name || model.id}</p>
                  {model.name && model.name !== model.id && (
                    <code className="text-xs text-text-muted">{model.id}</code>
                  )}
                </div>
              </label>
            ))}
            {filteredModels.length === 0 && (
              <p className="p-4 text-center text-sm text-text-muted">No matching models.</p>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}

ProviderModelsImportModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  models: PropTypes.arrayOf(PropTypes.shape({
    id: PropTypes.string.isRequired,
    name: PropTypes.string,
  })).isRequired,
  existingModelIds: PropTypes.arrayOf(PropTypes.string).isRequired,
  onConfirm: PropTypes.func.isRequired,
  onClose: PropTypes.func.isRequired,
};