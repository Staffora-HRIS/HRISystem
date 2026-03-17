/**
 * KIT Day Form Modal
 *
 * Form modal for recording a Keeping In Touch (KIT) or SPLIT day
 * during family leave.
 */

import { useState } from "react";
import {
  Modal,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
  Input,
  Textarea,
  useToast,
} from "~/components/ui";

interface KitDayFormModalProps {
  isSharedParental: boolean;
  kitDaysRemaining: number;
  kitDayMax: number;
  isPending: boolean;
  onSubmit: (payload: {
    work_date: string;
    hours_worked: number;
    notes?: string;
  }) => void;
  onClose: () => void;
}

export function KitDayFormModal({
  isSharedParental,
  kitDaysRemaining,
  kitDayMax,
  isPending,
  onSubmit,
  onClose,
}: KitDayFormModalProps) {
  const toast = useToast();
  const [kitDate, setKitDate] = useState("");
  const [kitHours, setKitHours] = useState("");
  const [kitNotes, setKitNotes] = useState("");

  const dayType = isSharedParental ? "SPLIT" : "KIT";

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!kitDate || !kitHours) {
      toast.error("Please fill in the date and hours.");
      return;
    }
    onSubmit({
      work_date: kitDate,
      hours_worked: parseFloat(kitHours),
      notes: kitNotes || undefined,
    });
  }

  return (
    <Modal open onClose={onClose} size="md">
      <form onSubmit={handleSubmit}>
        <ModalHeader>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Record {dayType} Day
          </h3>
        </ModalHeader>
        <ModalBody>
          <div className="space-y-4">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {kitDaysRemaining} of {kitDayMax} {dayType} days remaining.
            </p>
            <div>
              <label
                htmlFor="kit-date"
                className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
              >
                Work Date <span className="text-red-500">*</span>
              </label>
              <Input
                id="kit-date"
                type="date"
                value={kitDate}
                onChange={(e) => setKitDate(e.target.value)}
                required
              />
            </div>
            <div>
              <label
                htmlFor="kit-hours"
                className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
              >
                Hours Worked <span className="text-red-500">*</span>
              </label>
              <Input
                id="kit-hours"
                type="number"
                step="0.5"
                min="0.5"
                max="24"
                value={kitHours}
                onChange={(e) => setKitHours(e.target.value)}
                required
              />
            </div>
            <div>
              <label
                htmlFor="kit-notes"
                className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
              >
                Notes
              </label>
              <Textarea
                id="kit-notes"
                value={kitNotes}
                onChange={(e) => setKitNotes(e.target.value)}
                rows={2}
                placeholder={`Optional notes about the ${dayType} day`}
              />
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
          <Button type="submit" disabled={isPending}>
            {isPending ? "Recording..." : "Record"}
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  );
}
