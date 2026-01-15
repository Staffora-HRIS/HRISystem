import { Card, CardBody } from "~/components/ui/card";

export default function MyDocumentsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">My Documents</h1>
        <p className="text-gray-500">Your HR documents will appear here once enabled.</p>
      </div>

      <Card>
        <CardBody className="text-sm text-gray-600">
          No documents are available right now.
        </CardBody>
      </Card>
    </div>
  );
}
