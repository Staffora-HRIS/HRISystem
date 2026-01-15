import { Card, CardBody } from "~/components/ui/card";

export default function AdminIntegrationsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Integrations</h1>
        <p className="text-gray-500">Configure third-party integrations.</p>
      </div>

      <Card>
        <CardBody className="text-sm text-gray-600">No integrations are configured.</CardBody>
      </Card>
    </div>
  );
}
