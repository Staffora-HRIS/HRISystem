import { Link } from "react-router";
import { Card, CardBody } from "~/components/ui/card";

export default function ManagerIndexPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Manager</h1>
        <p className="text-gray-500">Manager tools and approvals</p>
      </div>

      <Card>
        <CardBody className="space-y-3">
          <div className="font-medium">Quick links</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            <Link className="text-primary-600 hover:underline" to="/manager/team">
              My Team
            </Link>
            <Link className="text-primary-600 hover:underline" to="/manager/approvals">
              Approvals
            </Link>
            <Link className="text-primary-600 hover:underline" to="/manager/schedules">
              Schedules
            </Link>
            <Link className="text-primary-600 hover:underline" to="/manager/performance">
              Performance
            </Link>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
