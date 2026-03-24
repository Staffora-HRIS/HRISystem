export { RouteErrorBoundary as ErrorBoundary } from "~/components/ui/RouteErrorBoundary";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { BookOpen, Plus, Users, Award, X } from "lucide-react";
import { Card, CardBody, StatCard } from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { useToast } from "~/components/ui/toast";
import { api } from "~/lib/api-client";

interface Course {
  id: string;
  title: string;
  description: string;
  category: string;
  durationMinutes: number;
  status: "draft" | "published" | "archived";
  enrollmentCount: number;
  completionCount: number;
  createdAt: string;
}

interface CourseFormData {
  title: string;
  description: string;
  category: string;
  durationMinutes: string;
}

const initialCourseForm: CourseFormData = {
  title: "",
  description: "",
  category: "general",
  durationMinutes: "30",
};

export default function LmsAdminPage() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [formData, setFormData] = useState<CourseFormData>(initialCourseForm);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-courses"],
    queryFn: () => api.get<{ courses: Course[]; count: number }>("/lms/courses"),
  });

  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      api.post("/lms/courses", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-courses"] });
      toast.success("Course created successfully");
      setShowCreateModal(false);
      setFormData(initialCourseForm);
    },
    onError: () => {
      toast.error("Failed to create course", {
        message: "Please check your input and try again.",
      });
    },
  });

  const handleCreate = () => {
    if (!formData.title.trim()) {
      toast.warning("Please enter a course title");
      return;
    }
    createMutation.mutate({
      title: formData.title.trim(),
      description: formData.description.trim() || undefined,
      category: formData.category || undefined,
      durationMinutes: Number(formData.durationMinutes) || undefined,
    });
  };

  const courses = data?.courses || [];

  const stats = {
    total: courses.length,
    published: courses.filter(c => c.status === "published").length,
    totalEnrollments: courses.reduce((sum, c) => sum + (c.enrollmentCount || 0), 0),
    totalCompletions: courses.reduce((sum, c) => sum + (c.completionCount || 0), 0),
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "published": return <Badge variant="success">Published</Badge>;
      case "draft": return <Badge variant="warning">Draft</Badge>;
      case "archived": return <Badge variant="secondary">Archived</Badge>;
      default: return <Badge>{status}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Learning Management</h1>
          <p className="text-gray-600">Manage courses and learning content</p>
        </div>
        <Button onClick={() => setShowCreateModal(true)}>
          <Plus className="h-4 w-4 mr-2" />
          New Course
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard title="Total Courses" value={stats.total} icon={<BookOpen className="h-5 w-5" />} />
        <StatCard title="Published" value={stats.published} icon={<BookOpen className="h-5 w-5" />} />
        <StatCard title="Enrollments" value={stats.totalEnrollments} icon={<Users className="h-5 w-5" />} />
        <StatCard title="Completions" value={stats.totalCompletions} icon={<Award className="h-5 w-5" />} />
      </div>

      {isLoading ? (
        <div className="text-center py-8">Loading...</div>
      ) : courses.length === 0 ? (
        <Card>
          <CardBody className="text-center py-12">
            <BookOpen className="h-12 w-12 mx-auto text-gray-400 mb-4" />
            <h3 className="text-lg font-medium text-gray-900">No courses yet</h3>
            <p className="text-gray-500 mb-4">Create your first course to start training employees.</p>
            <Button onClick={() => setShowCreateModal(true)}>Create Course</Button>
          </CardBody>
        </Card>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Course</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Category</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Enrollments</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Completion Rate</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {courses.map((course) => (
                <tr key={course.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <div>
                      <div className="font-medium text-gray-900">{course.title}</div>
                      <div className="text-sm text-gray-500">{course.durationMinutes} min</div>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">{course.category}</td>
                  <td className="px-6 py-4">{getStatusBadge(course.status)}</td>
                  <td className="px-6 py-4 text-sm text-gray-500">{course.enrollmentCount || 0}</td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {course.enrollmentCount > 0
                      ? `${Math.round((course.completionCount / course.enrollmentCount) * 100)}%`
                      : "N/A"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create Course Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={(e) => { if (e.target === e.currentTarget) setShowCreateModal(false); }}>
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg" role="dialog" aria-modal="true" aria-label="Create Course">
            <div className="flex items-center justify-between p-6 border-b">
              <h3 className="text-lg font-semibold text-gray-900">Create Course</h3>
              <button type="button" onClick={() => setShowCreateModal(false)} className="text-gray-400 hover:text-gray-600" aria-label="Close">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label htmlFor="course-title" className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
                <input
                  id="course-title"
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="w-full rounded-md border border-gray-300 p-2"
                  placeholder="Introduction to Company Policies"
                />
              </div>
              <div>
                <label htmlFor="course-description" className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea
                  id="course-description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={3}
                  className="w-full rounded-md border border-gray-300 p-2"
                  placeholder="Describe the course content..."
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="course-category" className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                  <select
                    id="course-category"
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    className="w-full rounded-md border border-gray-300 p-2"
                  >
                    <option value="general">General</option>
                    <option value="compliance">Compliance</option>
                    <option value="technical">Technical</option>
                    <option value="leadership">Leadership</option>
                    <option value="onboarding">Onboarding</option>
                    <option value="safety">Safety</option>
                    <option value="soft_skills">Soft Skills</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="course-duration" className="block text-sm font-medium text-gray-700 mb-1">Duration (minutes)</label>
                  <input
                    id="course-duration"
                    type="number"
                    min={1}
                    value={formData.durationMinutes}
                    onChange={(e) => setFormData({ ...formData, durationMinutes: e.target.value })}
                    className="w-full rounded-md border border-gray-300 p-2"
                  />
                </div>
              </div>
            </div>
            <div className="flex gap-2 p-6 border-t">
              <Button variant="outline" className="flex-1" onClick={() => setShowCreateModal(false)}>
                Cancel
              </Button>
              <Button
                className="flex-1"
                onClick={handleCreate}
                disabled={!formData.title.trim() || createMutation.isPending}
              >
                {createMutation.isPending ? "Creating..." : "Create Course"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
