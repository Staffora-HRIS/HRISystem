export { RouteErrorBoundary as ErrorBoundary } from "~/components/ui/RouteErrorBoundary";
import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { ArrowLeft, Plus, MapPin, AlertCircle, RefreshCw } from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  DataTable,
  Input,
  Modal,
  ModalHeader,
  ModalBody,
  ModalFooter,
  useToast,
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

interface CreateGeofenceForm {
  name: string;
  description: string;
  latitude: string;
  longitude: string;
  radius: string;
}

const initialGeofenceForm: CreateGeofenceForm = {
  name: "",
  description: "",
  latitude: "",
  longitude: "",
  radius: "100",
};

export default function GeofencePage() {
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [formData, setFormData] = useState<CreateGeofenceForm>(initialGeofenceForm);

  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ["admin-geofence-locations"],
    queryFn: () =>
      api.get<GeofenceLocationsResponse>("/time/geofence-zones"),
  });

  const createMutation = useMutation({
    mutationFn: (payload: {
      name: string;
      description?: string;
      latitude: number;
      longitude: number;
      radiusMeters: number;
    }) => api.post("/time/geofence-zones", payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-geofence-locations"] });
      toast.success("Geofence zone created successfully");
      setShowCreateModal(false);
      setFormData(initialGeofenceForm);
    },
    onError: (err) => {
      const message = err instanceof ApiError ? err.message : "Failed to create geofence zone";
      toast.error(message);
    },
  });

  const handleCreate = () => {
    if (!formData.name.trim()) {
      toast.warning("Please enter a zone name");
      return;
    }
    const lat = parseFloat(formData.latitude);
    const lng = parseFloat(formData.longitude);
    const radius = parseFloat(formData.radius);
    if (isNaN(lat) || lat < -90 || lat > 90) {
      toast.warning("Please enter a valid latitude (-90 to 90)");
      return;
    }
    if (isNaN(lng) || lng < -180 || lng > 180) {
      toast.warning("Please enter a valid longitude (-180 to 180)");
      return;
    }
    if (isNaN(radius) || radius <= 0) {
      toast.warning("Please enter a valid radius greater than 0");
      return;
    }
    createMutation.mutate({
      name: formData.name.trim(),
      description: formData.description.trim() || undefined,
      latitude: lat,
      longitude: lng,
      radiusMeters: radius,
    });
  };

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
        <Button onClick={() => setShowCreateModal(true)} aria-label="Add geofence zone">
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

      {/* Create Geofence Zone Modal */}
      {showCreateModal && (
        <Modal
          open
          onClose={() => {
            setShowCreateModal(false);
            setFormData(initialGeofenceForm);
          }}
          size="md"
          aria-label="Add geofence zone"
        >
          <ModalHeader>
            <h3 className="text-lg font-semibold">Add Geofence Zone</h3>
          </ModalHeader>
          <ModalBody>
            <div className="space-y-4">
              <Input
                label="Zone Name"
                placeholder="e.g. Main Office"
                required
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
              />
              <Input
                label="Description"
                placeholder="Describe this geofence zone..."
                value={formData.description}
                onChange={(e) =>
                  setFormData({ ...formData, description: e.target.value })
                }
              />
              <div className="grid grid-cols-2 gap-4">
                <Input
                  label="Latitude"
                  type="number"
                  placeholder="e.g. 51.5074"
                  required
                  value={formData.latitude}
                  onChange={(e) =>
                    setFormData({ ...formData, latitude: e.target.value })
                  }
                  hint="-90 to 90"
                />
                <Input
                  label="Longitude"
                  type="number"
                  placeholder="e.g. -0.1278"
                  required
                  value={formData.longitude}
                  onChange={(e) =>
                    setFormData({ ...formData, longitude: e.target.value })
                  }
                  hint="-180 to 180"
                />
              </div>
              <Input
                label="Radius (metres)"
                type="number"
                placeholder="e.g. 100"
                required
                value={formData.radius}
                onChange={(e) =>
                  setFormData({ ...formData, radius: e.target.value })
                }
                hint="Distance from centre point in metres"
              />
            </div>
          </ModalBody>
          <ModalFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowCreateModal(false);
                setFormData(initialGeofenceForm);
              }}
              disabled={createMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              disabled={
                !formData.name.trim() ||
                !formData.latitude ||
                !formData.longitude ||
                !formData.radius ||
                createMutation.isPending
              }
            >
              {createMutation.isPending ? "Creating..." : "Add Zone"}
            </Button>
          </ModalFooter>
        </Modal>
      )}
    </div>
  );
}
