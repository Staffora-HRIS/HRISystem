import { Card, CardBody } from "~/components/ui/card";

export default function AdminOrganizationPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Organization</h1>
        <p className="text-gray-500">Organization structure tools will appear here once enabled.</p>
      </div>

      <Card>
        <CardBody className="text-sm text-gray-600">No organization chart is available right now.</CardBody>
      </Card>
    </div>
  );
}
