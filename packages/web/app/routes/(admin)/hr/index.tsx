import { Card, CardBody } from "~/components/ui/card";

export default function AdminHrIndexPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">HR</h1>
        <p className="text-gray-500">Choose a section from the sidebar.</p>
      </div>

      <Card>
        <CardBody className="text-sm text-gray-600">No HR section selected.</CardBody>
      </Card>
    </div>
  );
}
