import { useState } from "react";
import {
  Link2,
  CheckCircle2,
  XCircle,
  Settings,
  ExternalLink,
  RefreshCw,
  Shield,
  CreditCard,
  MessageSquare,
  FileSignature,
  Briefcase,
  Calendar,
  Search,
} from "lucide-react";
import {
  Card,
  CardBody,
  Button,
  Badge,
  Input,
  Modal,
  ModalHeader,
  ModalBody,
  ModalFooter,
  toast,
} from "~/components/ui";

interface Integration {
  id: string;
  name: string;
  description: string;
  category: string;
  icon: React.ComponentType<{ className?: string }>;
  status: "connected" | "disconnected" | "error";
  lastSync?: string;
  configUrl?: string;
}

const INTEGRATIONS: Integration[] = [
  {
    id: "azure-ad",
    name: "Azure Active Directory",
    description: "Single sign-on and user provisioning with Microsoft Azure AD",
    category: "Identity & SSO",
    icon: Shield,
    status: "disconnected",
  },
  {
    id: "okta",
    name: "Okta",
    description: "Enterprise identity and access management",
    category: "Identity & SSO",
    icon: Shield,
    status: "disconnected",
  },
  {
    id: "adp",
    name: "ADP Workforce Now",
    description: "Payroll and HR data synchronization",
    category: "Payroll",
    icon: CreditCard,
    status: "disconnected",
  },
  {
    id: "paychex",
    name: "Paychex",
    description: "Payroll processing and tax services integration",
    category: "Payroll",
    icon: CreditCard,
    status: "disconnected",
  },
  {
    id: "slack",
    name: "Slack",
    description: "Send notifications and updates to Slack channels",
    category: "Communication",
    icon: MessageSquare,
    status: "connected",
    lastSync: "2 hours ago",
  },
  {
    id: "teams",
    name: "Microsoft Teams",
    description: "Integrate with Microsoft Teams for notifications",
    category: "Communication",
    icon: MessageSquare,
    status: "disconnected",
  },
  {
    id: "docusign",
    name: "DocuSign",
    description: "Electronic signatures for HR documents",
    category: "E-Signature",
    icon: FileSignature,
    status: "connected",
    lastSync: "1 day ago",
  },
  {
    id: "adobe-sign",
    name: "Adobe Sign",
    description: "Digital document signing and workflows",
    category: "E-Signature",
    icon: FileSignature,
    status: "disconnected",
  },
  {
    id: "linkedin",
    name: "LinkedIn Recruiter",
    description: "Import candidates and sync job postings",
    category: "Recruiting",
    icon: Briefcase,
    status: "disconnected",
  },
  {
    id: "indeed",
    name: "Indeed",
    description: "Post jobs and receive applications from Indeed",
    category: "Recruiting",
    icon: Briefcase,
    status: "disconnected",
  },
  {
    id: "google-calendar",
    name: "Google Calendar",
    description: "Sync leave and events with Google Calendar",
    category: "Calendar",
    icon: Calendar,
    status: "disconnected",
  },
  {
    id: "outlook-calendar",
    name: "Outlook Calendar",
    description: "Sync leave and events with Outlook Calendar",
    category: "Calendar",
    icon: Calendar,
    status: "disconnected",
  },
];

const CATEGORIES = [
  "All",
  "Identity & SSO",
  "Payroll",
  "Communication",
  "E-Signature",
  "Recruiting",
  "Calendar",
];

const STATUS_CONFIG = {
  connected: {
    label: "Connected",
    variant: "success" as const,
    icon: CheckCircle2,
  },
  disconnected: {
    label: "Not Connected",
    variant: "secondary" as const,
    icon: XCircle,
  },
  error: {
    label: "Error",
    variant: "error" as const,
    icon: XCircle,
  },
};

export default function AdminIntegrationsPage() {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");
  const [selectedIntegration, setSelectedIntegration] = useState<Integration | null>(null);
  const [configModalOpen, setConfigModalOpen] = useState(false);

  const filteredIntegrations = INTEGRATIONS.filter((integration) => {
    const matchesSearch =
      integration.name.toLowerCase().includes(search.toLowerCase()) ||
      integration.description.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = category === "All" || integration.category === category;
    return matchesSearch && matchesCategory;
  });

  const connectedCount = INTEGRATIONS.filter((i) => i.status === "connected").length;

  const handleConnect = (integration: Integration) => {
    setSelectedIntegration(integration);
    setConfigModalOpen(true);
  };

  const handleDisconnect = (integration: Integration) => {
    toast.success(`${integration.name} has been disconnected.`);
  };

  const handleSaveConfig = () => {
    toast.success(`${selectedIntegration?.name} has been configured successfully.`);
    setConfigModalOpen(false);
    setSelectedIntegration(null);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Integrations</h1>
        <p className="text-gray-600">
          Connect third-party services to extend your Staffora functionality
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardBody className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-blue-100">
              <Link2 className="h-6 w-6 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Total Integrations</p>
              <p className="text-2xl font-bold">{INTEGRATIONS.length}</p>
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-green-100">
              <CheckCircle2 className="h-6 w-6 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Connected</p>
              <p className="text-2xl font-bold">{connectedCount}</p>
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-gray-100">
              <XCircle className="h-6 w-6 text-gray-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Available</p>
              <p className="text-2xl font-bold">{INTEGRATIONS.length - connectedCount}</p>
            </div>
          </CardBody>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search integrations..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          {CATEGORIES.map((cat) => (
            <Button
              key={cat}
              variant={category === cat ? "primary" : "outline"}
              size="sm"
              onClick={() => setCategory(cat)}
            >
              {cat}
            </Button>
          ))}
        </div>
      </div>

      {/* Integration Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredIntegrations.map((integration) => {
          const statusConfig = STATUS_CONFIG[integration.status];
          const StatusIcon = statusConfig.icon;

          return (
            <Card key={integration.id} className="hover:shadow-md transition-shadow">
              <CardBody className="space-y-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-100">
                      <integration.icon className="h-5 w-5 text-gray-600" />
                    </div>
                    <div>
                      <h3 className="font-medium text-gray-900">{integration.name}</h3>
                      <p className="text-xs text-gray-500">{integration.category}</p>
                    </div>
                  </div>
                  <Badge variant={statusConfig.variant}>
                    <StatusIcon className="h-3 w-3 mr-1" />
                    {statusConfig.label}
                  </Badge>
                </div>

                <p className="text-sm text-gray-600">{integration.description}</p>

                {integration.lastSync && (
                  <div className="flex items-center gap-1 text-xs text-gray-500">
                    <RefreshCw className="h-3 w-3" />
                    Last synced: {integration.lastSync}
                  </div>
                )}

                <div className="flex gap-2 pt-2">
                  {integration.status === "connected" ? (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1"
                        onClick={() => handleConnect(integration)}
                      >
                        <Settings className="h-4 w-4 mr-1" />
                        Configure
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDisconnect(integration)}
                      >
                        Disconnect
                      </Button>
                    </>
                  ) : (
                    <Button
                      variant="primary"
                      size="sm"
                      className="flex-1"
                      onClick={() => handleConnect(integration)}
                    >
                      <Link2 className="h-4 w-4 mr-1" />
                      Connect
                    </Button>
                  )}
                </div>
              </CardBody>
            </Card>
          );
        })}
      </div>

      {filteredIntegrations.length === 0 && (
        <Card>
          <CardBody className="text-center py-12">
            <Link2 className="h-12 w-12 mx-auto text-gray-300 mb-4" />
            <p className="text-gray-500">No integrations found matching your criteria</p>
          </CardBody>
        </Card>
      )}

      {/* Configuration Modal */}
      <Modal open={configModalOpen} onClose={() => setConfigModalOpen(false)} size="md">
        <ModalHeader>
          <h3 className="text-lg font-semibold">
            Configure {selectedIntegration?.name}
          </h3>
        </ModalHeader>
        <ModalBody className="space-y-4">
          <p className="text-sm text-gray-600">
            {selectedIntegration?.description}
          </p>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                API Key / Client ID
              </label>
              <Input placeholder="Enter your API key or Client ID" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                API Secret / Client Secret
              </label>
              <Input type="password" placeholder="Enter your API secret" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Webhook URL (Optional)
              </label>
              <Input placeholder="https://your-domain.com/webhook" />
            </div>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <div className="flex items-start gap-2">
              <ExternalLink className="h-4 w-4 text-blue-600 mt-0.5" />
              <div className="text-sm">
                <p className="font-medium text-blue-800">Need help?</p>
                <p className="text-blue-700">
                  Visit the {selectedIntegration?.name} documentation for setup instructions.
                </p>
              </div>
            </div>
          </div>
        </ModalBody>
        <ModalFooter>
          <Button variant="outline" onClick={() => setConfigModalOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleSaveConfig}>
            Save & Connect
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}
