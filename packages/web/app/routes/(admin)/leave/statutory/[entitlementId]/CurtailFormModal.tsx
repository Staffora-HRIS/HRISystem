/**
 * Curtail Form Modal
 *
 * Form modal for curtailing maternity or adoption leave to enable
 * Shared Parental Leave conversion.
 */

import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import {
  Modal,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
  Input,
  useToast,
} from "~/components/ui";
import { LEAVE_TYPE_LABELS } from "./types";

interface CurtailFormModalProps {
  leaveType: string;
  isPending: boolean;
  onSubmit: (payload: { curtailment_date: string }) => void;
  onClose: () => void;
}

export function CurtailFormModal({
  leaveType,
  isPending,
  onSubmit,
  onClose,
}: CurtailFormModalProps) {
  const toast = useToast();
  const [curtailDate, setCurtailDate] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!curtailDate) {
      toast.error("Please enter a curtailment date.");
      return;
    }
    onSubmit({ curtailment_date: curtailDate });
  }

  return (
    <Modal open onClose={onClose} size="md">
      <form onSubmit={handleSubmit}>
        <ModalHeader>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Curtail {LEAVE_TYPE_LABELS[leaveType] || leaveType} Leave
          </h3>
        </ModalHeader>
        <ModalBody>
          <div className="space-y-4">
            <div
              className="flex items-start gap-3 rounded-lg border border-yellow-200 bg-yellow-50 p-3 dark:border-yellow-800 dark:bg-yellow-900/20"
              role="alert"
            >
              <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-yellow-600 dark:text-yellow-400" />
              <div className="text-sm text-yellow-700 dark:text-yellow-300">
                <p className="font-medium">
                  Curtailing leave enables Shared Parental Leave
                </p>
                <p className="mt-1">
                  {leaveType === "maternity"
                    ? "Maternity leave must retain a minimum 2-week compulsory period after birth."
                    : "Adoption leave can be curtailed to convert remaining entitlement to Shared Parental Leave."}
                </p>
              </div>
            </div>
            <div>
              <label
                htmlFor="curtail-date"
                className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
              >
                Curtailment Date <span className="text-red-500">*</span>
              </label>
              <Input
                id="curtail-date"
                type="date"
                value={curtailDate}
                onChange={(e) => setCurtailDate(e.target.value)}
                required
              />
              <p className="mt-1 text-xs text-gray-500">
                The date when{" "}
                {LEAVE_TYPE_LABELS[leaveType]?.toLowerCase()}{" "}
                leave will end. Remaining weeks convert to ShPL
                entitlement.
              </p>
            </div>
          </div>
        </ModalBody>
        <ModalFooter>
          <Button
            variant="outline"
            type="button"
            onClick={onClose}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="danger"
            disabled={isPending}
          >
            {isPending ? "Curtailing..." : "Curtail Leave"}
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  );
}
