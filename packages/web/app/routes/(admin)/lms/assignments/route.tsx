import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Users, BookOpen, Calendar, Send } from "lucide-react";
import { Card, CardHeader, CardBody, StatCard } from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { api } from "~/lib/api-client";

interface Enrollment {
  id: string;
  courseId: string;
  courseTitle: string;
  employeeId: string;
  employeeName: string;
  status: "enrolled" | "in_progress" | "completed";
  enrolledAt: string;
  dueDate: string | null;
  completedAt: string | null;
  score: number | null;
}

export default function LmsAssignmentsPage() {
  const [showAssign, setShowAssign] = useState(false);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["admin-enrollments"],
    queryFn: () => api.get<{ enrollments: Enrollment[]; count: number }>("/api/v1/lms/enrollments"),
  });

  const assignMutation = useMutation({
    mutationFn: (data: { courseId: string; employeeId: string; dueDate?: string }) =>
      api.post("/api/v1/lms/enrollments", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-enrollments"] });
      setShowAssign(false);
    },
  });

  const enrollments = data?.enrollments || [];

  const stats = {
    total: enrollments.length,
    inProgress: enrollments.filter(e => e.status === "in_progress").length,
    completed: enrollments.filter(e => e.status === "completed").length,
    overdue: enrollments.filter(e => e.dueDate && new Date(e.dueDate) < new Date() && e.status !== "completed").length,
  };

  const getStatusBadge = (status: string, dueDate: string | null) => {
    if (dueDate && new Date(dueDate) < new Date() && status !== "completed") {
      return <Badge variant="warning">Overdue</Badge>;
    }
    switch (status) {
      case "completed": return <Badge variant="success">Completed</Badge>;
      case "in_progress": return <Badge variant="info">In Progress</Badge>;
      default: return <Badge variant="secondary">Not Started</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Course Assignments</h1>
          <p className="text-gray-600">Manage course enrollments and assignments</p>
        </div>
        <Button onClick={() => setShowAssign(true)}>
          <Send className="h-4 w-4 mr-2" />
          Assign Course
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard title="Total Assignments" value={stats.total} icon={<Users className="h-5 w-5" />} />
        <StatCard title="In Progress" value={stats.inProgress} icon={<BookOpen className="h-5 w-5" />} />
        <StatCard title="Completed" value={stats.completed} icon={<BookOpen className="h-5 w-5" />} />
        <StatCard title="Overdue" value={stats.overdue} icon={<Calendar className="h-5 w-5" />} />
      </div>

      {showAssign && (
        <Card>
          <CardHeader>
            <h3 className="font-semibold">Assign Course</h3>
          </CardHeader>
          <CardBody>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const formData = new FormData(e.currentTarget);
                assignMutation.mutate({
                  courseId: formData.get("courseId") as string,
                  employeeId: formData.get("employeeId") as string,
                  dueDate: formData.get("dueDate") as string || undefined,
                });
              }}
              className="space-y-4"
            >
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label htmlFor="assign-course" className="block text-sm font-medium text-gray-700 mb-1">Course</label>
                  <select id="assign-course" name="courseId" required aria-label="Select course" className="w-full rounded-md border border-gray-300 p-2">
                    <option value="">Select course...</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="assign-employee" className="block text-sm font-medium text-gray-700 mb-1">Employee</label>
                  <select id="assign-employee" name="employeeId" required aria-label="Select employee" className="w-full rounded-md border border-gray-300 p-2">
                    <option value="">Select employee...</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="assign-due-date" className="block text-sm font-medium text-gray-700 mb-1">Due Date</label>
                  <input id="assign-due-date" type="date" name="dueDate" aria-label="Due date" className="w-full rounded-md border border-gray-300 p-2" />
                </div>
              </div>
              <div className="flex gap-2 justify-end">
                <Button type="button" variant="outline" onClick={() => setShowAssign(false)}>Cancel</Button>
                <Button type="submit" disabled={assignMutation.isPending}>
                  {assignMutation.isPending ? "Assigning..." : "Assign"}
                </Button>
              </div>
            </form>
          </CardBody>
        </Card>
      )}

      {isLoading ? (
        <div className="text-center py-8">Loading...</div>
      ) : enrollments.length === 0 ? (
        <Card>
          <CardBody className="text-center py-12">
            <Users className="h-12 w-12 mx-auto text-gray-400 mb-4" />
            <h3 className="text-lg font-medium text-gray-900">No assignments yet</h3>
            <p className="text-gray-500">Assign courses to employees to track their learning progress.</p>
          </CardBody>
        </Card>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Employee</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Course</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Enrolled</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Due Date</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Score</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {enrollments.map((enrollment) => (
                <tr key={enrollment.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 text-sm font-medium text-gray-900">{enrollment.employeeName}</td>
                  <td className="px-6 py-4 text-sm text-gray-500">{enrollment.courseTitle}</td>
                  <td className="px-6 py-4">{getStatusBadge(enrollment.status, enrollment.dueDate)}</td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {new Date(enrollment.enrolledAt).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {enrollment.dueDate ? new Date(enrollment.dueDate).toLocaleDateString() : "-"}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {enrollment.score !== null ? `${enrollment.score}%` : "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
