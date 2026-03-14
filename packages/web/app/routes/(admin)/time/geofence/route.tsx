import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { ArrowLeft, Plus, MapPin, AlertCircle, RefreshCw } from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  DataTable,
  type ColumnDef,
} from "~/components/ui";
import { api, ApiError } from "~/lib/api-client";

interface GeofenceLocation {
  id: string;
  name: string;
  code: string | null;
  description: string | null;
  latitude: number;
  longitude: number;
  radiusMeters: number;
  timezone: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface GeofenceLocationsResponse {
  items: GeofenceLocation[];
  nextCursor: string | null;
  hasMore: boolean;
  count: number;
}

export default function GeofencePage() {
  const navigate = useNavigate();

  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ["admin-geofence-locations"],
    queryFn: () =>
      api.get<GeofenceLocationsResponse>("/geofences/locations"),
  });

  const locations = data?.items ?? [];

  const columns = useMemo<ColumnDef<GeofenceLocation>[]>(
    () => [
      {
        id: "name",
        header: "Name",
        cell: ({ row }) => (
          <div>
            <p className="font-medium text-gray-900 dark:text-gray-100">
              {row.name}
            </p>
            {row.code && (
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {row.code}
              </p>
            )}
          </div>
        ),
      },
      {
        id: "description",
        header: "Description",
        cell: ({ row }) => (
          <span className="text-gray-700 dark:text-gray-300 text-sm">
            {row.description || "\u2014"}
          </span>
        ),
      },
      {
        id: "coordinates",
        header: "Coordinates",
        cell: ({ row }) => (
          <span className="font-mono text-sm text-gray-700 dark:text-gray-300">
            {row.latitude.toFixed(4)}, {row.longitude.toFixed(4)}
          </span>
        ),
      },
      {
        id: "radius",
        header: "Radius",
        cell: ({ row }) => (
          <span className="text-gray-700 dark:text-gray-300">
            {row.radiusMeters >= 1000
              ? `${(row.radiusMeters / 1000).toFixed(1)} km`
              : `${row.radiusMeters} m`}
          </span>
        ),
      },
      {
        id: "timezone",
        header: "Timezone",
        cell: ({ row }) => (
          <span className="text-gray-700 dark:text-gray-300 text-sm">
            {row.timezone}
          </span>
        ),
      },
      {
        id: "status",
        header: "Status",
        cell: ({ row }) => (
          <Badge variant={row.isActive ? "success" : "secondary"} dot>
            {row.isActive ? "Active" : "Inactive"}
          </Badge>
        ),
      },
    ],
    []
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          onClick={() => navigate("/admin/time")}
          aria-label="Back to Time & Attendance"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Geofence Zones
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Manage geofence locations for time and attendance tracking
          </p>
        </div>
        <Button disabled aria-label="Add geofence zone (coming soon)">
          <Plus className="h-4 w-4 mr-2" />
          Add Zone
        </Button>
      </div>

      {/* Error state */}
      {isError && (
        <div className="flex flex-col items-center justify-center py-12 space-y-4">
          <AlertCircle className="h-12 w-12 text-red-400" />
          <p className="text-gray-700 dark:text-gray-300 font-medium">
            Failed to load geofence zones
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {error instanceof ApiError
              ? error.message
              : "An unexpected error occurred."}
          </p>
          <Button variant="outline" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Retry
          </Button>
        </div>
      )}

      {/* Table */}
      {!isError && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <MapPin className="h-5 w-5 text-gray-500" />
              <h2 className="font-semibold">All Zones</h2>
            </div>
          </CardHeader>
          <CardBody padding="none">
            <DataTable
              columns={columns}
              data={locations}
              loading={isLoading}
              emptyMessage="No geofence zones found"
              emptyIcon={
                <MapPin className="h-12 w-12 text-gray-300 mb-2" />
              }
            />
          </CardBody>
        </Card>
      )}
    </div>
  );
}
