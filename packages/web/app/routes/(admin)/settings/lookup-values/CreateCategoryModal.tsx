/**
 * Create Category Modal
 *
 * Form modal for creating a new lookup category.
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

interface CreateCategoryModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: { code: string; name: string; description?: string }) => void;
  isPending: boolean;
}

export function CreateCategoryModal({
  open,
  onClose,
  onSubmit,
  isPending,
}: CreateCategoryModalProps) {
  const toast = useToast();
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  function reset() {
    setCode("");
    setName("");
    setDescription("");
  }

  function handleClose() {
    if (!isPending) {
      reset();
      onClose();
    }
  }

  function handleSubmit() {
    const trimmedCode = code.trim();
    const trimmedName = name.trim();

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
    if (!trimmedName) {
      toast.error("Name is required");
      return;
    }

    onSubmit({
      code: trimmedCode,
      name: trimmedName,
      description: description.trim() || undefined,
    });
    reset();
  }

  return (
    <Modal open={open} onClose={handleClose} size="md">
      <ModalHeader title="Add Lookup Category" />
      <ModalBody>
        <div className="space-y-4">
          <Input
            label="Code"
            placeholder="e.g. employment_type"
            value={code}
            onChange={(e) => setCode(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
            required
            id="cat-code"
          />
          <p className="text-xs text-gray-500 -mt-2">
            Lowercase letters, digits, underscores only. Used as a machine-readable key.
          </p>
          <Input
            label="Name"
            placeholder="e.g. Employment Type"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            id="cat-name"
          />
          <Input
            label="Description"
            placeholder="Optional description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            id="cat-description"
          />
        </div>
      </ModalBody>
      <ModalFooter>
        <Button variant="outline" onClick={handleClose} disabled={isPending}>
          Cancel
        </Button>
        <Button
          onClick={handleSubmit}
          disabled={!code.trim() || !name.trim() || isPending}
          loading={isPending}
        >
          {isPending ? "Creating..." : "Create Category"}
        </Button>
      </ModalFooter>
    </Modal>
  );
}
