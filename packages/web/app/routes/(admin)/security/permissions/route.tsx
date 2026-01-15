import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Badge,
  Card,
  CardBody,
  CardHeader,
  DataTable,
  type ColumnDef,
  Input,
  Select,
} from "~/components/ui";
import { api } from "~/lib/api-client";
import { queryKeys } from "~/lib/query-client";

interface PermissionSummary {
  id: string;
  key: string;
  resource: string;
  action: string;
  description: string | null;
  module: string | null;
  requiresMfa: boolean;
}

async function fetchPermissions(): Promise<PermissionSummary[]> {
  return api.get<PermissionSummary[]>("/security/permissions");
}

export default function AdminPermissionsPage() {
  const [search, setSearch] = useState("");
  const [moduleFilter, setModuleFilter] = useState<string>("");

  const { data, isFetching } = useQuery({
    queryKey: queryKeys.security.permissions(),
    queryFn: fetchPermissions,
    staleTime: 30 * 60 * 1000,
  });

  const modules = useMemo(() => {
    const set = new Set((data ?? []).map((p) => p.module).filter(Boolean) as string[]);
    return Array.from(set).sort();
  }, [data]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return (data ?? []).filter((p) => {
      if (moduleFilter && (p.module ?? "") !== moduleFilter) return false;
      if (!s) return true;
      return (
        p.key.toLowerCase().includes(s) ||
        (p.description ?? "").toLowerCase().includes(s) ||
        (p.module ?? "").toLowerCase().includes(s)
      );
    });
  }, [data, moduleFilter, search]);

  const columns = useMemo<ColumnDef<PermissionSummary>[]>(
    () => [
      {
        id: "key",
        header: "Permission",
        cell: ({ row }) => (
          <div className="space-y-0.5">
            <div className="font-mono text-sm text-gray-900 dark:text-gray-100">{row.key}</div>
            <div className="text-xs text-gray-500 dark:text-gray-400">{row.description ?? "-"}</div>
          </div>
        ),
      },
      {
        id: "module",
        header: "Module",
        cell: ({ row }) => <span className="text-sm text-gray-700 dark:text-gray-200">{row.module ?? "-"}</span>,
      },
      {
        id: "mfa",
        header: "MFA",
        cell: ({ row }) => (row.requiresMfa ? <Badge variant="warning">Required</Badge> : <Badge variant="success">No</Badge>),
      },
    ],
    []
  );

  const moduleOptions = useMemo(() => {
    return [{ value: "", label: "All modules" }, ...modules.map((m) => ({ value: m, label: m }))];
  }, [modules]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Permissions</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">System-wide permission catalog</p>
      </div>

      <Card>
        <CardHeader
          title="Permission Catalog"
          bordered
          action={
            <div className="flex items-center gap-3">
              <div className="w-56">
                <Select
                  options={moduleOptions}
                  value={moduleFilter}
                  onChange={(e) => setModuleFilter(e.target.value)}
                />
              </div>
              <div className="w-72">
                <Input placeholder="Search permissions" value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
            </div>
          }
        />
        <CardBody padding="none">
          <DataTable columns={columns} data={filtered} loading={isFetching} emptyMessage="No permissions found" />
        </CardBody>
      </Card>
    </div>
  );
}
