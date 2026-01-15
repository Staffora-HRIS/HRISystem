import { Card, CardBody } from "~/components/ui/card";

export default function AdminEmployeesPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Employees</h1>
        <p className="text-gray-500">Employee management will appear here once enabled.</p>
      </div>

      <Card>
        <CardBody className="text-sm text-gray-600">No employee list is available right now.</CardBody>
      </Card>
    </div>
  );
}
