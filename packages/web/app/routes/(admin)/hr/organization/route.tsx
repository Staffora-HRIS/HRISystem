export { RouteErrorBoundary as ErrorBoundary } from "~/components/ui/RouteErrorBoundary";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import {
  Building2,
  Users,
  ChevronRight,
  ChevronDown,
  User,
  Briefcase,
  Network,
} from "lucide-react";
import {
  Card,
  CardHeader,
  CardBody,
  Button,
  Badge,
} from "~/components/ui";
import { api } from "~/lib/api-client";

interface OrgUnit {
  id: string;
  name: string;
  code: string | null;
  unitType: string;
  parentId: string | null;
  managerId: string | null;
  managerName: string | null;
  level: number;
  isActive: boolean;
  employeeCount: number;
  children?: OrgUnit[];
}

interface OrgStats {
  totalUnits: number;
  totalEmployees: number;
  departments: number;
  teams: number;
}

function buildTree(units: OrgUnit[]): OrgUnit[] {
  const map = new Map<string, OrgUnit>();
  const roots: OrgUnit[] = [];

  units.forEach((u) => map.set(u.id, { ...u, children: [] }));
  units.forEach((u) => {
    const node = map.get(u.id)!;
    if (u.parentId && map.has(u.parentId)) {
      map.get(u.parentId)!.children!.push(node);
    } else {
      roots.push(node);
    }
  });

  return roots;
}

function OrgTreeNode({ node, level = 0 }: { node: OrgUnit; level?: number }) {
  const [expanded, setExpanded] = useState(level < 2);
  const hasChildren = node.children && node.children.length > 0;

  return (
    <div className="select-none">
      <div
        className={`flex items-center gap-2 py-2 px-3 rounded-lg hover:bg-gray-50 cursor-pointer ${
          level === 0 ? "bg-blue-50" : ""
        }`}
        style={{ marginLeft: level * 24 }}
        onClick={() => hasChildren && setExpanded(!expanded)}
      >
        {hasChildren ? (
          expanded ? (
            <ChevronDown className="h-4 w-4 text-gray-400 flex-shrink-0" />
          ) : (
            <ChevronRight className="h-4 w-4 text-gray-400 flex-shrink-0" />
          )
        ) : (
          <span className="w-4" />
        )}
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-100 flex-shrink-0">
          <Building2 className="h-4 w-4 text-blue-600" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-gray-900 truncate">{node.name}</span>
            <span className="text-xs text-gray-400 capitalize">{node.unitType}</span>
          </div>
          <div className="flex items-center gap-3 text-xs text-gray-500">
            {node.managerName && (
              <span className="flex items-center gap-1">
                <User className="h-3 w-3" />
                {node.managerName}
              </span>
            )}
            <span className="flex items-center gap-1">
              <Users className="h-3 w-3" />
              {node.employeeCount} employees
            </span>
          </div>
        </div>
        <Badge variant={node.isActive ? "success" : "secondary"} className="flex-shrink-0">
          {node.isActive ? "Active" : "Inactive"}
        </Badge>
      </div>
      {expanded && hasChildren && (
        <div>
          {node.children!.map((child) => (
            <OrgTreeNode key={child.id} node={child} level={level + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function AdminOrganizationPage() {
  const [viewMode, setViewMode] = useState<"tree" | "chart">("tree");

  const { data: orgUnitsData, isLoading } = useQuery({
    queryKey: ["admin-org-units-tree"],
    queryFn: () =>
      api.get<{ items: OrgUnit[] }>("/hr/org-units?limit=200"),
  });

  const orgUnits = orgUnitsData?.items ?? [];
  const tree = buildTree(orgUnits);

  // Calculate stats
  const stats: OrgStats = {
    totalUnits: orgUnits.length,
    totalEmployees: orgUnits.reduce((sum, u) => sum + (u.employeeCount || 0), 0),
    departments: orgUnits.filter((u) => u.unitType === "department").length,
    teams: orgUnits.filter((u) => u.unitType === "team").length,
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Organization Structure</h1>
          <p className="text-gray-600">View and manage your organizational hierarchy</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-gray-200 p-1">
            <button
              onClick={() => setViewMode("tree")}
              className={`px-3 py-1 text-sm rounded ${
                viewMode === "tree"
                  ? "bg-blue-100 text-blue-700"
                  : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              Tree View
            </button>
            <button
              onClick={() => setViewMode("chart")}
              className={`px-3 py-1 text-sm rounded ${
                viewMode === "chart"
                  ? "bg-blue-100 text-blue-700"
                  : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              Org Chart
            </button>
          </div>
          <Link to="/admin/hr/departments">
            <Button variant="outline">
              <Building2 className="h-4 w-4 mr-2" />
              Manage Departments
            </Button>
          </Link>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardBody className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-blue-100">
              <Network className="h-6 w-6 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Total Units</p>
              <p className="text-2xl font-bold">{stats.totalUnits}</p>
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-green-100">
              <Building2 className="h-6 w-6 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Departments</p>
              <p className="text-2xl font-bold">{stats.departments}</p>
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-purple-100">
              <Briefcase className="h-6 w-6 text-purple-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Teams</p>
              <p className="text-2xl font-bold">{stats.teams}</p>
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-orange-100">
              <Users className="h-6 w-6 text-orange-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Total Employees</p>
              <p className="text-2xl font-bold">{stats.totalEmployees}</p>
            </div>
          </CardBody>
        </Card>
      </div>

      {/* Organization View */}
      <Card>
        <CardHeader>
          <h3 className="font-semibold">
            {viewMode === "tree" ? "Organization Tree" : "Organization Chart"}
          </h3>
        </CardHeader>
        <CardBody>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : orgUnits.length === 0 ? (
            <div className="text-center py-12">
              <Network className="h-12 w-12 mx-auto text-gray-400 mb-4" />
              <h3 className="text-lg font-medium text-gray-900">No organization structure</h3>
              <p className="text-gray-500 mb-4">
                Start by creating departments to build your organization structure.
              </p>
              <Link to="/admin/hr/departments">
                <Button>
                  <Building2 className="h-4 w-4 mr-2" />
                  Create Department
                </Button>
              </Link>
            </div>
          ) : viewMode === "tree" ? (
            <div className="space-y-1">
              {tree.map((node) => (
                <OrgTreeNode key={node.id} node={node} />
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <Network className="h-12 w-12 mx-auto text-gray-400 mb-4" />
              <h3 className="text-lg font-medium text-gray-900">Org Chart View</h3>
              <p className="text-gray-500">
                Interactive org chart visualization coming soon.
              </p>
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
