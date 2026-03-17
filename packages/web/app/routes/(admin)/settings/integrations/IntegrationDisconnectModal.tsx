/**
 * Integration Disconnect Confirmation Modal
 *
 * Confirmation dialog for disconnecting an integration and clearing
 * its stored credentials.
 */

import {
  Modal,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
} from "~/components/ui";

interface IntegrationDisconnectModalProps {
  integrationName: string;
  isPending: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

export function IntegrationDisconnectModal({
  integrationName,
  isPending,
  onConfirm,
  onClose,
}: IntegrationDisconnectModalProps) {
  function handleClose() {
    if (!isPending) {
      onClose();
    }
  }

  return (
    <Modal open={true} onClose={handleClose} size="sm">
      <ModalHeader>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
          Disconnect {integrationName}?
        </h3>
      </ModalHeader>
      <ModalBody>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          This will remove the connection and clear stored credentials for{" "}
          <strong>{integrationName}</strong>. You can reconnect at any time.
        </p>
      </ModalBody>
      <ModalFooter>
        <Button variant="outline" onClick={handleClose} disabled={isPending}>
          Cancel
        </Button>
        <Button
          variant="primary"
          onClick={onConfirm}
          disabled={isPending}
          loading={isPending}
          className="bg-red-600 hover:bg-red-700 text-white"
        >
          {isPending ? "Disconnecting..." : "Disconnect"}
        </Button>
      </ModalFooter>
    </Modal>
  );
}
