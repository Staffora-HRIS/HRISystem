import { Card, CardBody } from "~/components/ui/card";

export default function AdminPositionsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Positions</h1>
        <p className="text-gray-500">Position management will appear here once enabled.</p>
      </div>

      <Card>
        <CardBody className="text-sm text-gray-600">No positions list is available right now.</CardBody>
      </Card>
    </div>
  );
}
