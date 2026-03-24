/**
 * Edit Employee Modal
 *
 * Form modal for editing basic employee details (name, email, work phone).
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
import type { EmployeeDetail } from "./types";

interface EditEmployeeModalProps {
  employee: EmployeeDetail;
  onClose: () => void;
  onSave: (data: { firstName: string; lastName: string; email: string; workPhone: string }) => void;
  isPending: boolean;
}

export function EditEmployeeModal({
  employee,
  onClose,
  onSave,
  isPending,
}: EditEmployeeModalProps) {
  const [firstName, setFirstName] = useState(employee.firstName);
  const [lastName, setLastName] = useState(employee.lastName);
  const [email, setEmail] = useState(employee.email);
  const [workPhone, setWorkPhone] = useState(employee.workPhone || "");

  return (
    <Modal open onClose={onClose} size="lg">
      <ModalHeader>
        <h3 className="text-lg font-semibold">Edit Employee</h3>
      </ModalHeader>
      <ModalBody>
        <div className="grid grid-cols-2 gap-4">
          <Input
            label="First Name"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
          />
          <Input
            label="Last Name"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
          />
          <Input
            label="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Input
            label="Work Phone"
            value={workPhone}
            onChange={(e) => setWorkPhone(e.target.value)}
          />
        </div>
      </ModalBody>
      <ModalFooter>
        <Button variant="outline" onClick={onClose} disabled={isPending}>
          Cancel
        </Button>
        <Button
          disabled={!firstName || !lastName || isPending}
          loading={isPending}
          onClick={() => onSave({ firstName, lastName, email, workPhone })}
        >
          {isPending ? "Saving..." : "Save Changes"}
        </Button>
      </ModalFooter>
    </Modal>
  );
}
