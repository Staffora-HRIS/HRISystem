/**
 * Integration Configuration Modal
 *
 * Form modal for connecting a new integration or updating the
 * configuration of an existing connected integration.
 */

import { useState } from "react";
import { ExternalLink } from "lucide-react";
import {
  Modal,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
  Input,
  useToast,
} from "~/components/ui";
import type { IntegrationResponse } from "./types";
import { getProviderMeta } from "./types";

interface IntegrationConfigModalProps {
  provider: string;
  existingIntegration: IntegrationResponse | undefined;
  isConnecting: boolean;
  isUpdating: boolean;
  onConnect: (data: {
    provider: string;
    name: string;
    description?: string;
    category: string;
    config?: { api_key?: string; api_secret?: string; webhook_url?: string };
    webhook_url?: string;
  }) => void;
  onUpdateConfig: (data: {
    id: string;
    config?: { api_key?: string; api_secret?: string; webhook_url?: string };
    webhook_url?: string;
  }) => void;
  onClose: () => void;
}

export function IntegrationConfigModal({
  provider,
  existingIntegration,
  isConnecting,
  isUpdating,
  onConnect,
  onUpdateConfig,
  onClose,
}: IntegrationConfigModalProps) {
  const toast = useToast();
  const [formApiKey, setFormApiKey] = useState("");
  const [formApiSecret, setFormApiSecret] = useState("");
  const [formWebhookUrl, setFormWebhookUrl] = useState("");

  const catalogEntry = getProviderMeta(provider);
  const isEditMode = existingIntegration?.status === "connected";
  const isSaving = isConnecting || isUpdating;

  function handleClose() {
    if (!isSaving) {
      onClose();
    }
  }

  function handleSave() {
    if (!formApiKey.trim() && !formApiSecret.trim() && !formWebhookUrl.trim()) {
      toast.error("At least one credential field (API Key, API Secret, or Webhook URL) is required");
      return;
    }

    const configPayload: {
      api_key?: string;
      api_secret?: string;
      webhook_url?: string;
    } = {};
    if (formApiKey.trim()) configPayload.api_key = formApiKey.trim();
    if (formApiSecret.trim()) configPayload.api_secret = formApiSecret.trim();
    if (formWebhookUrl.trim()) configPayload.webhook_url = formWebhookUrl.trim();

    if (isEditMode && existingIntegration) {
      onUpdateConfig({
        id: existingIntegration.id,
        config: configPayload,
        webhook_url: formWebhookUrl.trim() || undefined,
      });
    } else {
      onConnect({
        provider,
        name: catalogEntry?.name ?? provider,
        description: catalogEntry?.description,
        category: catalogEntry?.category ?? "Other",
        config: configPayload,
        webhook_url: formWebhookUrl.trim() || undefined,
      });
    }
  }

  return (
    <Modal open={true} onClose={handleClose} size="md">
      <ModalHeader>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
          {isEditMode ? "Configure" : "Connect"}{" "}
          {catalogEntry?.name ?? provider}
        </h3>
      </ModalHeader>
      <ModalBody className="space-y-4">
        <p className="text-sm text-gray-600 dark:text-gray-400">
          {catalogEntry?.description}
        </p>

        <div className="space-y-4">
          <div>
            <label
              htmlFor="integration-api-key"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
            >
              API Key / Client ID
            </label>
            <Input
              id="integration-api-key"
              placeholder="Enter your API key or Client ID"
              value={formApiKey}
              onChange={(e) => setFormApiKey(e.target.value)}
              autoComplete="off"
            />
          </div>
          <div>
            <label
              htmlFor="integration-api-secret"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
            >
              API Secret / Client Secret
            </label>
            <Input
              id="integration-api-secret"
              type="password"
              placeholder="Enter your API secret"
              value={formApiSecret}
              onChange={(e) => setFormApiSecret(e.target.value)}
              autoComplete="off"
            />
          </div>
          <div>
            <label
              htmlFor="integration-webhook-url"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
            >
              Webhook URL (Optional)
            </label>
            <Input
              id="integration-webhook-url"
              placeholder="https://your-domain.com/webhook"
              value={formWebhookUrl}
              onChange={(e) => setFormWebhookUrl(e.target.value)}
              autoComplete="off"
            />
          </div>
        </div>

        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
          <div className="flex items-start gap-2">
            <ExternalLink className="h-4 w-4 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
            <div className="text-sm">
              <p className="font-medium text-blue-800 dark:text-blue-300">
                Need help?
              </p>
              <p className="text-blue-700 dark:text-blue-400">
                Visit the {catalogEntry?.name ?? provider} documentation for
                setup instructions.
              </p>
            </div>
          </div>
        </div>
      </ModalBody>
      <ModalFooter>
        <Button variant="outline" onClick={handleClose} disabled={isSaving}>
          Cancel
        </Button>
        <Button onClick={handleSave} disabled={isSaving} loading={isSaving}>
          {isSaving
            ? isEditMode
              ? "Saving..."
              : "Connecting..."
            : isEditMode
              ? "Save Configuration"
              : "Save & Connect"}
        </Button>
      </ModalFooter>
    </Modal>
  );
}
