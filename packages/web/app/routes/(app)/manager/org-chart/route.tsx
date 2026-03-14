export { RouteErrorBoundary as ErrorBoundary } from "~/components/ui/RouteErrorBoundary";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Users,
  ChevronDown,
  ChevronRight,
  User,
  Mail,
  Briefcase,
} from "lucide-react";
import {
  Card,
  CardHeader,
  CardBody,
  Badge,
  type BadgeVariant,
  Avatar,
  Spinner,
} from "~/components/ui";
import { api, ApiError } from "~/lib/api-client";
import { queryKeys } from "~/lib/query-client";

// Org chart node from the API
interface OrgChartNode {
  employeeId: string;
  employeeNumber: string;
  firstName: string;
  lastName: string;
  displayName?: string;
  email: string | null;
  jobTitle: string | null;
  department: string | null;
  photoUrl: string | null;
  status: string;
  children: OrgChartNode[];
}

interface OrgChartResponse {
  tree: OrgChartNode[];
  totalCount: number;
}

const STATUS_COLORS: Record<string, BadgeVariant> = {
  active: "success",
  on_leave: "warning",
  terminated: "error",
  pending: "secondary",
};

const STATUS_LABELS: Record<string, string> = {
  active: "Active",
  on_leave: "On Leave",
  terminated: "Terminated",
  pending: "Pending",
};

// Recursive tree node component
function OrgTreeNode({
  node,
  level = 0,
}: {
  node: OrgChartNode;
  level?: number;
}) {
  const [expanded, setExpanded] = useState(level < 1);
  const hasChildren = node.children && node.children.length > 0;

  return (
    <div role="treeitem" aria-expanded={hasChildren ? expanded : undefined}>
      <div
        className="flex items-center gap-3 rounded-lg p-3 hover:bg-gray-50 transition-colors"
        style={{ paddingLeft: `${level * 24 + 12}px` }}
      >
        {/* Expand/collapse button */}
        {hasChildren ? (
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="flex h-6 w-6 items-center justify-center rounded hover:bg-gray-200 flex-shrink-0"
            aria-label={expanded ? "Collapse" : "Expand"}
          >
            {expanded ? (
              <ChevronDown className="h-4 w-4 text-gray-500" />
            ) : (
              <ChevronRight className="h-4 w-4 text-gray-500" />
            )}
          </button>
        ) : (
          <div className="w-6 flex-shrink-0" />
        )}

        {/* Employee info */}
        <Avatar
          src={node.photoUrl}
          name={node.displayName || `${node.firstName} ${node.lastName}`}
          size="md"
        />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h4 className="font-medium text-gray-900 truncate">
              {node.displayName || `${node.firstName} ${node.lastName}`}
            </h4>
            <Badge variant={STATUS_COLORS[node.status] ?? "secondary"} size="sm">
              {STATUS_LABELS[node.status] ?? node.status}
            </Badge>
          </div>
          <div className="flex items-center gap-3 text-sm text-gray-500">
            {node.jobTitle && (
              <span className="flex items-center gap-1 truncate">
                <Briefcase className="h-3 w-3 flex-shrink-0" aria-hidden="true" />
                {node.jobTitle}
              </span>
            )}
            {node.department && (
              <span className="truncate">{node.department}</span>
            )}
          </div>
        </div>

        {/* Quick contact */}
        {node.email && (
          <a
            href={`mailto:${node.email}`}
            className="flex h-8 w-8 items-center justify-center rounded-full text-gray-400 hover:text-blue-600 hover:bg-blue-50 flex-shrink-0"
            aria-label={`Send email to ${node.firstName} ${node.lastName}`}
          >
            <Mail className="h-4 w-4" />
          </a>
        )}

        {/* Children count indicator */}
        {hasChildren && (
          <span className="text-xs text-gray-400 flex-shrink-0">
            {node.children.length} direct {node.children.length === 1 ? "report" : "reports"}
          </span>
        )}
      </div>

      {/* Children */}
      {hasChildren && expanded && (
        <div role="group">
          {node.children.map((child) => (
            <OrgTreeNode key={child.employeeId} node={child} level={level + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

// Flat card view for the org chart
function OrgCardView({ nodes }: { nodes: OrgChartNode[] }) {
  // Flatten the tree for card view display
  const flatNodes: Array<{ node: OrgChartNode; depth: number }> = [];

  function flatten(items: OrgChartNode[], depth: number) {
    for (const item of items) {
      flatNodes.push({ node: item, depth });
      if (item.children && item.children.length > 0) {
        flatten(item.children, depth + 1);
      }
    }
  }
  flatten(nodes, 0);

  if (flatNodes.length === 0) {
    return (
      <div className="text-center py-12">
        <Users className="h-12 w-12 mx-auto text-gray-300 mb-4" />
        <h3 className="text-lg font-medium text-gray-900">No team hierarchy data</h3>
        <p className="text-gray-500 mt-1">
          Your team hierarchy could not be loaded.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {flatNodes.map(({ node, depth }) => (
        <Card key={node.employeeId} className="hover:shadow-md transition-shadow">
          <CardBody>
            <div className="flex items-start gap-3">
              <Avatar
                src={node.photoUrl}
                name={node.displayName || `${node.firstName} ${node.lastName}`}
                size="lg"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h4 className="font-medium text-gray-900 truncate">
                    {node.displayName || `${node.firstName} ${node.lastName}`}
                  </h4>
                  <Badge variant={STATUS_COLORS[node.status] ?? "secondary"} size="sm">
                    {STATUS_LABELS[node.status] ?? node.status}
                  </Badge>
                </div>
                {node.jobTitle && (
                  <p className="text-sm text-gray-600 truncate">{node.jobTitle}</p>
                )}
                {node.department && (
                  <p className="text-xs text-gray-400 mt-1">{node.department}</p>
                )}
                {depth > 0 && (
                  <p className="text-xs text-gray-400 mt-1">
                    Level {depth} report
                  </p>
                )}
              </div>
            </div>
            {node.children && node.children.length > 0 && (
              <div className="mt-3 pt-3 border-t border-gray-100 flex items-center gap-1 text-xs text-gray-500">
                <Users className="h-3 w-3" aria-hidden="true" />
                <span>
                  {node.children.length} direct {node.children.length === 1 ? "report" : "reports"}
                </span>
              </div>
            )}
          </CardBody>
        </Card>
      ))}
    </div>
  );
}

export default function ManagerOrgChartPage() {
  const [viewMode, setViewMode] = useState<"tree" | "cards">("tree");

  const {
    data,
    isLoading,
    error,
  } = useQuery({
    queryKey: [...queryKeys.manager.all(), "org-chart"],
    queryFn: () => api.get<OrgChartResponse>("/hr/org-chart"),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <Spinner size="lg" />
      </div>
    );
  }

  const tree = data?.tree ?? [];
  const totalCount = data?.totalCount ?? tree.length;

  if (error && tree.length === 0) {
    const message =
      error instanceof ApiError
        ? error.message
        : error instanceof Error
          ? error.message
          : "Unable to load organisation chart.";

    return (
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">Organisation Chart</h1>
        <p className="text-gray-500">{message}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Organisation Chart</h1>
          <p className="text-gray-600">
            View your team hierarchy
            {totalCount > 0 && (
              <span className="ml-1 text-gray-500">
                -- {totalCount} {totalCount === 1 ? "member" : "members"}
              </span>
            )}
          </p>
        </div>
        <div className="flex gap-2" role="group" aria-label="View mode">
          <button
            type="button"
            onClick={() => setViewMode("tree")}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              viewMode === "tree"
                ? "bg-blue-100 text-blue-700"
                : "text-gray-500 hover:bg-gray-100 hover:text-gray-700"
            }`}
            aria-pressed={viewMode === "tree"}
          >
            <span className="flex items-center gap-1.5">
              <User className="h-4 w-4" />
              Tree
            </span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode("cards")}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              viewMode === "cards"
                ? "bg-blue-100 text-blue-700"
                : "text-gray-500 hover:bg-gray-100 hover:text-gray-700"
            }`}
            aria-pressed={viewMode === "cards"}
          >
            <span className="flex items-center gap-1.5">
              <Users className="h-4 w-4" />
              Cards
            </span>
          </button>
        </div>
      </div>

      {/* Tree View */}
      {viewMode === "tree" && (
        <Card>
          <CardHeader>
            <h3 className="font-semibold">Team Hierarchy</h3>
          </CardHeader>
          <CardBody className="p-0">
            {tree.length === 0 ? (
              <div className="text-center py-12">
                <Users className="h-12 w-12 mx-auto text-gray-300 mb-4" />
                <h3 className="text-lg font-medium text-gray-900">No hierarchy data</h3>
                <p className="text-gray-500 mt-1">
                  Your team hierarchy has not been set up yet.
                </p>
              </div>
            ) : (
              <div role="tree" aria-label="Organisation chart" className="py-2">
                {tree.map((node) => (
                  <OrgTreeNode key={node.employeeId} node={node} level={0} />
                ))}
              </div>
            )}
          </CardBody>
        </Card>
      )}

      {/* Card View */}
      {viewMode === "cards" && <OrgCardView nodes={tree} />}
    </div>
  );
}
