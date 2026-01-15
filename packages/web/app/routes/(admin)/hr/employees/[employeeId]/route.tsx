import { useParams } from "react-router";
import { Card, CardBody } from "~/components/ui/card";

export default function AdminEmployeeDetailsPage() {
  const params = useParams();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Employee Details</h1>
        <p className="text-gray-500">Employee ID: {params.employeeId}</p>
      </div>

      <Card>
        <CardBody className="text-sm text-gray-600">Employee details view is not available yet.</CardBody>
      </Card>
    </div>
  );
}
