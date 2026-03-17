export { RouteErrorBoundary as ErrorBoundary } from "~/components/ui/RouteErrorBoundary";

import { useState, useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Users,
  User,
  ChevronDown,
  ChevronUp,
  Mail,
  Briefcase,
  Building2,
  Network,
  X,
} from "lucide-react";
import {
  Card,
  CardHeader,
  CardBody,
  Badge,
  type BadgeVariant,
  Avatar,
  Spinner,
  Button,
} from "~/components/ui";
import { api, ApiError } from "~/lib/api-client";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type PortalMeResponse = {
  user: { id: string; email: string; firstName?: string | null; lastName?: string | null };
  employee: {
    id: string;
    employeeNumber: string;
    firstName: string;
    lastName: string;
    positionTitle?: string | null;
    orgUnitName?: string | null;
    status: string;
    hireDate?: string | null;
  } | null;
  tenant: { id: string; name: string };
};

/** A node returned by the reporting-chain endpoint. */
interface ChainNode {
  id: string;
  employeeId: string;
  name: string;
  title?: string;
  level: number;
}

/** A node returned by the direct-reports endpoint. */
interface DirectReport {
  id: string;
  employeeId: string;
  name: string;
  title?: string;
  department?: string;
  photoUrl?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STATUS_COLORS: Record<string, BadgeVariant> = {
  active: "success",
  on_leave: "warning",
  terminated: "error",
  pending: "secondary",
};

// ---------------------------------------------------------------------------
// Employee Detail Panel
// ---------------------------------------------------------------------------

interface EmployeeDetailProps {
  name: string;
  title?: string;
  department?: string;
  email?: string;
  photoUrl?: string;
  relationship: string;
  onClose: () => void;
}

function EmployeeDetailPanel({
  name,
  title,
  department,
  email,
  photoUrl,
  relationship,
  onClose,
}: EmployeeDetailProps) {
  return (
    <Card>
      <CardHeader className="flex items-center justify-between">
        <h3 className="font-semibold text-gray-900">Employee Details</h3>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
          aria-label="Close details"
        >
          <X className="h-4 w-4" />
        </button>
      </CardHeader>
      <CardBody>
        <div className="flex items-start gap-4">
          <Avatar src={photoUrl} name={name} size="xl" />
          <div className="flex-1 min-w-0 space-y-2">
            <div>
              <h4 className="text-lg font-semibold text-gray-900 truncate">{name}</h4>
              <Badge
                variant={STATUS_COLORS.active ?? "secondary"}
                size="sm"
                className="mt-1"
              >
                {relationship}
              </Badge>
            </div>
            {title && (
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <Briefcase className="h-4 w-4 flex-shrink-0 text-gray-400" aria-hidden="true" />
                <span className="truncate">{title}</span>
              </div>
            )}
            {department && (
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <Building2 className="h-4 w-4 flex-shrink-0 text-gray-400" aria-hidden="true" />
                <span className="truncate">{department}</span>
              </div>
            )}
            {email && (
              <div className="flex items-center gap-2 text-sm">
                <Mail className="h-4 w-4 flex-shrink-0 text-gray-400" aria-hidden="true" />
                <a
                  href={`mailto:${email}`}
                  className="text-blue-600 hover:text-blue-800 hover:underline truncate"
                >
                  {email}
                </a>
              </div>
            )}
          </div>
        </div>
      </CardBody>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Chain Node Row
// ---------------------------------------------------------------------------

interface ChainNodeRowProps {
  node: ChainNode;
  isCurrent: boolean;
  label: string;
  onClick: () => void;
}

function ChainNodeRow({ node, isCurrent, label, onClick }: ChainNodeRowProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-lg p-3 text-left transition-colors ${
        isCurrent
          ? "bg-blue-50 border border-blue-200 ring-1 ring-blue-100"
          : "hover:bg-gray-50 border border-transparent"
      }`}
      aria-label={`View details for ${node.name}`}
    >
      <Avatar name={node.name} size="md" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={`font-medium truncate ${isCurrent ? "text-blue-900" : "text-gray-900"}`}>
            {node.name}
          </span>
          {isCurrent && (
            <Badge variant="info" size="sm">You</Badge>
          )}
        </div>
        {node.title && (
          <p className="text-sm text-gray-500 truncate">{node.title}</p>
        )}
      </div>
      <span className="text-xs text-gray-400 flex-shrink-0">{label}</span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Direct Report Row
// ---------------------------------------------------------------------------

interface DirectReportRowProps {
  report: DirectReport;
  onClick: () => void;
}

function DirectReportRow({ report, onClick }: DirectReportRowProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-lg p-3 text-left hover:bg-gray-50 border border-transparent transition-colors"
      aria-label={`View details for ${report.name}`}
    >
      <Avatar src={report.photoUrl} name={report.name} size="md" />
      <div className="flex-1 min-w-0">
        <span className="font-medium text-gray-900 truncate block">{report.name}</span>
        {report.title && (
          <p className="text-sm text-gray-500 truncate">{report.title}</p>
        )}
        {report.department && (
          <p className="text-xs text-gray-400 truncate">{report.department}</p>
        )}
      </div>
      <span className="text-xs text-gray-400 flex-shrink-0">Direct report</span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function MyOrgChartPage() {
  const [selectedPerson, setSelectedPerson] = useState<{
    name: string;
    title?: string;
    department?: string;
    photoUrl?: string;
    relationship: string;
  } | null>(null);

  // Fetch current user profile
  const {
    data: me,
    isLoading: meLoading,
    error: meError,
  } = useQuery({
    queryKey: ["portal", "me"],
    queryFn: () => api.get<PortalMeResponse>("/portal/me"),
  });

  const employeeId = me?.employee?.id ?? null;

  // Fetch reporting chain (managers above the current employee)
  const {
    data: chainData,
    isLoading: chainLoading,
    error: chainError,
  } = useQuery({
    queryKey: ["org-chart", "reporting-chain", employeeId],
    enabled: Boolean(employeeId),
    queryFn: () =>
      api.get<{ chain: ChainNode[] }>(`/hr/org-chart/reporting-chain/${employeeId}`),
    retry: (failureCount, err) => {
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) return false;
      return failureCount < 2;
    },
  });

  // Fetch direct reports (employees below the current employee)
  const {
    data: reportsData,
    isLoading: reportsLoading,
    error: reportsError,
  } = useQuery({
    queryKey: ["org-chart", "direct-reports", employeeId],
    enabled: Boolean(employeeId),
    queryFn: () =>
      api.get<{ items: DirectReport[] }>(`/hr/org-chart/direct-reports/${employeeId}`),
    retry: (failureCount, err) => {
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) return false;
      return failureCount < 2;
    },
  });

  // The chain comes back ordered from the employee upward.
  // We want to display it top-down (CEO first, then descending to the current user).
  const chain = useMemo(() => {
    if (!chainData?.chain) return [];
    // Reverse so the top of the chain (highest level manager) appears first.
    return [...chainData.chain].reverse();
  }, [chainData?.chain]);

  const directReports = reportsData?.items ?? [];
  const isLoadingData = chainLoading || reportsLoading;

  // Determine if permission was denied on the org-chart endpoints
  const permissionDenied =
    (chainError instanceof ApiError && chainError.status === 403) ||
    (reportsError instanceof ApiError && reportsError.status === 403);

  // Build the "current user" node for the centre of the tree
  const currentNode: ChainNode | null = useMemo(() => {
    if (!me?.employee) return null;
    return {
      id: me.employee.id,
      employeeId: me.employee.id,
      name: `${me.employee.firstName} ${me.employee.lastName}`,
      title: me.employee.positionTitle ?? undefined,
      level: 0,
    };
  }, [me?.employee]);

  const handleSelectChainNode = useCallback(
    (node: ChainNode, relationship: string) => {
      setSelectedPerson({
        name: node.name,
        title: node.title,
        relationship,
      });
    },
    [],
  );

  const handleSelectReport = useCallback((report: DirectReport) => {
    setSelectedPerson({
      name: report.name,
      title: report.title,
      department: report.department,
      photoUrl: report.photoUrl,
      relationship: "Direct report",
    });
  }, []);

  // ------------- Loading state ----------------
  if (meLoading) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <Spinner size="lg" />
      </div>
    );
  }

  // ------------- Error / no employee ----------------
  if (!me) {
    const message =
      meError instanceof ApiError
        ? meError.message
        : meError instanceof Error
          ? meError.message
          : "Unable to load your profile.";

    return (
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">Organisation Chart</h1>
        <p className="text-gray-500">{message}</p>
      </div>
    );
  }

  if (!me.employee) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Organisation Chart</h1>
          <p className="text-gray-600">View where you sit in the organisation</p>
        </div>
        <Card>
          <CardBody className="text-center py-12">
            <Network className="h-12 w-12 mx-auto text-gray-300 mb-4" aria-hidden="true" />
            <h3 className="text-lg font-medium text-gray-900">No employee profile</h3>
            <p className="text-gray-500 mt-1">
              Your account is not linked to an employee profile. Contact your HR administrator.
            </p>
          </CardBody>
        </Card>
      </div>
    );
  }

  // ------------- Permission denied ----------------
  if (permissionDenied) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Organisation Chart</h1>
          <p className="text-gray-600">View where you sit in the organisation</p>
        </div>
        <Card>
          <CardBody className="text-center py-12">
            <Network className="h-12 w-12 mx-auto text-gray-300 mb-4" aria-hidden="true" />
            <h3 className="text-lg font-medium text-gray-900">Access not available</h3>
            <p className="text-gray-500 mt-1">
              You do not currently have access to view the organisation chart.
              Contact your HR administrator if you believe this is an error.
            </p>
          </CardBody>
        </Card>
      </div>
    );
  }

  // ------------- Non-403 error on chain or reports ----------------
  const dataError = chainError || reportsError;
  if (dataError && !permissionDenied && !isLoadingData) {
    const message =
      dataError instanceof ApiError
        ? dataError.message
        : dataError instanceof Error
          ? dataError.message
          : "Unable to load organisation chart data.";

    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Organisation Chart</h1>
          <p className="text-gray-600">View where you sit in the organisation</p>
        </div>
        <Card>
          <CardBody className="text-center py-12">
            <Network className="h-12 w-12 mx-auto text-gray-300 mb-4" aria-hidden="true" />
            <h3 className="text-lg font-medium text-gray-900">Failed to load</h3>
            <p className="text-gray-500 mt-1">{message}</p>
            <div className="mt-4">
              <Button
                variant="outline"
                onClick={() => window.location.reload()}
              >
                Try again
              </Button>
            </div>
          </CardBody>
        </Card>
      </div>
    );
  }

  // Separate the chain into managers-above and current-user.
  // The chain includes the current employee at the end (since we reversed),
  // so we split it out.
  const managersAbove = currentNode
    ? chain.filter((n) => n.employeeId !== currentNode.employeeId && n.id !== currentNode.id)
    : chain;

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Organisation Chart</h1>
        <p className="text-gray-600">
          {me.employee.firstName} {me.employee.lastName} -- View where you sit in the organisation
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main tree column */}
        <div className="lg:col-span-2 space-y-4">
          {/* Management chain (above) */}
          {isLoadingData ? (
            <Card>
              <CardBody className="flex items-center justify-center py-12">
                <Spinner size="lg" />
              </CardBody>
            </Card>
          ) : (
            <>
              {/* Managers above */}
              {managersAbove.length > 0 && (
                <Card>
                  <CardHeader className="flex items-center gap-2">
                    <ChevronUp className="h-4 w-4 text-gray-500" aria-hidden="true" />
                    <h3 className="font-semibold text-gray-900">Management Chain</h3>
                    <span className="text-sm text-gray-400 ml-auto">
                      {managersAbove.length} {managersAbove.length === 1 ? "level" : "levels"} above
                    </span>
                  </CardHeader>
                  <CardBody className="space-y-1">
                    {managersAbove.map((node, index) => {
                      const isTopLevel = index === 0;
                      const label = isTopLevel ? "Top-level" : `Level ${index + 1}`;
                      return (
                        <div key={node.id || node.employeeId}>
                          <ChainNodeRow
                            node={node}
                            isCurrent={false}
                            label={label}
                            onClick={() => handleSelectChainNode(node, `Manager (${label})`)}
                          />
                          {/* Connector line */}
                          <div className="flex justify-center py-1" aria-hidden="true">
                            <div className="h-4 w-px bg-gray-200" />
                          </div>
                        </div>
                      );
                    })}
                  </CardBody>
                </Card>
              )}

              {/* Current user (centre) */}
              {currentNode && (
                <Card className="border-blue-200 ring-1 ring-blue-100">
                  <CardHeader className="flex items-center gap-2 bg-blue-50 rounded-t-lg">
                    <User className="h-4 w-4 text-blue-600" aria-hidden="true" />
                    <h3 className="font-semibold text-blue-900">You</h3>
                  </CardHeader>
                  <CardBody>
                    <div className="flex items-center gap-4">
                      <Avatar
                        name={currentNode.name}
                        size="lg"
                      />
                      <div className="flex-1 min-w-0">
                        <h4 className="text-lg font-semibold text-gray-900 truncate">
                          {currentNode.name}
                        </h4>
                        {currentNode.title && (
                          <p className="text-sm text-gray-600 truncate flex items-center gap-1.5">
                            <Briefcase className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" aria-hidden="true" />
                            {currentNode.title}
                          </p>
                        )}
                        {me.employee.orgUnitName && (
                          <p className="text-sm text-gray-500 truncate flex items-center gap-1.5 mt-0.5">
                            <Building2 className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" aria-hidden="true" />
                            {me.employee.orgUnitName}
                          </p>
                        )}
                      </div>
                      {directReports.length > 0 && (
                        <div className="text-center flex-shrink-0">
                          <div className="text-2xl font-bold text-blue-600">{directReports.length}</div>
                          <div className="text-xs text-gray-500">
                            direct {directReports.length === 1 ? "report" : "reports"}
                          </div>
                        </div>
                      )}
                    </div>
                  </CardBody>
                </Card>
              )}

              {/* Connector between current user and direct reports */}
              {directReports.length > 0 && (
                <div className="flex justify-center" aria-hidden="true">
                  <div className="h-4 w-px bg-gray-200" />
                </div>
              )}

              {/* Direct reports (below) */}
              {directReports.length > 0 && (
                <Card>
                  <CardHeader className="flex items-center gap-2">
                    <ChevronDown className="h-4 w-4 text-gray-500" aria-hidden="true" />
                    <h3 className="font-semibold text-gray-900">Direct Reports</h3>
                    <span className="text-sm text-gray-400 ml-auto">
                      {directReports.length} {directReports.length === 1 ? "person" : "people"}
                    </span>
                  </CardHeader>
                  <CardBody className="space-y-1">
                    {directReports.map((report) => (
                      <DirectReportRow
                        key={report.id || report.employeeId}
                        report={report}
                        onClick={() => handleSelectReport(report)}
                      />
                    ))}
                  </CardBody>
                </Card>
              )}

              {/* Empty state for no hierarchy data */}
              {managersAbove.length === 0 && directReports.length === 0 && currentNode && (
                <Card>
                  <CardBody className="text-center py-8">
                    <Users className="h-10 w-10 mx-auto text-gray-300 mb-3" aria-hidden="true" />
                    <p className="text-gray-500">
                      No management chain or direct reports found.
                      Your organisation structure may not be fully configured yet.
                    </p>
                  </CardBody>
                </Card>
              )}
            </>
          )}
        </div>

        {/* Detail sidebar */}
        <div className="space-y-4">
          {selectedPerson ? (
            <EmployeeDetailPanel
              name={selectedPerson.name}
              title={selectedPerson.title}
              department={selectedPerson.department}
              photoUrl={selectedPerson.photoUrl}
              relationship={selectedPerson.relationship}
              onClose={() => setSelectedPerson(null)}
            />
          ) : (
            <Card>
              <CardBody className="text-center py-8">
                <User className="h-10 w-10 mx-auto text-gray-300 mb-3" aria-hidden="true" />
                <p className="text-sm text-gray-500">
                  Click on a person to view their details
                </p>
              </CardBody>
            </Card>
          )}

          {/* Quick stats card */}
          <Card>
            <CardHeader>
              <h3 className="font-semibold text-gray-900">Position Summary</h3>
            </CardHeader>
            <CardBody className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500">Your position</span>
                <span className="font-medium text-gray-900 truncate ml-2">
                  {me.employee.positionTitle ?? "Not set"}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500">Department</span>
                <span className="font-medium text-gray-900 truncate ml-2">
                  {me.employee.orgUnitName ?? "Not set"}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500">Management levels above</span>
                <span className="font-medium text-gray-900">{managersAbove.length}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500">Direct reports</span>
                <span className="font-medium text-gray-900">{directReports.length}</span>
              </div>
              {me.employee.hireDate && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500">Hire date</span>
                  <span className="font-medium text-gray-900">
                    {new Date(me.employee.hireDate).toLocaleDateString("en-GB", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </span>
                </div>
              )}
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}
