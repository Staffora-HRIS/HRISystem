/**
 * Create Template Modal
 *
 * Form modal for creating a new assessment template.
 */

import { useState } from "react";
import { Button } from "~/components/ui/button";
import { Modal, ModalHeader, ModalBody, ModalFooter } from "~/components/ui/modal";
import { typeLabels, emptyTemplateForm } from "./types";
import type { CreateTemplateData } from "./types";

interface CreateTemplateModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: CreateTemplateData) => void;
  isPending: boolean;
}

export function CreateTemplateModal({
  open,
  onClose,
  onSubmit,
  isPending,
}: CreateTemplateModalProps) {
  const [form, setForm] = useState<CreateTemplateData>({ ...emptyTemplateForm });

  function handleClose() {
    if (!isPending) {
      setForm({ ...emptyTemplateForm });
      onClose();
    }
  }

  return (
    <Modal open={open} onClose={handleClose} size="md">
      <ModalHeader>
        <h3 className="text-lg font-semibold">New Assessment Template</h3>
      </ModalHeader>
      <ModalBody>
        <div className="space-y-4">
          <div>
            <label htmlFor="tmpl-name" className="block text-sm font-medium text-gray-700 mb-1">
              Name <span className="text-red-500">*</span>
            </label>
            <input
              id="tmpl-name"
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full rounded-md border border-gray-300 p-2"
              placeholder="Technical Interview Assessment"
            />
          </div>
          <div>
            <label htmlFor="tmpl-type" className="block text-sm font-medium text-gray-700 mb-1">
              Type <span className="text-red-500">*</span>
            </label>
            <select
              id="tmpl-type"
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value })}
              className="w-full rounded-md border border-gray-300 p-2"
            >
              {Object.entries(typeLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="tmpl-desc" className="block text-sm font-medium text-gray-700 mb-1">
              Description
            </label>
            <textarea
              id="tmpl-desc"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="w-full rounded-md border border-gray-300 p-2"
              rows={3}
              placeholder="Describe the assessment..."
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="tmpl-time" className="block text-sm font-medium text-gray-700 mb-1">
                Time Limit (minutes)
              </label>
              <input
                id="tmpl-time"
                type="number"
                value={form.timeLimitMinutes}
                onChange={(e) => setForm({ ...form, timeLimitMinutes: e.target.value })}
                className="w-full rounded-md border border-gray-300 p-2"
                min="1"
                placeholder="60"
              />
            </div>
            <div>
              <label htmlFor="tmpl-pass" className="block text-sm font-medium text-gray-700 mb-1">
                Pass Mark (%)
              </label>
              <input
                id="tmpl-pass"
                type="number"
                value={form.passMark}
                onChange={(e) => setForm({ ...form, passMark: e.target.value })}
                className="w-full rounded-md border border-gray-300 p-2"
                min="0"
                max="100"
                placeholder="70"
              />
            </div>
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
            setForm({ ...emptyTemplateForm });
          }}
          disabled={!form.name.trim() || isPending}
        >
          {isPending ? "Creating..." : "Create Template"}
        </Button>
      </ModalFooter>
    </Modal>
  );
}
