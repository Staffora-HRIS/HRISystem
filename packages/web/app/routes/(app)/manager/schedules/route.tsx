export { RouteErrorBoundary as ErrorBoundary } from "~/components/ui/RouteErrorBoundary";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Calendar,
  Clock,
  Users,
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  List,
} from "lucide-react";
import {
  Card,
  CardBody,
  StatCard,
  Button,
  Badge,
  Input,
  Textarea,
  Modal,
  ModalHeader,
  ModalBody,
  ModalFooter,
  useToast,
} from "~/components/ui";
import { Spinner } from "~/components/ui/spinner";
import { api, ApiError } from "~/lib/api-client";
import { useDirectReports } from "~/hooks/use-manager";

type Schedule = {
  id: string;
  name: string;
  description?: string | null;
  startDate: string;
  endDate: string;
  status: string;
  isTemplate: boolean;
};

type SchedulesResponse = {
  items: Schedule[];
  cursor: string | null;
  hasMore: boolean;
};

export default function ManagerSchedulesPage() {
  const [viewMode, setViewMode] = useState<"list" | "calendar">("list");
  const { team: teamMembers } = useDirectReports();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [currentWeek, setCurrentWeek] = useState(new Date());
  const [editingSchedule, setEditingSchedule] = useState<Schedule | null>(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editStartDate, setEditStartDate] = useState("");
  const [editEndDate, setEditEndDate] = useState("");

  const {
    data,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["time", "schedules"],
    queryFn: () => api.get<SchedulesResponse>("/time/schedules", { params: { limit: 20 } }),
  });

  const updateScheduleMutation = useMutation({
    mutationFn: (payload: {
      id: string;
      name?: string;
      description?: string;
      startDate?: string;
      endDate?: string;
    }) => {
      const { id, ...body } = payload;
      return api.put(`/time/schedules/${id}`, body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["time", "schedules"] });
      toast.success("Schedule updated successfully");
      setEditingSchedule(null);
    },
    onError: (err) => {
      const message =
        err instanceof ApiError ? err.message : "Failed to update schedule";
      toast.error(message);
    },
  });

  function handleEditSchedule(schedule: Schedule) {
    setEditName(schedule.name);
    setEditDescription(schedule.description || "");
    setEditStartDate(schedule.startDate.split("T")[0]);
    setEditEndDate(schedule.endDate.split("T")[0]);
    setEditingSchedule(schedule);
  }

  function handleSaveSchedule() {
    if (!editingSchedule || !editName.trim()) {
      toast.error("Schedule name is required");
      return;
    }
    updateScheduleMutation.mutate({
      id: editingSchedule.id,
      name: editName.trim(),
      description: editDescription.trim() || undefined,
      startDate: editStartDate,
      endDate: editEndDate,
    });
  }

  function handleCloseEditModal() {
    if (!updateScheduleMutation.isPending) {
      setEditingSchedule(null);
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!data) {
    const message =
      error instanceof ApiError
        ? error.message
        : error instanceof Error
          ? error.message
          : "Unable to load schedules.";
    return (
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">Schedules</h1>
        <p className="text-gray-500">{message}</p>
      </div>
    );
  }

  const templates = data.items.filter((s) => s.isTemplate).length;
  const active = data.items.filter((s) => s.status === "active").length;

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "active": return <Badge variant="success">Active</Badge>;
      case "draft": return <Badge variant="secondary">Draft</Badge>;
      case "archived": return <Badge variant="outline">Archived</Badge>;
      default: return <Badge>{status}</Badge>;
    }
  };

  const prevWeek = () => {
    const newDate = new Date(currentWeek);
    newDate.setDate(newDate.getDate() - 7);
    setCurrentWeek(newDate);
  };

  const nextWeek = () => {
    const newDate = new Date(currentWeek);
    newDate.setDate(newDate.getDate() + 7);
    setCurrentWeek(newDate);
  };

  const getWeekDays = () => {
    const days = [];
    const startOfWeek = new Date(currentWeek);
    startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
    for (let i = 0; i < 7; i++) {
      const day = new Date(startOfWeek);
      day.setDate(day.getDate() + i);
      days.push(day);
    }
    return days;
  };

  const weekDays = getWeekDays();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Team Schedules</h1>
          <p className="text-gray-600 dark:text-gray-400">View and manage team work schedules</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant={viewMode === "list" ? "primary" : "outline"}
            size="sm"
            onClick={() => setViewMode("list")}
          >
            <List className="h-4 w-4 mr-1" />
            List
          </Button>
          <Button
            variant={viewMode === "calendar" ? "primary" : "outline"}
            size="sm"
            onClick={() => setViewMode("calendar")}
          >
            <LayoutGrid className="h-4 w-4 mr-1" />
            Calendar
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard
          title="Total Schedules"
          value={String(data.items.length)}
          icon={<Calendar className="h-5 w-5" />}
        />
        <StatCard
          title="Active"
          value={String(active)}
          icon={<Clock className="h-5 w-5" />}
        />
        <StatCard
          title="Templates"
          value={String(templates)}
          icon={<LayoutGrid className="h-5 w-5" />}
        />
        <StatCard
          title="Team Members"
          value={String(teamMembers.length)}
          icon={<Users className="h-5 w-5" />}
        />
      </div>

      {viewMode === "calendar" && (
        <Card>
          <CardBody>
            <div className="flex items-center justify-between mb-4">
              <Button variant="outline" size="sm" onClick={prevWeek}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <h3 className="font-semibold">
                Week of {weekDays[0].toLocaleDateString("en-GB", { month: "short", day: "numeric" })} -{" "}
                {weekDays[6].toLocaleDateString("en-GB", { month: "short", day: "numeric", year: "numeric" })}
              </h3>
              <Button variant="outline" size="sm" onClick={nextWeek}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
            <div className="grid grid-cols-7 gap-2">
              {weekDays.map((day) => (
                <div key={day.toISOString()} className="text-center">
                  <div className="text-xs text-gray-500 mb-1">
                    {day.toLocaleDateString("en-GB", { weekday: "short" })}
                  </div>
                  <div className={`text-sm font-medium p-2 rounded-lg ${
                    day.toDateString() === new Date().toDateString()
                      ? "bg-blue-100 text-blue-700"
                      : "bg-gray-50"
                  }`}>
                    {day.getDate()}
                  </div>
                  <div className="mt-2 space-y-1">
                    <div className="text-xs bg-green-100 text-green-700 rounded px-1 py-0.5 truncate">
                      9am-5pm
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardBody>
        </Card>
      )}

      {viewMode === "list" && (
        <div className="space-y-4">
          {data.items.length === 0 ? (
            <Card>
              <CardBody className="text-center py-12">
                <Calendar className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                <h3 className="text-lg font-medium text-gray-900 dark:text-white">No schedules found</h3>
                <p className="text-gray-500 dark:text-gray-400">Create a schedule to get started.</p>
              </CardBody>
            </Card>
          ) : (
            data.items.map((schedule) => (
              <Card key={schedule.id} className="hover:shadow-md transition-shadow">
                <CardBody>
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <h3 className="font-semibold text-gray-900 dark:text-white">{schedule.name}</h3>
                        {getStatusBadge(schedule.status)}
                        {schedule.isTemplate && (
                          <Badge variant="outline">Template</Badge>
                        )}
                      </div>
                      {schedule.description && (
                        <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">{schedule.description}</p>
                      )}
                      <div className="flex items-center gap-4 text-sm text-gray-500 dark:text-gray-400">
                        <span className="flex items-center gap-1">
                          <Calendar className="h-4 w-4" />
                          {new Date(schedule.startDate).toLocaleDateString()} –{" "}
                          {new Date(schedule.endDate).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleEditSchedule(schedule)}
                    >
                      Edit
                    </Button>
                  </div>
                </CardBody>
              </Card>
            ))
          )}
        </div>
      )}

      {/* Edit Schedule Modal */}
      <Modal open={editingSchedule !== null} onClose={handleCloseEditModal} size="lg">
        <ModalHeader title="Edit Schedule" />
        <ModalBody>
          <div className="space-y-4">
            <Input
              label="Schedule Name"
              placeholder="e.g. Morning Shift"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              required
              id="edit-schedule-name"
            />
            <Textarea
              label="Description"
              placeholder="Describe this schedule..."
              value={editDescription}
              onChange={(e) => setEditDescription(e.target.value)}
              rows={3}
              id="edit-schedule-description"
            />
            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Start Date"
                type="date"
                value={editStartDate}
                onChange={(e) => setEditStartDate(e.target.value)}
                id="edit-schedule-start"
              />
              <Input
                label="End Date"
                type="date"
                value={editEndDate}
                onChange={(e) => setEditEndDate(e.target.value)}
                id="edit-schedule-end"
              />
            </div>
          </div>
        </ModalBody>
        <ModalFooter>
          <Button
            variant="outline"
            onClick={handleCloseEditModal}
            disabled={updateScheduleMutation.isPending}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSaveSchedule}
            disabled={!editName.trim() || updateScheduleMutation.isPending}
            loading={updateScheduleMutation.isPending}
          >
            {updateScheduleMutation.isPending ? "Saving..." : "Save Changes"}
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}
