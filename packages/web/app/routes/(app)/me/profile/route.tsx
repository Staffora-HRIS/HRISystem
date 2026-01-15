import { useQuery } from "@tanstack/react-query";
import { Card, CardBody } from "~/components/ui/card";
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

export default function MyProfilePage() {
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
          : "Unable to load your profile.";

    return (
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">My Profile</h1>
        <p className="text-gray-500">{message}</p>
      </div>
    );
  }

  const name = [me.user.firstName, me.user.lastName].filter(Boolean).join(" ") || me.user.email;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">My Profile</h1>
        <p className="text-gray-500">{name}</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardBody className="space-y-2">
            <div className="font-medium">Account</div>
            <div className="text-sm text-gray-600">Email: {me.user.email}</div>
            <div className="text-sm text-gray-600">Tenant: {me.tenant.name}</div>
            <div className="text-sm text-gray-600">User ID: {me.user.id}</div>
          </CardBody>
        </Card>

        <Card>
          <CardBody className="space-y-2">
            <div className="font-medium">Employee Profile</div>
            {!me.employee ? (
              <div className="text-sm text-gray-600">No employee profile is linked to your account.</div>
            ) : (
              <>
                <div className="text-sm text-gray-600">
                  Employee: {me.employee.firstName} {me.employee.lastName}
                </div>
                <div className="text-sm text-gray-600">Employee # {me.employee.employeeNumber}</div>
                <div className="text-sm text-gray-600">Status: {me.employee.status}</div>
                {me.employee.positionTitle && (
                  <div className="text-sm text-gray-600">Position: {me.employee.positionTitle}</div>
                )}
                {me.employee.orgUnitName && (
                  <div className="text-sm text-gray-600">Org Unit: {me.employee.orgUnitName}</div>
                )}
                {me.employee.hireDate && (
                  <div className="text-sm text-gray-600">
                    Hire Date: {new Date(me.employee.hireDate).toLocaleDateString()}
                  </div>
                )}
              </>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
