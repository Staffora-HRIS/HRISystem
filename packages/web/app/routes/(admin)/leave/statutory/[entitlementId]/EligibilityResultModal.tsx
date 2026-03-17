/**
 * Eligibility Result Modal
 *
 * Displays the result of a family leave eligibility check, including
 * service weeks, qualifying week, earnings status, and detailed reasons.
 */

import { CheckCircle, AlertTriangle } from "lucide-react";
import {
  Modal,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
} from "~/components/ui";
import type { EligibilityData } from "./types";
import { formatDate, LEAVE_TYPE_LABELS } from "./types";

interface EligibilityResultModalProps {
  result: EligibilityData;
  onClose: () => void;
}

export function EligibilityResultModal({
  result,
  onClose,
}: EligibilityResultModalProps) {
  return (
    <Modal open onClose={onClose} size="md">
      <ModalHeader>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
          Eligibility Check Result
        </h3>
      </ModalHeader>
      <ModalBody>
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            {result.eligible ? (
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
                <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
              </div>
            ) : (
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
                <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400" />
              </div>
            )}
            <div>
              <p className="text-lg font-semibold text-gray-900 dark:text-white">
                {result.eligible ? "Eligible" : "Not Eligible"}
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {LEAVE_TYPE_LABELS[result.leave_type] || result.leave_type}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 rounded-lg border border-gray-200 p-4 dark:border-gray-700">
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Continuous Service
              </p>
              <p className="text-sm font-medium text-gray-900 dark:text-white">
                {result.continuous_service_weeks} weeks
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Required
              </p>
              <p className="text-sm font-medium text-gray-900 dark:text-white">
                {result.required_weeks} weeks
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Qualifying Week
              </p>
              <p className="text-sm font-medium text-gray-900 dark:text-white">
                {formatDate(result.qualifying_week)}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Earnings Above LEL
              </p>
              <p className="text-sm font-medium text-gray-900 dark:text-white">
                {result.earnings_above_lel == null
                  ? "Unknown"
                  : result.earnings_above_lel
                    ? "Yes"
                    : "No"}
              </p>
            </div>
          </div>

          {result.reasons.length > 0 && (
            <div>
              <p className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                Details
              </p>
              <ul className="space-y-1">
                {result.reasons.map((reason, idx) => (
                  <li
                    key={idx}
                    className="flex items-start gap-2 text-sm text-gray-600 dark:text-gray-400"
                  >
                    <span className="mt-1 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-gray-400" />
                    {reason}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </ModalBody>
      <ModalFooter>
        <Button onClick={onClose}>Close</Button>
      </ModalFooter>
    </Modal>
  );
}
