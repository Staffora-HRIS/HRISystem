/**
 * Edit Category Modal
 *
 * Form modal for editing an existing lookup category.
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
import type { LookupCategory } from "./types";

interface EditCategoryModalProps {
  category: LookupCategory;
  open: boolean;
  onClose: () => void;
  onSubmit: (data: {
    name?: string;
    description?: string | null;
    isActive?: boolean;
  }) => void;
  isPending: boolean;
}

export function EditCategoryModal({
  category,
  open,
  onClose,
  onSubmit,
  isPending,
}: EditCategoryModalProps) {
  const [name, setName] = useState(category.name);
  const [description, setDescription] = useState(category.description || "");
  const [isActive, setIsActive] = useState(category.isActive);

  function handleClose() {
    if (!isPending) onClose();
  }

  function handleSubmit() {
    const changes: Record<string, unknown> = {};
    if (name.trim() !== category.name) changes.name = name.trim();
    if ((description.trim() || null) !== category.description)
      changes.description = description.trim() || null;
    if (isActive !== category.isActive) changes.isActive = isActive;

    if (Object.keys(changes).length === 0) {
      onClose();
      return;
    }
    onSubmit(changes as any);
  }

  return (
    <Modal open={open} onClose={handleClose} size="md">
      <ModalHeader title={`Edit Category: ${category.code}`} />
      <ModalBody>
        <div className="space-y-4">
          <Input
            label="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            id="edit-cat-name"
          />
          <Input
            label="Description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            id="edit-cat-description"
          />
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              id="edit-cat-active"
              className="h-4 w-4 rounded border-gray-300"
            />
            <label htmlFor="edit-cat-active" className="text-sm">
              Active
            </label>
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
