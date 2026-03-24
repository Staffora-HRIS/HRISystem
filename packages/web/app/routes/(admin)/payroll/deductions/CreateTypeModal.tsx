/**
 * Create Deduction Type Modal
 *
 * Form modal for creating a new deduction type with name, code,
 * category, calculation method, and statutory/voluntary flag.
 */

import { useState } from "react";
import {
  Modal,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
  Input,
  Select,
} from "~/components/ui";
import {
  INITIAL_TYPE_FORM,
  CATEGORY_OPTIONS,
  METHOD_OPTIONS,
} from "./types";
import type { CreateTypeForm } from "./types";

interface CreateTypeModalProps {
  onClose: () => void;
  onSubmit: (form: CreateTypeForm) => void;
  isPending: boolean;
}

export function CreateTypeModal({ onClose, onSubmit, isPending }: CreateTypeModalProps) {
  const [form, setForm] = useState<CreateTypeForm>(INITIAL_TYPE_FORM);

  function handleClose() {
    if (!isPending) {
      setForm(INITIAL_TYPE_FORM);
      onClose();
    }
  }

  return (
    <Modal open onClose={handleClose} size="md">
      <ModalHeader>
        <h3 className="text-lg font-semibold">Add Deduction Type</h3>
      </ModalHeader>
      <ModalBody>
        <div className="space-y-4">
          <Input
            label="Name"
            placeholder="e.g. PAYE Income Tax"
            required
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <Input
            label="Code"
            placeholder="e.g. PAYE"
            required
            value={form.code}
            onChange={(e) => setForm({ ...form, code: e.target.value })}
          />
          <Select
            label="Category"
            value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value })}
            options={CATEGORY_OPTIONS}
          />
          <Select
            label="Calculation Method"
            value={form.calculation_method}
            onChange={(e) => setForm({ ...form, calculation_method: e.target.value })}
            options={METHOD_OPTIONS}
          />
          <Select
            label="Type"
            value={form.is_statutory ? "true" : "false"}
            onChange={(e) => setForm({ ...form, is_statutory: e.target.value === "true" })}
            options={[
              { value: "false", label: "Voluntary" },
              { value: "true", label: "Statutory" },
            ]}
          />
        </div>
      </ModalBody>
      <ModalFooter>
        <Button variant="outline" onClick={handleClose} disabled={isPending}>
          Cancel
        </Button>
        <Button
          onClick={() => onSubmit(form)}
          disabled={!form.name.trim() || !form.code.trim() || isPending}
        >
          {isPending ? "Creating..." : "Add Type"}
        </Button>
      </ModalFooter>
    </Modal>
  );
}
