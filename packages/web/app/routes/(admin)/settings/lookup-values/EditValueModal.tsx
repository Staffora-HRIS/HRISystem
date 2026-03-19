/**
 * Edit Value Modal
 *
 * Form modal for editing an existing lookup value.
 */

import { useState } from "react";
import {
  Button,
  Input,
  Modal,
  ModalHeader,
  ModalBody,
  ModalFooter,
} from "~/components/ui";
import type { LookupValue } from "./types";

interface EditValueModalProps {
  value: LookupValue;
  open: boolean;
  onClose: () => void;
  onSubmit: (data: {
    label?: string;
    description?: string | null;
    sortOrder?: number;
    isDefault?: boolean;
    isActive?: boolean;
  }) => void;
  isPending: boolean;
}

export function EditValueModal({
  value,
  open,
  onClose,
  onSubmit,
  isPending,
}: EditValueModalProps) {
  const [label, setLabel] = useState(value.label);
  const [description, setDescription] = useState(value.description || "");
  const [sortOrder, setSortOrder] = useState(String(value.sortOrder));
  const [isDefault, setIsDefault] = useState(value.isDefault);
  const [isActive, setIsActive] = useState(value.isActive);

  function handleClose() {
    if (!isPending) onClose();
  }

  function handleSubmit() {
    const changes: Record<string, unknown> = {};
    if (label.trim() !== value.label) changes.label = label.trim();
    if ((description.trim() || null) !== value.description)
      changes.description = description.trim() || null;
    if (Number(sortOrder) !== value.sortOrder)
      changes.sortOrder = Number(sortOrder) || 0;
    if (isDefault !== value.isDefault) changes.isDefault = isDefault;
    if (isActive !== value.isActive) changes.isActive = isActive;

    if (Object.keys(changes).length === 0) {
      onClose();
      return;
    }
    onSubmit(changes as any);
  }

  return (
    <Modal open={open} onClose={handleClose} size="md">
      <ModalHeader title={`Edit Value: ${value.code}`} />
      <ModalBody>
        <div className="space-y-4">
          <Input
            label="Label"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            required
            id="edit-val-label"
          />
          <Input
            label="Description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            id="edit-val-description"
          />
          <Input
            label="Sort Order"
            type="number"
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value)}
            id="edit-val-sort-order"
          />
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={isDefault}
                onChange={(e) => setIsDefault(e.target.checked)}
                id="edit-val-default"
                className="h-4 w-4 rounded border-gray-300"
              />
              <label htmlFor="edit-val-default" className="text-sm">
                Default
              </label>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                id="edit-val-active"
                className="h-4 w-4 rounded border-gray-300"
              />
              <label htmlFor="edit-val-active" className="text-sm">
                Active
              </label>
            </div>
          </div>
        </div>
      </ModalBody>
      <ModalFooter>
        <Button variant="outline" onClick={handleClose} disabled={isPending}>
          Cancel
        </Button>
        <Button onClick={handleSubmit} disabled={isPending} loading={isPending}>
          {isPending ? "Saving..." : "Save Changes"}
        </Button>
      </ModalFooter>
    </Modal>
  );
}
