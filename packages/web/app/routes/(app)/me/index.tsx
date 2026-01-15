import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { Card, CardBody, StatCard } from "~/components/ui/card";
import { Spinner } from "~/components/ui/spinner";
import { api, ApiError } from "~/lib/api-client";

type PortalMeResponse = {
  user: { id: string; email: string; firstName?: string | null; lastName?: string | null };
  employee:
    | {
        id: string;
        employeeNumber: string;
        firstName: string;
        lastName: string;
        positionTitle?: string | null;
        orgUnitName?: string | null;
        status: string;
        hireDate?: string | null;
      }
    | null;
  tenant: { id: string; name: string };
};

export default function MeIndexPage() {
  const {
    data: me,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["portal", "me"],
    queryFn: () => api.get<PortalMeResponse>("/portal/me"),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!me) {
    const message =
      error instanceof ApiError
        ? error.message
        : error instanceof Error
          ? error.message
          : "Unable to load your overview.";

    return (
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">My Overview</h1>
        <p className="text-gray-500">{message}</p>
      </div>
    );
  }

  const employeeName = me.employee ? `${me.employee.firstName} ${me.employee.lastName}` : "Employee";
  const userName = [me.user.firstName, me.user.lastName].filter(Boolean).join(" ") || me.user.email;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">My Overview</h1>
        <p className="text-gray-500">Signed in as {userName}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard title="Tenant" value={me.tenant.name} />
        <StatCard title="Employee" value={employeeName} />
        <StatCard title="Status" value={me.employee?.status ?? "No employee profile"} />
      </div>

      <Card>
        <CardBody className="space-y-3">
          <div className="font-medium">Quick links</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            <Link className="text-primary-600 hover:underline" to="/me/profile">
              My Profile
            </Link>
            <Link className="text-primary-600 hover:underline" to="/me/time">
              Time & Attendance
            </Link>
            <Link className="text-primary-600 hover:underline" to="/me/leave">
              Leave Requests
            </Link>
            <Link className="text-primary-600 hover:underline" to="/me/documents">
              Documents
            </Link>
            <Link className="text-primary-600 hover:underline" to="/me/learning">
              Learning
            </Link>
            <Link className="text-primary-600 hover:underline" to="/me/cases">
              Help & Support
            </Link>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
