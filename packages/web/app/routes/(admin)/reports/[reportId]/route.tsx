import { useParams } from "react-router";
import { Card, CardBody } from "~/components/ui/card";

export default function AdminReportPage() {
  const params = useParams();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Report</h1>
        <p className="text-gray-500">Report ID: {params.reportId}</p>
      </div>

      <Card>
        <CardBody className="text-sm text-gray-600">Report rendering is not available yet.</CardBody>
      </Card>
    </div>
  );
}
