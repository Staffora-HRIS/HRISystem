import { useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { Users, Search, LayoutGrid, List, Mail, Phone } from "lucide-react";
import { Card, CardBody } from "~/components/ui/card";
import { SearchInput } from "~/components/ui/search-input";
import { Avatar } from "~/components/ui/avatar";
import { Badge } from "~/components/ui/badge";
import { Select, Button } from "~/components/ui";
import { Spinner } from "~/components/ui/spinner";
import { api, ApiError } from "~/lib/api-client";
import { queryKeys } from "~/lib/query-client";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DirectoryEmployee {
  id: string;
  employeeNumber: string;
  firstName: string;
  lastName: string;
  preferredName: string | null;
  positionTitle: string | null;
  departmentId: string | null;
  departmentName: string | null;
  workEmail: string | null;
  workPhone: string | null;
  startDate: string | null;
}

interface DirectoryResponse {
  employees: DirectoryEmployee[];
  nextCursor: string | null;
  hasMore: boolean;
}

interface Department {
  id: string;
  name: string;
  employeeCount: number;
}

interface DepartmentsResponse {
  departments: Department[];
}

type ViewMode = "grid" | "list";

// ---------------------------------------------------------------------------
// Employee Card (Grid View)
// ---------------------------------------------------------------------------

function EmployeeCard({ employee }: { employee: DirectoryEmployee }) {
  const displayName = employee.preferredName
    ? `${employee.preferredName} ${employee.lastName}`
    : `${employee.firstName} ${employee.lastName}`;

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardBody className="p-4">
        <div className="flex flex-col items-center text-center space-y-3">
          <Avatar
            name={displayName}
            size="xl"
          />
          <div className="space-y-1 min-w-0 w-full">
            <h3 className="font-semibold text-gray-900 truncate" title={displayName}>
              {displayName}
            </h3>
            {employee.positionTitle && (
              <p className="text-sm text-gray-600 truncate" title={employee.positionTitle}>
                {employee.positionTitle}
              </p>
            )}
            {employee.departmentName && (
              <Badge variant="default" size="sm">
                {employee.departmentName}
              </Badge>
            )}
          </div>
          <div className="w-full space-y-1.5 pt-2 border-t border-gray-100">
            {employee.workEmail && (
              <a
                href={`mailto:${employee.workEmail}`}
                className="flex items-center gap-2 text-sm text-gray-500 hover:text-primary-600 transition-colors truncate"
                title={employee.workEmail}
              >
                <Mail className="h-3.5 w-3.5 flex-shrink-0" />
                <span className="truncate">{employee.workEmail}</span>
              </a>
            )}
            {employee.workPhone && (
              <a
                href={`tel:${employee.workPhone}`}
                className="flex items-center gap-2 text-sm text-gray-500 hover:text-primary-600 transition-colors"
                title={employee.workPhone}
              >
                <Phone className="h-3.5 w-3.5 flex-shrink-0" />
                <span className="truncate">{employee.workPhone}</span>
              </a>
            )}
            {!employee.workEmail && !employee.workPhone && (
              <p className="text-sm text-gray-400 italic">No contact info available</p>
            )}
          </div>
        </div>
      </CardBody>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Employee Row (List View)
// ---------------------------------------------------------------------------

function EmployeeRow({ employee }: { employee: DirectoryEmployee }) {
  const displayName = employee.preferredName
    ? `${employee.preferredName} ${employee.lastName}`
    : `${employee.firstName} ${employee.lastName}`;

  return (
    <div className="flex items-center gap-4 p-4 hover:bg-gray-50 transition-colors border-b border-gray-100 last:border-b-0">
      <Avatar name={displayName} size="md" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <h3 className="font-medium text-gray-900 truncate">{displayName}</h3>
          {employee.departmentName && (
            <Badge variant="default" size="sm">
              {employee.departmentName}
            </Badge>
          )}
        </div>
        {employee.positionTitle && (
          <p className="text-sm text-gray-600 truncate">{employee.positionTitle}</p>
        )}
      </div>
      <div className="hidden md:flex items-center gap-4 flex-shrink-0">
        {employee.workEmail && (
          <a
            href={`mailto:${employee.workEmail}`}
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-primary-600 transition-colors"
            title={employee.workEmail}
          >
            <Mail className="h-4 w-4" />
            <span className="hidden lg:inline max-w-[200px] truncate">{employee.workEmail}</span>
          </a>
        )}
        {employee.workPhone && (
          <a
            href={`tel:${employee.workPhone}`}
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-primary-600 transition-colors"
            title={employee.workPhone}
          >
            <Phone className="h-4 w-4" />
            <span className="hidden lg:inline">{employee.workPhone}</span>
          </a>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function EmployeeDirectoryPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [cursor, setCursor] = useState<string | undefined>(undefined);

  // Derive filters object for query key scoping
  const filters = {
    search: searchQuery || undefined,
    departmentId: departmentFilter || undefined,
    cursor,
  };

  // Fetch departments for the filter dropdown
  const { data: departmentsData } = useQuery({
    queryKey: queryKeys.directory.departments(),
    queryFn: () => api.get<DepartmentsResponse>("/portal/directory/departments"),
  });

  // Fetch employee directory
  const {
    data: directoryData,
    isLoading,
    isFetching,
    error,
  } = useQuery({
    queryKey: queryKeys.directory.search(filters),
    queryFn: () =>
      api.get<DirectoryResponse>("/portal/directory", {
        params: {
          search: searchQuery || undefined,
          departmentId: departmentFilter || undefined,
          cursor,
          limit: 24,
        },
      }),
  });

  const handleSearch = useCallback((value: string) => {
    setSearchQuery(value);
    setCursor(undefined); // Reset pagination on new search
  }, []);

  const handleDepartmentChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      setDepartmentFilter(e.target.value);
      setCursor(undefined); // Reset pagination on filter change
    },
    []
  );

  const handleLoadMore = useCallback(() => {
    if (directoryData?.nextCursor) {
      setCursor(directoryData.nextCursor);
    }
  }, [directoryData?.nextCursor]);

  const employees = directoryData?.employees ?? [];
  const departments = departmentsData?.departments ?? [];

  const departmentOptions = [
    { value: "", label: "All Departments" },
    ...departments.map((d) => ({
      value: d.id,
      label: `${d.name} (${d.employeeCount})`,
    })),
  ];

  const errorMessage =
    error instanceof ApiError
      ? error.message
      : error instanceof Error
        ? error.message
        : "Failed to load directory.";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Employee Directory</h1>
        <p className="text-gray-600">
          Find and connect with colleagues across the organisation
        </p>
      </div>

      {/* Filters and Controls */}
      <Card>
        <CardBody className="p-4">
          <div className="flex flex-col sm:flex-row gap-3">
            {/* Search */}
            <div className="flex-1">
              <SearchInput
                placeholder="Search by name, position, or employee number..."
                onSearch={handleSearch}
                loading={isFetching}
                size="md"
              />
            </div>

            {/* Department Filter */}
            <div className="w-full sm:w-56">
              <Select
                value={departmentFilter}
                onChange={handleDepartmentChange}
                options={departmentOptions}
                id="department-filter"
              />
            </div>

            {/* View Toggle */}
            <div className="flex rounded-lg border border-gray-300 overflow-hidden flex-shrink-0">
              <button
                type="button"
                onClick={() => setViewMode("grid")}
                className={`p-2.5 transition-colors ${
                  viewMode === "grid"
                    ? "bg-primary-50 text-primary-600"
                    : "bg-white text-gray-500 hover:text-gray-700 hover:bg-gray-50"
                }`}
                aria-label="Grid view"
                title="Grid view"
              >
                <LayoutGrid className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setViewMode("list")}
                className={`p-2.5 border-l border-gray-300 transition-colors ${
                  viewMode === "list"
                    ? "bg-primary-50 text-primary-600"
                    : "bg-white text-gray-500 hover:text-gray-700 hover:bg-gray-50"
                }`}
                aria-label="List view"
                title="List view"
              >
                <List className="h-4 w-4" />
              </button>
            </div>
          </div>
        </CardBody>
      </Card>

      {/* Loading State */}
      {isLoading && (
        <div className="flex items-center justify-center min-h-[300px]">
          <Spinner size="lg" />
        </div>
      )}

      {/* Error State */}
      {!isLoading && error && (
        <Card>
          <CardBody className="p-8 text-center">
            <Users className="h-12 w-12 mx-auto text-gray-300 mb-3" />
            <p className="text-gray-500">{errorMessage}</p>
          </CardBody>
        </Card>
      )}

      {/* Empty State */}
      {!isLoading && !error && employees.length === 0 && (
        <Card>
          <CardBody className="p-8 text-center">
            <Search className="h-12 w-12 mx-auto text-gray-300 mb-3" />
            <p className="font-medium text-gray-700">No employees found</p>
            <p className="text-sm text-gray-500 mt-1">
              {searchQuery || departmentFilter
                ? "Try adjusting your search or filters."
                : "No active employees in the directory yet."}
            </p>
          </CardBody>
        </Card>
      )}

      {/* Results */}
      {!isLoading && !error && employees.length > 0 && (
        <>
          {/* Result Count */}
          <div className="flex items-center justify-between text-sm text-gray-500">
            <span>
              Showing {employees.length} employee{employees.length !== 1 ? "s" : ""}
              {searchQuery && (
                <span>
                  {" "}matching &ldquo;<span className="font-medium text-gray-700">{searchQuery}</span>&rdquo;
                </span>
              )}
            </span>
            {isFetching && !isLoading && (
              <Spinner size="sm" />
            )}
          </div>

          {/* Grid View */}
          {viewMode === "grid" && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {employees.map((employee) => (
                <EmployeeCard key={employee.id} employee={employee} />
              ))}
            </div>
          )}

          {/* List View */}
          {viewMode === "list" && (
            <Card>
              <div className="divide-y divide-gray-100">
                {employees.map((employee) => (
                  <EmployeeRow key={employee.id} employee={employee} />
                ))}
              </div>
            </Card>
          )}

          {/* Load More */}
          {directoryData?.hasMore && (
            <div className="flex justify-center pt-2">
              <Button
                variant="outline"
                onClick={handleLoadMore}
                disabled={isFetching}
                loading={isFetching && !isLoading}
              >
                Load More
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
