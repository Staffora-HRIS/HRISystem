/**
 * Schedule Assessment Modal
 *
 * Form modal for scheduling a candidate assessment.
 */

import { useState } from "react";
import { Button } from "~/components/ui/button";
import { Modal, ModalHeader, ModalBody, ModalFooter } from "~/components/ui/modal";
import { emptyScheduleForm } from "./types";
import type { ScheduleAssessmentData } from "./types";

interface ScheduleAssessmentModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: ScheduleAssessmentData) => void;
  isPending: boolean;
}

export function ScheduleAssessmentModal({
  open,
  onClose,
  onSubmit,
  isPending,
}: ScheduleAssessmentModalProps) {
  const [form, setForm] = useState<ScheduleAssessmentData>({ ...emptyScheduleForm });

  function handleClose() {
    if (!isPending) {
      setForm({ ...emptyScheduleForm });
      onClose();
    }
  }

  return (
    <Modal open={open} onClose={handleClose} size="md">
      <ModalHeader>
        <h3 className="text-lg font-semibold">Schedule Assessment</h3>
      </ModalHeader>
      <ModalBody>
        <div className="space-y-4">
          <div>
            <label htmlFor="sched-candidate" className="block text-sm font-medium text-gray-700 mb-1">
              Candidate ID <span className="text-red-500">*</span>
            </label>
            <input
              id="sched-candidate"
              type="text"
              value={form.candidateId}
              onChange={(e) => setForm({ ...form, candidateId: e.target.value })}
              className="w-full rounded-md border border-gray-300 p-2"
              placeholder="Enter candidate UUID"
            />
          </div>
          <div>
            <label htmlFor="sched-template" className="block text-sm font-medium text-gray-700 mb-1">
              Template ID <span className="text-red-500">*</span>
            </label>
            <input
              id="sched-template"
              type="text"
              value={form.templateId}
              onChange={(e) => setForm({ ...form, templateId: e.target.value })}
              className="w-full rounded-md border border-gray-300 p-2"
              placeholder="Enter template UUID"
            />
          </div>
          <div>
            <label htmlFor="sched-date" className="block text-sm font-medium text-gray-700 mb-1">
              Scheduled Date/Time
            </label>
            <input
              id="sched-date"
              type="datetime-local"
              value={form.scheduledAt}
              onChange={(e) => setForm({ ...form, scheduledAt: e.target.value })}
              className="w-full rounded-md border border-gray-300 p-2"
            />
          </div>
        </div>
      </ModalBody>
      <ModalFooter>
        <Button variant="outline" onClick={handleClose} disabled={isPending}>
          Cancel
        </Button>
        <Button
          onClick={() => {
            onSubmit(form);
            setForm({ ...emptyScheduleForm });
          }}
          disabled={
            !form.candidateId.trim() ||
            !form.templateId.trim() ||
            isPending
          }
        >
          {isPending ? "Scheduling..." : "Schedule"}
        </Button>
      </ModalFooter>
    </Modal>
  );
}
