/**
 * Create Value Modal
 *
 * Form modal for creating a new lookup value within a category.
 */

import { useState } from "react";
import {
  Button,
  Input,
  Modal,
  ModalHeader,
  ModalBody,
  ModalFooter,
  useToast,
} from "~/components/ui";

interface CreateValueModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: {
    code: string;
    label: string;
    description?: string;
    sortOrder?: number;
    isDefault?: boolean;
  }) => void;
  isPending: boolean;
}

export function CreateValueModal({
  open,
  onClose,
  onSubmit,
  isPending,
}: CreateValueModalProps) {
  const toast = useToast();
  const [code, setCode] = useState("");
  const [label, setLabel] = useState("");
  const [description, setDescription] = useState("");
  const [sortOrder, setSortOrder] = useState("0");
  const [isDefault, setIsDefault] = useState(false);

  function reset() {
    setCode("");
    setLabel("");
    setDescription("");
    setSortOrder("0");
    setIsDefault(false);
  }

  function handleClose() {
    if (!isPending) {
      reset();
      onClose();
    }
  }

  function handleSubmit() {
    const trimmedCode = code.trim();
    const trimmedLabel = label.trim();

    if (!trimmedCode) {
      toast.error("Code is required");
      return;
    }
    if (!/^[a-z][a-z0-9_]*$/.test(trimmedCode)) {
      toast.error(
        "Code must start with a lowercase letter and contain only lowercase letters, digits, and underscores"
      );
      return;
    }
    if (!trimmedLabel) {
      toast.error("Label is required");
      return;
    }

    onSubmit({
      code: trimmedCode,
      label: trimmedLabel,
      description: description.trim() || undefined,
      sortOrder: Number(sortOrder) || 0,
      isDefault,
    });
    reset();
  }

  return (
    <Modal open={open} onClose={handleClose} size="md">
      <ModalHeader title="Add Lookup Value" />
      <ModalBody>
        <div className="space-y-4">
          <Input
            label="Code"
            placeholder="e.g. full_time"
            value={code}
            onChange={(e) => setCode(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
            required
            id="val-code"
          />
          <p className="text-xs text-gray-500 -mt-2">
            Machine-readable key. Lowercase, digits, underscores.
          </p>
          <Input
            label="Label"
            placeholder="e.g. Full Time"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            required
            id="val-label"
          />
          <Input
            label="Description"
            placeholder="Optional description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            id="val-description"
          />
          <Input
            label="Sort Order"
            type="number"
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value)}
            id="val-sort-order"
          />
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={isDefault}
              onChange={(e) => setIsDefault(e.target.checked)}
              id="val-is-default"
              className="h-4 w-4 rounded border-gray-300"
            />
            <label htmlFor="val-is-default" className="text-sm">
              Default selection
            </label>
          </div>
        </div>
      </ModalBody>
      <ModalFooter>
        <Button variant="outline" onClick={handleClose} disabled={isPending}>
          Cancel
        </Button>
        <Button
          onClick={handleSubmit}
          disabled={!code.trim() || !label.trim() || isPending}
          loading={isPending}
        >
          {isPending ? "Creating..." : "Add Value"}
        </Button>
      </ModalFooter>
    </Modal>
  );
}
