import { Card, CardBody } from "~/components/ui/card";

export default function AdminReportsIndexPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Reports</h1>
        <p className="text-gray-500">Select a report to run.</p>
      </div>

      <Card>
        <CardBody className="text-sm text-gray-600">No reports are configured.</CardBody>
      </Card>
    </div>
  );
}
