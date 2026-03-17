import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { BookOpen, Clock, CheckCircle, Play, Award } from "lucide-react";
import { Card, CardBody, StatCard } from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { useToast } from "~/components/ui/toast";
import { api } from "~/lib/api-client";

interface Enrollment {
  id: string;
  courseId: string;
  title: string;
  description: string;
  category: string;
  durationMinutes: number;
  thumbnailUrl: string | null;
  status: "enrolled" | "in_progress" | "completed";
  enrolledAt: string;
  startedAt: string | null;
  completedAt: string | null;
  dueDate: string | null;
  score: number | null;
}

export default function MyLearningPage() {
  const [filter, setFilter] = useState<string>("all");
  const toast = useToast();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["my-learning"],
    queryFn: () => api.get<{ enrollments: Enrollment[]; count: number }>("/lms/my-learning"),
  });

  const startMutation = useMutation({
    mutationFn: (enrollmentId: string) =>
      api.post(`/lms/enrollments/${enrollmentId}/start`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-learning"] });
      toast.success("Course started");
    },
    onError: () => {
      toast.error("Failed to start course", {
        message: "Please try again in a moment.",
      });
    },
  });

  const enrollments = data?.enrollments || [];
  const filtered = filter === "all"
    ? enrollments
    : enrollments.filter(e => e.status === filter);

  const stats = {
    total: enrollments.length,
    inProgress: enrollments.filter(e => e.status === "in_progress").length,
    completed: enrollments.filter(e => e.status === "completed").length,
    pending: enrollments.filter(e => e.status === "enrolled").length,
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "completed": return <Badge variant="success">Completed</Badge>;
      case "in_progress": return <Badge variant="warning">In Progress</Badge>;
      default: return <Badge variant="secondary">Not Started</Badge>;
    }
  };

  const handleContinue = (_enrollment: Enrollment) => {
    toast.info("Coming Soon", {
      message: "The course player will be available in a future update.",
    });
  };

  const handleViewCertificate = (_enrollment: Enrollment) => {
    toast.info("Coming Soon", {
      message: "Certificate downloads will be available in a future update.",
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My Learning</h1>
          <p className="text-gray-600">Track your courses and certifications</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard title="Total Courses" value={stats.total} icon={<BookOpen className="h-5 w-5" />} />
        <StatCard title="In Progress" value={stats.inProgress} icon={<Play className="h-5 w-5" />} />
        <StatCard title="Completed" value={stats.completed} icon={<CheckCircle className="h-5 w-5" />} />
        <StatCard title="Not Started" value={stats.pending} icon={<Clock className="h-5 w-5" />} />
      </div>

      <div className="flex gap-2">
        {["all", "enrolled", "in_progress", "completed"].map((f) => (
          <Button
            key={f}
            variant={filter === f ? "primary" : "outline"}
            size="sm"
            onClick={() => setFilter(f)}
          >
            {f === "all" ? "All" : f.replace("_", " ").replace(/\b\w/g, l => l.toUpperCase())}
          </Button>
        ))}
      </div>

      {isLoading ? (
        <div className="text-center py-8">Loading...</div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardBody className="text-center py-12">
            <BookOpen className="h-12 w-12 mx-auto text-gray-400 mb-4" />
            <h3 className="text-lg font-medium text-gray-900">No courses found</h3>
            <p className="text-gray-500">You haven't been enrolled in any courses yet.</p>
          </CardBody>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filtered.map((enrollment) => (
            <Card key={enrollment.id} className="overflow-hidden">
              <div className="h-32 bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                <BookOpen className="h-12 w-12 text-white opacity-50" />
              </div>
              <CardBody>
                <div className="flex items-start justify-between mb-2">
                  <span className="text-xs text-gray-500 uppercase">{enrollment.category}</span>
                  {getStatusBadge(enrollment.status)}
                </div>
                <h3 className="font-semibold text-gray-900 mb-2">{enrollment.title}</h3>
                <p className="text-sm text-gray-600 line-clamp-2 mb-4">{enrollment.description}</p>

                <div className="flex items-center justify-between text-sm text-gray-500 mb-4">
                  <span className="flex items-center gap-1">
                    <Clock className="h-4 w-4" />
                    {enrollment.durationMinutes} min
                  </span>
                  {enrollment.score !== null && (
                    <span className="flex items-center gap-1">
                      <Award className="h-4 w-4" />
                      Score: {enrollment.score}%
                    </span>
                  )}
                </div>

                {enrollment.dueDate && (
                  <p className="text-xs text-gray-500 mb-4">
                    Due: {new Date(enrollment.dueDate).toLocaleDateString()}
                  </p>
                )}

                {enrollment.status === "enrolled" && (
                  <Button
                    className="w-full"
                    onClick={() => startMutation.mutate(enrollment.id)}
                    disabled={startMutation.isPending}
                  >
                    {startMutation.isPending ? "Starting..." : "Start Course"}
                  </Button>
                )}
                {enrollment.status === "in_progress" && (
                  <Button
                    className="w-full"
                    variant="outline"
                    onClick={() => handleContinue(enrollment)}
                  >
                    Continue Learning
                  </Button>
                )}
                {enrollment.status === "completed" && (
                  <Button
                    className="w-full"
                    variant="secondary"
                    onClick={() => handleViewCertificate(enrollment)}
                  >
                    View Certificate
                  </Button>
                )}
              </CardBody>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
