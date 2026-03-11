import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { BookOpen, Plus, Users, Award } from "lucide-react";
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

export default function LmsAdminPage() {
  const toast = useToast();

  const { data, isLoading } = useQuery({
    queryKey: ["admin-courses"],
    queryFn: () => api.get<{ courses: Course[]; count: number }>("/lms/courses"),
  });

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
        <Link to="/admin/lms/courses">
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            New Course
          </Button>
        </Link>
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
            <Link to="/admin/lms/courses">
              <Button>Create Course</Button>
            </Link>
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
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
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
                  <td className="px-6 py-4 text-right">
                    <Button variant="outline" size="sm" onClick={() => toast.info("Coming Soon", { message: "Course editing will be available in a future update." })}>Edit</Button>
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
