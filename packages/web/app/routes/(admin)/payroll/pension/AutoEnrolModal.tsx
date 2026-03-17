/**
 * Auto-Enrol Employee Modal
 *
 * Modal for auto-enrolling an eligible employee into the default
 * pension scheme.
 */

import { useState } from "react";
import {
  Modal,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
} from "~/components/ui";
import { useToast } from "~/components/ui/toast";

interface AutoEnrolModalProps {
  isPending: boolean;
  onSubmit: (employeeId: string) => void;
  onClose: () => void;
}

export function AutoEnrolModal({
  isPending,
  onSubmit,
  onClose,
}: AutoEnrolModalProps) {
  const toast = useToast();
  const [employeeId, setEmployeeId] = useState("");

  function handleSubmit() {
    const id = employeeId.trim();
    if (!id) {
      toast.error("Employee ID is required");
      return;
    }
    onSubmit(id);
  }

  function handleClose() {
    if (!isPending) {
      onClose();
    }
  }

  return (
    <Modal open onClose={handleClose}>
      <ModalHeader>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
          Auto-Enrol Employee
        </h3>
      </ModalHeader>
      <ModalBody>
        <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
          Enrol an eligible jobholder into the default pension scheme. The
          employee must be aged 22 to State Pension age and earning above
          £10,000/year.
        </p>
        <div>
          <label
            htmlFor="enrol-employee-id"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
          >
            Employee ID <span className="text-red-500">*</span>
          </label>
          <input
            id="enrol-employee-id"
            type="text"
            placeholder="Enter employee UUID"
            value={employeeId}
            onChange={(e) => setEmployeeId(e.target.value)}
            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-white"
          />
        </div>
      </ModalBody>
      <ModalFooter>
        <Button variant="outline" onClick={handleClose} disabled={isPending}>
          Cancel
        </Button>
        <Button
          onClick={handleSubmit}
          disabled={!employeeId.trim() || isPending}
        >
          {isPending ? "Enrolling..." : "Enrol"}
        </Button>
      </ModalFooter>
    </Modal>
  );
}
