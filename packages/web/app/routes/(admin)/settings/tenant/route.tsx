import { Card, CardBody } from "~/components/ui/card";

export default function AdminTenantSettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Tenant Settings</h1>
        <p className="text-gray-500">Tenant configuration will appear here once enabled.</p>
      </div>

      <Card>
        <CardBody className="text-sm text-gray-600">No tenant settings are available right now.</CardBody>
      </Card>
    </div>
  );
}
