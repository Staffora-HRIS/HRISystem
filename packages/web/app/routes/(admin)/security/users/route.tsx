import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  DataTable,
  type ColumnDef,
  type PaginationState,
  Input,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  Select,
  useToast,
} from "~/components/ui";
import { api } from "~/lib/api-client";
import { invalidationPatterns, queryKeys } from "~/lib/query-client";

interface TenantUserRow {
  id: string;
  email: string;
  name: string | null;
  status: string;
  emailVerified: boolean;
  mfaEnabled: boolean;
  joinedAt: string;
  isPrimary: boolean;
  roles: string[];
  createdAt: string;
}

interface RoleSummary {
  id: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  tenantId: string | null;
  permissionsCount: number;
}

interface RoleAssignment {
  id: string;
  roleId: string;
  roleName: string;
  isSystem: boolean;
  constraints: unknown;
  effectiveFrom: string;
  effectiveTo: string | null;
  assignedAt: string;
  assignedBy: string | null;
}

async function fetchUsers(params: {
  cursor: string | null;
  limit: number;
  search: string;
}): Promise<TenantUserRow[]> {
  const qs = new URLSearchParams();
  qs.set("limit", String(params.limit));
  if (params.cursor) qs.set("cursor", params.cursor);
  if (params.search.trim()) qs.set("search", params.search.trim());
  return api.get<TenantUserRow[]>(`/security/users?${qs.toString()}`);
}

async function fetchRoles(): Promise<RoleSummary[]> {
  return api.get<RoleSummary[]>("/security/roles");
}

async function fetchUserRoleAssignments(userId: string): Promise<RoleAssignment[]> {
  return api.get<RoleAssignment[]>(`/security/users/${userId}/role-assignments`);
}

export default function AdminUsersPage() {
  const toast = useToast();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [pagination, setPagination] = useState<PaginationState>({ cursor: null, limit: 50 });
  const [items, setItems] = useState<TenantUserRow[]>([]);
  const [hasMore, setHasMore] = useState(true);

  const [activeUser, setActiveUser] = useState<TenantUserRow | null>(null);
  const [selectedRoleId, setSelectedRoleId] = useState<string>("");

  const usersQuery = useQuery({
    queryKey: queryKeys.security.users({ cursor: pagination.cursor, limit: pagination.limit, search }),
    queryFn: () => fetchUsers({ cursor: pagination.cursor, limit: pagination.limit, search }),
    staleTime: 30 * 1000,
  });

  const rolesQuery = useQuery({
    queryKey: queryKeys.security.roles(),
    queryFn: fetchRoles,
    staleTime: 5 * 60 * 1000,
  });

  const assignmentsQuery = useQuery({
    queryKey: queryKeys.security.user(activeUser?.id ?? ""),
    queryFn: () => fetchUserRoleAssignments(activeUser!.id),
    enabled: !!activeUser,
  });

  useEffect(() => {
    const data = usersQuery.data;
    if (!data) return;

    if (!pagination.cursor) {
      setItems(data);
    } else {
      setItems((prev) => {
        const existing = new Set(prev.map((u) => u.id));
        const next = [...prev];
        for (const row of data) {
          if (!existing.has(row.id)) next.push(row);
        }
        return next;
      });
    }
    setHasMore(data.length >= pagination.limit);
  }, [usersQuery.data, pagination.cursor, pagination.limit]);

  const assignRoleMutation = useMutation({
    mutationFn: async (params: { userId: string; roleId: string }) => {
      return api.post(`/security/users/${params.userId}/roles`, { roleId: params.roleId, constraints: {} });
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: queryKeys.security.all() });
      await Promise.all(
        invalidationPatterns.security().map((key) => qc.invalidateQueries({ queryKey: key }))
      );
      await assignmentsQuery.refetch();
      toast.success("Role assigned");
    },
    onError: () => toast.error("Failed to assign role"),
  });

  const revokeAssignmentMutation = useMutation({
    mutationFn: async (assignmentId: string) => api.delete(`/security/role-assignments/${assignmentId}`),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: queryKeys.security.all() });
      await assignmentsQuery.refetch();
      toast.success("Role revoked");
    },
    onError: () => toast.error("Failed to revoke role"),
  });

  const columns = useMemo<ColumnDef<TenantUserRow>[]>(
    () => [
      {
        id: "email",
        header: "User",
        cell: ({ row }) => (
          <div className="space-y-0.5">
            <div className="font-medium text-gray-900 dark:text-gray-100">{row.name ?? row.email}</div>
            <div className="text-xs text-gray-500 dark:text-gray-400">{row.email}</div>
          </div>
        ),
      },
      {
        id: "status",
        header: "Status",
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <Badge variant={row.status === "active" ? "success" : "secondary"}>
              {row.status}
            </Badge>
            {row.mfaEnabled && <Badge variant="info">MFA</Badge>}
            {row.emailVerified ? <Badge variant="primary">Verified</Badge> : <Badge variant="warning">Unverified</Badge>}
          </div>
        ),
      },
      {
        id: "roles",
        header: "Roles",
        cell: ({ row }) => (
          <div className="flex flex-wrap gap-1">
            {(row.roles ?? []).slice(0, 3).map((r, i) => (
              <Badge key={`${r}-${i}`} variant="outline" size="sm">
                {r}
              </Badge>
            ))}
            {(row.roles ?? []).length > 3 && <Badge variant="outline" size="sm">+{row.roles.length - 3}</Badge>}
          </div>
        ),
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <div className="flex justify-end">
            <Button variant="outline" size="sm" onClick={() => {
              setActiveUser(row);
              setSelectedRoleId("");
            }}>
              Manage Roles
            </Button>
          </div>
        ),
      },
    ],
    []
  );

  const roleOptions = useMemo(() => {
    const roles = rolesQuery.data ?? [];
    return roles.map((r) => ({ value: r.id, label: r.name }));
  }, [rolesQuery.data]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Users</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Tenant members and their RBAC roles</p>
        </div>
      </div>

      <Card>
        <CardHeader
          title="Tenant Users"
          bordered
          action={
            <div className="w-72">
              <Input
                placeholder="Search by name or email"
                value={search}
                onChange={(e) => {
                  const next = e.target.value;
                  setSearch(next);
                  setItems([]);
                  setHasMore(true);
                  setPagination((p) => ({ ...p, cursor: null }));
                }}
              />
            </div>
          }
        />
        <CardBody padding="none">
          <DataTable
            columns={columns}
            data={items}
            loading={usersQuery.isFetching}
            pagination={pagination}
            hasMore={hasMore}
            onPaginationChange={(next) => {
              if (next.limit !== pagination.limit) {
                setItems([]);
                setHasMore(true);
                setPagination({ cursor: null, limit: next.limit });
                return;
              }
              setPagination(next);
            }}
            emptyMessage="No users found"
          />
        </CardBody>
      </Card>

      <Modal
        open={!!activeUser}
        onClose={() => {
          setActiveUser(null);
          setSelectedRoleId("");
        }}
        size="lg"
      >
        <ModalHeader
          title={activeUser ? `Manage Roles: ${activeUser.name ?? activeUser.email}` : "Manage Roles"}
          subtitle={activeUser?.email}
        />
        <ModalBody>
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Assigned Roles</h3>
              <div className="mt-2 space-y-2">
                {(assignmentsQuery.data ?? []).length === 0 ? (
                  <div className="text-sm text-gray-500 dark:text-gray-400">No roles assigned.</div>
                ) : (
                  (assignmentsQuery.data ?? []).map((a) => (
                    <div
                      key={a.id}
                      className="flex items-center justify-between rounded-lg border border-gray-200 p-3 dark:border-gray-700"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant={a.isSystem ? "secondary" : "primary"}>{a.roleName}</Badge>
                          {a.effectiveTo ? <Badge variant="warning">Revoked</Badge> : <Badge variant="success">Active</Badge>}
                        </div>
                        <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                          Assigned {new Date(a.assignedAt).toLocaleString()}
                        </div>
                      </div>
                      <div className="shrink-0">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={revokeAssignmentMutation.isPending || !!a.effectiveTo}
                          loading={revokeAssignmentMutation.isPending}
                          onClick={() => revokeAssignmentMutation.mutate(a.id)}
                        >
                          Revoke
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="border-t border-gray-200 pt-4 dark:border-gray-700">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Assign Role</h3>
              <div className="mt-2 grid grid-cols-1 gap-3 md:grid-cols-3">
                <div className="md:col-span-2">
                  <Select
                    label="Role"
                    options={roleOptions}
                    placeholder="Select role"
                    value={selectedRoleId}
                    onChange={(e) => setSelectedRoleId(e.target.value)}
                  />
                </div>
                <div className="flex items-end">
                  <Button
                    fullWidth
                    disabled={!activeUser || !selectedRoleId || assignRoleMutation.isPending}
                    loading={assignRoleMutation.isPending}
                    onClick={() => {
                      if (!activeUser) return;
                      assignRoleMutation.mutate({ userId: activeUser.id, roleId: selectedRoleId });
                    }}
                  >
                    Assign
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </ModalBody>
        <ModalFooter>
          <Button variant="outline" onClick={() => setActiveUser(null)}>
            Close
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}
