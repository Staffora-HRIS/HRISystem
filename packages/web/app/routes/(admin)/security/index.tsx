import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { Card, CardBody, CardHeader, StatCard } from "~/components/ui/card";
import { Spinner } from "~/components/ui/spinner";
import { api } from "~/lib/api-client";
import { queryKeys } from "~/lib/query-client";

interface RoleSummary {
  id: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  tenantId: string | null;
  permissionsCount: number;
}

interface PermissionSummary {
  id: string;
  key: string;
  description: string | null;
  module: string | null;
  requiresMfa: boolean;
}

async function fetchRoles(): Promise<RoleSummary[]> {
  return api.get<RoleSummary[]>("/security/roles");
}

async function fetchPermissions(): Promise<PermissionSummary[]> {
  return api.get<PermissionSummary[]>("/security/permissions");
}

export default function AdminSecurityIndexPage() {
  const { data: roles, isLoading: rolesLoading } = useQuery({
    queryKey: queryKeys.security.roles(),
    queryFn: fetchRoles,
  });

  const { data: permissions, isLoading: permissionsLoading } = useQuery({
    queryKey: queryKeys.security.permissions(),
    queryFn: fetchPermissions,
  });

  const isLoading = rolesLoading || permissionsLoading;

  const permissionModules = new Set((permissions ?? []).map((p) => p.module).filter(Boolean));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Security</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Manage users, roles, permissions, and audit logs.
        </p>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-10">
          <Spinner size="lg" />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <Link to="/admin/security/users">
            <StatCard title="Users" value="Manage" description="Tenant members and role assignments" />
          </Link>
          <Link to="/admin/security/roles">
            <StatCard title="Roles" value={(roles ?? []).length} description="System + tenant roles" />
          </Link>
          <Link to="/admin/security/permissions">
            <StatCard
              title="Permissions"
              value={(permissions ?? []).length}
              description={`${permissionModules.size} modules`}
            />
          </Link>
          <Link to="/admin/security/audit-log">
            <StatCard title="Audit Log" value="View" description="Security-relevant activity" />
          </Link>
        </div>
      )}

      <Card>
        <CardHeader title="Quick Links" bordered />
        <CardBody>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <Link
              to="/admin/security/users"
              className="rounded-lg border border-gray-200 p-4 text-sm text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
            >
              Users
            </Link>
            <Link
              to="/admin/security/roles"
              className="rounded-lg border border-gray-200 p-4 text-sm text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
            >
              Roles
            </Link>
            <Link
              to="/admin/security/permissions"
              className="rounded-lg border border-gray-200 p-4 text-sm text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
            >
              Permission Catalog
            </Link>
            <Link
              to="/admin/security/audit-log"
              className="rounded-lg border border-gray-200 p-4 text-sm text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
            >
              Audit Log
            </Link>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
