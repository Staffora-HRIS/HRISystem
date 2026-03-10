import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { ArrowLeft, Plus, Calendar, Users, Edit, Copy } from "lucide-react";
import { Card, CardHeader, CardBody } from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { api } from "~/lib/api-client";

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

export default function SchedulesPage() {
  const navigate = useNavigate();
  const [view, setView] = useState<"schedules" | "assignments">("schedules");

  const { data: schedulesData, isLoading: schedulesLoading } = useQuery({
    queryKey: ["admin-schedules"],
    queryFn: () => api.get<{ items: Schedule[]; cursor: string | null; hasMore: boolean }>("/time/schedules"),
  });

  const { data: assignmentsData, isLoading: assignmentsLoading } = useQuery({
    queryKey: ["admin-schedule-assignments"],
    queryFn: () => api.get<{ assignments: ScheduleAssignment[]; count: number }>("/time/schedule-assignments"),
  });

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
        <Button onClick={() => alert("Create schedule modal")}>
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
                <Button onClick={() => alert("Create schedule modal")}>Create Schedule</Button>
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
                      <Button variant="outline" size="sm" className="flex-1">
                        <Edit className="h-4 w-4 mr-1" />
                        Edit
                      </Button>
                      <Button variant="outline" size="sm">
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
                <Button onClick={() => alert("Assign schedule modal")}>Assign Schedule</Button>
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
                          <Button variant="outline" size="sm">Edit</Button>
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
    </div>
  );
}
