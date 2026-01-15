import { Card, CardBody } from "~/components/ui/card";

export default function AdminDepartmentsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Departments</h1>
        <p className="text-gray-500">Department management will appear here once enabled.</p>
      </div>

      <Card>
        <CardBody className="text-sm text-gray-600">No departments list is available right now.</CardBody>
      </Card>
    </div>
  );
}
