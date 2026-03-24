/**
 * Create Employee Deduction Modal
 *
 * Form modal for assigning a deduction to an employee with amount or
 * percentage, effective dates, and optional reference.
 */

import { useState } from "react";
import {
  Modal,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
  Input,
} from "~/components/ui";
import { INITIAL_DEDUCTION_FORM } from "./types";
import type { CreateDeductionForm } from "./types";

interface CreateDeductionModalProps {
  onClose: () => void;
  onSubmit: (form: CreateDeductionForm) => void;
  isPending: boolean;
}

export function CreateDeductionModal({ onClose, onSubmit, isPending }: CreateDeductionModalProps) {
  const [form, setForm] = useState<CreateDeductionForm>(INITIAL_DEDUCTION_FORM);

  function handleClose() {
    if (!isPending) {
      setForm(INITIAL_DEDUCTION_FORM);
      onClose();
    }
  }

  return (
    <Modal open onClose={handleClose} size="md">
      <ModalHeader>
        <h3 className="text-lg font-semibold">Add Employee Deduction</h3>
      </ModalHeader>
      <ModalBody>
        <div className="space-y-4">
          <Input
            label="Employee ID"
            placeholder="UUID"
            required
            value={form.employee_id}
            onChange={(e) => setForm({ ...form, employee_id: e.target.value })}
          />
          <Input
            label="Deduction Type ID"
            placeholder="UUID"
            required
            value={form.deduction_type_id}
            onChange={(e) => setForm({ ...form, deduction_type_id: e.target.value })}
          />
          <Input
            label="Amount (fixed)"
            type="number"
            placeholder="0.00"
            value={form.amount}
            onChange={(e) => setForm({ ...form, amount: e.target.value })}
            min={0}
            step="0.01"
          />
          <Input
            label="Percentage"
            type="number"
            placeholder="0.00"
            value={form.percentage}
            onChange={(e) => setForm({ ...form, percentage: e.target.value })}
            min={0}
            max={100}
            step="0.01"
          />
          <Input
            label="Reference (optional)"
            placeholder="e.g. Court order number"
            value={form.reference}
            onChange={(e) => setForm({ ...form, reference: e.target.value })}
          />
          <Input
            label="Effective From"
            type="date"
            required
            value={form.effective_from}
            onChange={(e) => setForm({ ...form, effective_from: e.target.value })}
          />
          <Input
            label="Effective To (optional)"
            type="date"
            value={form.effective_to}
            onChange={(e) => setForm({ ...form, effective_to: e.target.value })}
          />
        </div>
      </ModalBody>
      <ModalFooter>
        <Button variant="outline" onClick={handleClose} disabled={isPending}>
          Cancel
        </Button>
        <Button
          onClick={() => onSubmit(form)}
          disabled={
            !form.employee_id.trim() ||
            !form.deduction_type_id.trim() ||
            isPending
          }
        >
          {isPending ? "Creating..." : "Add Deduction"}
        </Button>
      </ModalFooter>
    </Modal>
  );
}
