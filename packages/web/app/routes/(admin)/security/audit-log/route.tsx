import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "~/lib/api-client";
import { queryKeys } from "~/lib/query-client";
import { Button } from "~/components/ui/button";
import { Card, CardBody, CardHeader } from "~/components/ui/card";
import { DataTable, type ColumnDef, type PaginationState } from "~/components/ui/table";
import { formatRelativeTime } from "~/lib/utils";

interface AuditLogEntry {
  id: string;
  action: string;
  resource: string;
  actor: string;
  timestamp: string;
  details?: string;
}

async function fetchAuditLog(params: {
  limit: number;
  cursor: string | null;
}): Promise<AuditLogEntry[]> {
  const search = new URLSearchParams();
  search.set("limit", String(params.limit));
  if (params.cursor) search.set("cursor", params.cursor);
  const qs = search.toString();
  return api.get<AuditLogEntry[]>(`/security/audit-log${qs ? `?${qs}` : ""}`);
}

export default function AdminAuditLogPage() {
  const [pagination, setPagination] = useState<PaginationState>({ cursor: null, limit: 50 });
  const [items, setItems] = useState<AuditLogEntry[]>([]);
  const [hasMore, setHasMore] = useState(true);

  const { data, isFetching, refetch } = useQuery({
    queryKey: queryKeys.security.auditLog({ cursor: pagination.cursor, limit: pagination.limit }),
    queryFn: () => fetchAuditLog({ cursor: pagination.cursor, limit: pagination.limit }),
    staleTime: 30 * 1000,
  });

  useEffect(() => {
    if (!data) return;

    if (!pagination.cursor) {
      setItems(data);
    } else {
      setItems((prev) => {
        const existing = new Set(prev.map((e) => e.id));
        const next = [...prev];
        for (const row of data) {
          if (!existing.has(row.id)) next.push(row);
        }
        return next;
      });
    }

    setHasMore(data.length >= pagination.limit);
  }, [data, pagination.cursor, pagination.limit]);

  const columns = useMemo<ColumnDef<AuditLogEntry>[]>(
    () => [
      {
        id: "timestamp",
        header: "When",
        cell: ({ row }) => (
          <div className="text-sm">
            <div className="font-medium text-gray-900 dark:text-gray-100">
              {formatRelativeTime(row.timestamp)}
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400">
              {new Date(row.timestamp).toLocaleString()}
            </div>
          </div>
        ),
      },
      {
        id: "actor",
        header: "Actor",
        cell: ({ row }) => <span className="text-sm text-gray-900 dark:text-gray-100">{row.actor}</span>,
      },
      {
        id: "action",
        header: "Action",
        cell: ({ row }) => <span className="text-sm text-gray-900 dark:text-gray-100">{row.action}</span>,
      },
      {
        id: "resource",
        header: "Resource",
        cell: ({ row }) => <span className="text-sm text-gray-900 dark:text-gray-100">{row.resource}</span>,
      },
      {
        id: "details",
        header: "Details",
        cell: ({ row }) => (
          <span className="text-sm text-gray-500 dark:text-gray-400">{row.details ?? "-"}</span>
        ),
      },
    ],
    []
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Audit Log</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Recent security-relevant activity in this tenant</p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => {
              setPagination((p) => ({ ...p, cursor: null }));
              setHasMore(true);
              void refetch();
            }}
            loading={isFetching}
          >
            Refresh
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader title="Audit Events" bordered />
        <CardBody padding="none">
          <DataTable
            columns={columns}
            data={items}
            loading={isFetching}
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
            emptyMessage="No audit events found"
          />
        </CardBody>
      </Card>
    </div>
  );
}
