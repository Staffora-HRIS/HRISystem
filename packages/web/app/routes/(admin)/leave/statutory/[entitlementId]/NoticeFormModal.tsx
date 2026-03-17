/**
 * Notice Form Modal
 *
 * Form modal for recording a formal statutory notice (MATB1, SC3,
 * ShPL opt-in, etc.) against a family leave entitlement.
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
  Textarea,
  useToast,
} from "~/components/ui";
import { NOTICE_TYPE_OPTIONS } from "./types";

interface NoticeFormModalProps {
  isPending: boolean;
  onSubmit: (payload: {
    notice_type: string;
    notice_date: string;
    document_reference?: string;
    notes?: string;
  }) => void;
  onClose: () => void;
}

export function NoticeFormModal({
  isPending,
  onSubmit,
  onClose,
}: NoticeFormModalProps) {
  const toast = useToast();
  const [noticeType, setNoticeType] = useState("");
  const [noticeDate, setNoticeDate] = useState("");
  const [noticeRef, setNoticeRef] = useState("");
  const [noticeNotes, setNoticeNotes] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!noticeType || !noticeDate) {
      toast.error("Please fill in all required fields.");
      return;
    }
    onSubmit({
      notice_type: noticeType,
      notice_date: noticeDate,
      document_reference: noticeRef || undefined,
      notes: noticeNotes || undefined,
    });
  }

  return (
    <Modal open onClose={onClose} size="md">
      <form onSubmit={handleSubmit}>
        <ModalHeader>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Record Formal Notice
          </h3>
        </ModalHeader>
        <ModalBody>
          <div className="space-y-4">
            <div>
              <label
                htmlFor="notice-type"
                className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
              >
                Notice Type <span className="text-red-500">*</span>
              </label>
              <Select
                id="notice-type"
                value={noticeType}
                onChange={(e) => setNoticeType(e.target.value)}
                options={NOTICE_TYPE_OPTIONS}
                required
              />
            </div>
            <div>
              <label
                htmlFor="notice-date"
                className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
              >
                Notice Date <span className="text-red-500">*</span>
              </label>
              <Input
                id="notice-date"
                type="date"
                value={noticeDate}
                onChange={(e) => setNoticeDate(e.target.value)}
                required
              />
            </div>
            <div>
              <label
                htmlFor="notice-ref"
                className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
              >
                Document Reference
              </label>
              <Input
                id="notice-ref"
                value={noticeRef}
                onChange={(e) => setNoticeRef(e.target.value)}
                placeholder="e.g. MATB1-2026-001"
              />
            </div>
            <div>
              <label
                htmlFor="notice-notes"
                className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
              >
                Notes
              </label>
              <Textarea
                id="notice-notes"
                value={noticeNotes}
                onChange={(e) => setNoticeNotes(e.target.value)}
                rows={2}
                placeholder="Optional notes about this notice"
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
            {isPending ? "Recording..." : "Record Notice"}
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  );
}
