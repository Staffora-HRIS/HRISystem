import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  DataTable,
  type ColumnDef,
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
  resource: string;
  action: string;
  description: string | null;
  module: string | null;
  requiresMfa: boolean;
}

async function fetchRoles(): Promise<RoleSummary[]> {
  return api.get<RoleSummary[]>("/security/roles");
}

async function fetchPermissionsCatalog(): Promise<PermissionSummary[]> {
  return api.get<PermissionSummary[]>("/security/permissions");
}

async function fetchRolePermissions(roleId: string): Promise<PermissionSummary[]> {
  return api.get<PermissionSummary[]>(`/security/roles/${roleId}/permissions`);
}

export default function AdminRolesPage() {
  const toast = useToast();
  const qc = useQueryClient();

  const rolesQuery = useQuery({
    queryKey: queryKeys.security.roles(),
    queryFn: fetchRoles,
  });

  const catalogQuery = useQuery({
    queryKey: queryKeys.security.permissions(),
    queryFn: fetchPermissionsCatalog,
    staleTime: 30 * 60 * 1000,
  });

  const [createOpen, setCreateOpen] = useState(false);
  const [editRole, setEditRole] = useState<RoleSummary | null>(null);
  const [permissionsRole, setPermissionsRole] = useState<RoleSummary | null>(null);
  const [grantKey, setGrantKey] = useState<string>("");

  const rolePermissionsQuery = useQuery({
    queryKey: queryKeys.security.role(permissionsRole?.id ?? ""),
    queryFn: () => fetchRolePermissions(permissionsRole!.id),
    enabled: !!permissionsRole,
  });

  const createRoleMutation = useMutation({
    mutationFn: async (data: { name: string; description?: string }) => api.post("/security/roles", data),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: queryKeys.security.roles() });
      await Promise.all(
        invalidationPatterns.security().map((key) => qc.invalidateQueries({ queryKey: key }))
      );
      setCreateOpen(false);
      toast.success("Role created");
    },
    onError: () => toast.error("Failed to create role"),
  });

  const updateRoleMutation = useMutation({
    mutationFn: async (data: { id: string; name?: string; description?: string }) =>
      api.put(`/security/roles/${data.id}`, { name: data.name, description: data.description }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: queryKeys.security.roles() });
      setEditRole(null);
      toast.success("Role updated");
    },
    onError: () => toast.error("Failed to update role"),
  });

  const deleteRoleMutation = useMutation({
    mutationFn: async (id: string) => api.delete(`/security/roles/${id}`),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: queryKeys.security.roles() });
      toast.success("Role deleted");
    },
    onError: () => toast.error("Failed to delete role"),
  });

  const grantPermissionMutation = useMutation({
    mutationFn: async (data: { roleId: string; resource: string; action: string }) =>
      api.post(`/security/roles/${data.roleId}/permissions`, { resource: data.resource, action: data.action }),
    onSuccess: async () => {
      await rolePermissionsQuery.refetch();
      await qc.invalidateQueries({ queryKey: queryKeys.security.roles() });
      setGrantKey("");
      toast.success("Permission granted");
    },
    onError: () => toast.error("Failed to grant permission"),
  });

  const revokePermissionMutation = useMutation({
    mutationFn: async (data: { roleId: string; resource: string; action: string }) =>
      api.delete(`/security/roles/${data.roleId}/permissions`, { params: { resource: data.resource, action: data.action } }),
    onSuccess: async () => {
      await rolePermissionsQuery.refetch();
      await qc.invalidateQueries({ queryKey: queryKeys.security.roles() });
      toast.success("Permission revoked");
    },
    onError: () => toast.error("Failed to revoke permission"),
  });

  const columns = useMemo<ColumnDef<RoleSummary>[]>(
    () => [
      {
        id: "name",
        header: "Role",
        cell: ({ row }) => (
          <div className="space-y-0.5">
            <div className="font-medium text-gray-900 dark:text-gray-100">{row.name}</div>
            <div className="text-xs text-gray-500 dark:text-gray-400">{row.description ?? "-"}</div>
          </div>
        ),
      },
      {
        id: "type",
        header: "Type",
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            {row.isSystem ? <Badge variant="secondary">System</Badge> : <Badge variant="primary">Tenant</Badge>}
            <Badge variant="outline">{row.permissionsCount} perms</Badge>
          </div>
        ),
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setPermissionsRole(row);
                setGrantKey("");
              }}
            >
              Permissions
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={row.isSystem}
              onClick={() => setEditRole(row)}
            >
              Edit
            </Button>
            <Button
              variant="danger"
              size="sm"
              disabled={row.isSystem || deleteRoleMutation.isPending}
              loading={deleteRoleMutation.isPending}
              onClick={() => deleteRoleMutation.mutate(row.id)}
            >
              Delete
            </Button>
          </div>
        ),
      },
    ],
    [deleteRoleMutation.isPending]
  );

  const permissionOptions = useMemo(() => {
    const perms = catalogQuery.data ?? [];
    return perms.map((p) => ({ value: p.key, label: p.key }));
  }, [catalogQuery.data]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Roles</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Manage tenant roles and their permissions</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>Create Role</Button>
      </div>

      <Card>
        <CardHeader title="Roles" bordered />
        <CardBody padding="none">
          <DataTable
            columns={columns}
            data={rolesQuery.data ?? []}
            loading={rolesQuery.isFetching}
            emptyMessage="No roles found"
          />
        </CardBody>
      </Card>

      <Modal open={createOpen} onClose={() => setCreateOpen(false)}>
        <ModalHeader title="Create Role" />
        <ModalBody>
          <div className="space-y-4">
            <Input label="Name" placeholder="e.g. hr_manager" id="role-name" />
            <Input label="Description" placeholder="Optional" id="role-desc" />
          </div>
        </ModalBody>
        <ModalFooter>
          <Button variant="outline" onClick={() => setCreateOpen(false)}>
            Cancel
          </Button>
          <Button
            loading={createRoleMutation.isPending}
            onClick={() => {
              const nameInput = document.getElementById("role-name") as HTMLInputElement | null;
              const descInput = document.getElementById("role-desc") as HTMLInputElement | null;
              const name = nameInput?.value?.trim() ?? "";
              const description = descInput?.value?.trim() ?? "";
              if (!name) {
                toast.error("Role name is required");
                return;
              }
              createRoleMutation.mutate({ name, description: description || undefined });
            }}
          >
            Create
          </Button>
        </ModalFooter>
      </Modal>

      <Modal open={!!editRole} onClose={() => setEditRole(null)}>
        <ModalHeader title={editRole ? `Edit Role: ${editRole.name}` : "Edit Role"} />
        <ModalBody>
          <div className="space-y-4">
            <Input
              label="Name"
              defaultValue={editRole?.name ?? ""}
              id="edit-role-name"
            />
            <Input
              label="Description"
              defaultValue={editRole?.description ?? ""}
              id="edit-role-desc"
            />
          </div>
        </ModalBody>
        <ModalFooter>
          <Button variant="outline" onClick={() => setEditRole(null)}>
            Cancel
          </Button>
          <Button
            loading={updateRoleMutation.isPending}
            onClick={() => {
              if (!editRole) return;
              const nameInput = document.getElementById("edit-role-name") as HTMLInputElement | null;
              const descInput = document.getElementById("edit-role-desc") as HTMLInputElement | null;
              updateRoleMutation.mutate({
                id: editRole.id,
                name: nameInput?.value?.trim() ?? undefined,
                description: descInput?.value?.trim() ?? undefined,
              });
            }}
          >
            Save
          </Button>
        </ModalFooter>
      </Modal>

      <Modal
        open={!!permissionsRole}
        onClose={() => {
          setPermissionsRole(null);
          setGrantKey("");
        }}
        size="xl"
      >
        <ModalHeader
          title={permissionsRole ? `Role Permissions: ${permissionsRole.name}` : "Role Permissions"}
          subtitle={permissionsRole?.isSystem ? "System role" : "Tenant role"}
        />
        <ModalBody>
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <div className="md:col-span-2">
                <Select
                  label="Grant permission"
                  options={permissionOptions}
                  placeholder="Select permission"
                  value={grantKey}
                  onChange={(e) => setGrantKey(e.target.value)}
                />
              </div>
              <div className="flex items-end">
                <Button
                  fullWidth
                  disabled={!permissionsRole || !grantKey || grantPermissionMutation.isPending}
                  loading={grantPermissionMutation.isPending}
                  onClick={() => {
                    if (!permissionsRole) return;
                    const [resource, action] = grantKey.split(":");
                    if (!resource || !action) return;
                    grantPermissionMutation.mutate({ roleId: permissionsRole.id, resource, action });
                  }}
                >
                  Grant
                </Button>
              </div>
            </div>

            <div className="rounded-lg border border-gray-200 dark:border-gray-700">
              <div className="border-b border-gray-200 px-4 py-2 text-sm font-semibold text-gray-900 dark:border-gray-700 dark:text-gray-100">
                Current permissions
              </div>
              <div className="divide-y divide-gray-200 dark:divide-gray-700">
                {(rolePermissionsQuery.data ?? []).length === 0 ? (
                  <div className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">No permissions</div>
                ) : (
                  (rolePermissionsQuery.data ?? []).map((p) => (
                    <div key={p.key} className="flex items-center justify-between px-4 py-3">
                      <div className="min-w-0">
                        <div className="font-mono text-sm text-gray-900 dark:text-gray-100">{p.key}</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">{p.description ?? "-"}</div>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={!permissionsRole || permissionsRole.isSystem || revokePermissionMutation.isPending}
                        loading={revokePermissionMutation.isPending}
                        onClick={() => {
                          if (!permissionsRole) return;
                          revokePermissionMutation.mutate({ roleId: permissionsRole.id, resource: p.resource, action: p.action });
                        }}
                      >
                        Revoke
                      </Button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </ModalBody>
        <ModalFooter>
          <Button variant="outline" onClick={() => setPermissionsRole(null)}>
            Close
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}
