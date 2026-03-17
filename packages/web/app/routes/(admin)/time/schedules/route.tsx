export { RouteErrorBoundary as ErrorBoundary } from "~/components/ui/RouteErrorBoundary";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { ArrowLeft, Plus, Calendar, Users, Edit, Copy } from "lucide-react";
import { Card, CardHeader, CardBody } from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
  Modal,
  ModalHeader,
  ModalBody,
  ModalFooter,
} from "~/components/ui/modal";
import { Input, Checkbox } from "~/components/ui/input";
import { useToast } from "~/components/ui/toast";
import { api } from "~/lib/api-client";
import { queryKeys } from "~/lib/query-client";

interface Schedule {
  id: string;
  name: string;
  description?: string;
  startDate: string;
  endDate: string;
  orgUnitId: string | null;
  isTemplate: boolean;
  status: string;
  createdAt: string;
  updatedAt: string;
}

interface ScheduleAssignment {
  id: string;
  employeeId: string;
  employeeName: string;
  scheduleId: string;
  scheduleName: string;
  effectiveFrom: string;
  effectiveTo?: string;
}

const statusLabels: Record<string, string> = {
  draft: "Draft",
  active: "Active",
  archived: "Archived",
};

interface CreateScheduleForm {
  name: string;
  description: string;
  startDate: string;
  endDate: string;
  isTemplate: boolean;
}

const initialCreateForm: CreateScheduleForm = {
  name: "",
  description: "",
  startDate: "",
  endDate: "",
  isTemplate: false,
};

export default function SchedulesPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [view, setView] = useState<"schedules" | "assignments">("schedules");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [formData, setFormData] = useState<CreateScheduleForm>(initialCreateForm);

  const { data: schedulesData, isLoading: schedulesLoading } = useQuery({
    queryKey: ["admin-schedules"],
    queryFn: () => api.get<{ items: Schedule[]; cursor: string | null; hasMore: boolean }>("/time/schedules"),
  });

  const { data: assignmentsData, isLoading: assignmentsLoading } = useQuery({
    queryKey: ["admin-schedule-assignments"],
    queryFn: () => api.get<{ assignments: ScheduleAssignment[]; count: number }>("/time/schedule-assignments"),
  });

  // Create schedule mutation
  const createScheduleMutation = useMutation({
    mutationFn: (data: {
      name: string;
      description?: string;
      startDate: string;
      endDate: string;
      isTemplate?: boolean;
    }) => api.post("/time/schedules", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-schedules"] });
      queryClient.invalidateQueries({ queryKey: queryKeys.time.schedules() });
      toast.success("Schedule created successfully");
      setShowCreateModal(false);
      setFormData(initialCreateForm);
    },
    onError: () => {
      toast.error("Failed to create schedule", {
        message: "Please check your input and try again.",
      });
    },
  });

  const handleCreateSchedule = () => {
    if (!formData.name.trim()) {
      toast.warning("Please enter a schedule name");
      return;
    }
    if (!formData.startDate || !formData.endDate) {
      toast.warning("Please select start and end dates");
      return;
    }
    if (new Date(formData.endDate) <= new Date(formData.startDate)) {
      toast.warning("End date must be after start date");
      return;
    }
    createScheduleMutation.mutate({
      name: formData.name.trim(),
      description: formData.description.trim() || undefined,
      startDate: formData.startDate,
      endDate: formData.endDate,
      isTemplate: formData.isTemplate || undefined,
    });
  };

  const schedules = schedulesData?.items || [];
  const assignments = assignmentsData?.assignments || [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" onClick={() => navigate("/admin/time")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900">Work Schedules</h1>
          <p className="text-gray-600">Manage work schedules and assignments</p>
        </div>
        <Button onClick={() => setShowCreateModal(true)}>
          <Plus className="h-4 w-4 mr-2" />
          New Schedule
        </Button>
      </div>

      {/* View Tabs */}
      <div className="flex gap-2 border-b">
        <button
          onClick={() => setView("schedules")}
          className={`px-4 py-2 border-b-2 -mb-px ${
            view === "schedules"
              ? "border-blue-500 text-blue-600"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          <Calendar className="h-4 w-4 inline mr-2" />
          Schedules ({schedules.length})
        </button>
        <button
          onClick={() => setView("assignments")}
          className={`px-4 py-2 border-b-2 -mb-px ${
            view === "assignments"
              ? "border-blue-500 text-blue-600"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          <Users className="h-4 w-4 inline mr-2" />
          Assignments ({assignments.length})
        </button>
      </div>

      {/* Schedules List */}
      {view === "schedules" && (
        <>
          {schedulesLoading ? (
            <div className="text-center py-8">Loading...</div>
          ) : schedules.length === 0 ? (
            <Card>
              <CardBody className="text-center py-12">
                <Calendar className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                <h3 className="text-lg font-medium text-gray-900">No schedules yet</h3>
                <p className="text-gray-500 mb-4">Create work schedules for your employees.</p>
                <Button onClick={() => setShowCreateModal(true)}>Create Schedule</Button>
              </CardBody>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {schedules.map((schedule) => (
                <Card key={schedule.id} className="hover:shadow-lg transition-shadow">
                  <CardHeader className="flex flex-row items-start justify-between">
                    <div>
                      <h3 className="font-semibold">{schedule.name}</h3>
                      {schedule.isTemplate && <Badge variant="secondary">Template</Badge>}
                    </div>
                    <Badge variant={schedule.status === "active" ? "success" : "secondary"}>
                      {statusLabels[schedule.status] || schedule.status}
                    </Badge>
                  </CardHeader>
                  <CardBody className="space-y-4">
                    <p className="text-sm text-gray-500">
                      {schedule.description || "No description"}
                    </p>
                    <div className="flex items-center gap-4 text-sm text-gray-600">
                      <span className="flex items-center gap-1">
                        <Calendar className="h-4 w-4" />
                        {new Date(schedule.startDate).toLocaleDateString()} - {new Date(schedule.endDate).toLocaleDateString()}
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" className="flex-1" onClick={() => toast.info("Coming Soon", { message: "Schedule editing will be available in a future update." })}>
                        <Edit className="h-4 w-4 mr-1" />
                        Edit
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => toast.info("Coming Soon", { message: "Schedule duplication will be available in a future update." })}>
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardBody>
                </Card>
              ))}
            </div>
          )}
        </>
      )}

      {/* Assignments List */}
      {view === "assignments" && (
        <>
          {assignmentsLoading ? (
            <div className="text-center py-8">Loading...</div>
          ) : assignments.length === 0 ? (
            <Card>
              <CardBody className="text-center py-12">
                <Users className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                <h3 className="text-lg font-medium text-gray-900">No schedule assignments</h3>
                <p className="text-gray-500 mb-4">Assign schedules to employees.</p>
                <Button onClick={() => toast.info("Coming Soon", { message: "Schedule assignment will be available in a future update." })}>Assign Schedule</Button>
              </CardBody>
            </Card>
          ) : (
            <Card>
              <CardBody className="p-0">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Employee
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Schedule
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Effective From
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Effective To
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {assignments.map((assignment) => (
                      <tr key={assignment.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 font-medium text-gray-900">
                          {assignment.employeeName}
                        </td>
                        <td className="px-6 py-4 text-gray-500">
                          {assignment.scheduleName}
                        </td>
                        <td className="px-6 py-4 text-gray-500">
                          {new Date(assignment.effectiveFrom).toLocaleDateString()}
                        </td>
                        <td className="px-6 py-4 text-gray-500">
                          {assignment.effectiveTo
                            ? new Date(assignment.effectiveTo).toLocaleDateString()
                            : <span className="text-gray-400">Current</span>
                          }
                        </td>
                        <td className="px-6 py-4 text-right">
                          <Button variant="outline" size="sm" onClick={() => toast.info("Coming Soon", { message: "Assignment editing will be available in a future update." })}>Edit</Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardBody>
            </Card>
          )}
        </>
      )}

      {/* Create Schedule Modal */}
      {showCreateModal && (
        <Modal
          open
          onClose={() => {
            setShowCreateModal(false);
            setFormData(initialCreateForm);
          }}
          size="md"
        >
          <ModalHeader>
            <h3 className="text-lg font-semibold">Create Work Schedule</h3>
          </ModalHeader>
          <ModalBody>
            <div className="space-y-4">
              <Input
                label="Schedule Name"
                placeholder="e.g. Standard Monday-Friday"
                required
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
              />
              <Input
                label="Description"
                placeholder="Describe this schedule..."
                value={formData.description}
                onChange={(e) =>
                  setFormData({ ...formData, description: e.target.value })
                }
              />
              <div className="grid grid-cols-2 gap-4">
                <Input
                  label="Start Date"
                  type="date"
                  required
                  value={formData.startDate}
                  onChange={(e) =>
                    setFormData({ ...formData, startDate: e.target.value })
                  }
                />
                <Input
                  label="End Date"
                  type="date"
                  required
                  value={formData.endDate}
                  onChange={(e) =>
                    setFormData({ ...formData, endDate: e.target.value })
                  }
                />
              </div>
              <Checkbox
                label="Save as template"
                checked={formData.isTemplate}
                onChange={(e) =>
                  setFormData({ ...formData, isTemplate: e.target.checked })
                }
              />
            </div>
          </ModalBody>
          <ModalFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowCreateModal(false);
                setFormData(initialCreateForm);
              }}
              disabled={createScheduleMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateSchedule}
              disabled={
                !formData.name.trim() ||
                !formData.startDate ||
                !formData.endDate ||
                createScheduleMutation.isPending
              }
            >
              {createScheduleMutation.isPending ? "Creating..." : "Create Schedule"}
            </Button>
          </ModalFooter>
        </Modal>
      )}
    </div>
  );
}
