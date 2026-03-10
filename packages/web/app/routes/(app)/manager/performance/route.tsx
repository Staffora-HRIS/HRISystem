import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Target, Users, TrendingUp, Calendar, Star } from "lucide-react";
import { Card, CardBody, StatCard } from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { api } from "~/lib/api-client";
import { useToast } from "~/components/ui/toast";

interface Goal {
  id: string;
  employeeId: string;
  employeeName: string;
  title: string;
  description: string;
  category: string;
  status: "draft" | "active" | "completed" | "cancelled";
  progress: number;
  targetDate: string;
}

interface Review {
  id: string;
  employeeId: string;
  employeeName: string;
  cycleName: string;
  status: "draft" | "self_review" | "manager_review" | "calibration" | "completed";
  selfRating: number | null;
  managerRating: number | null;
  createdAt: string;
}

export default function ManagerPerformancePage() {
  const [activeTab, setActiveTab] = useState<"goals" | "reviews">("goals");
  const toast = useToast();

  const { data: goalsData } = useQuery({
    queryKey: ["team-goals"],
    queryFn: () => api.get<{ items: Goal[]; nextCursor: string | null; hasMore: boolean }>("/talent/goals"),
  });

  const { data: reviewsData } = useQuery({
    queryKey: ["team-reviews"],
    queryFn: () => api.get<{ items: Review[]; nextCursor: string | null; hasMore: boolean }>("/talent/reviews"),
  });

  const goals = goalsData?.items || [];
  const reviews = reviewsData?.items || [];

  const goalStats = {
    total: goals.length,
    active: goals.filter(g => g.status === "active").length,
    completed: goals.filter(g => g.status === "completed").length,
    avgProgress: goals.length > 0 
      ? Math.round(goals.reduce((sum, g) => sum + g.progress, 0) / goals.length) 
      : 0,
  };

  const reviewStats = {
    total: reviews.length,
    pending: reviews.filter(r => r.status === "manager_review").length,
    completed: reviews.filter(r => r.status === "completed").length,
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "active": return <Badge variant="success">Active</Badge>;
      case "completed": return <Badge variant="info">Completed</Badge>;
      case "draft": return <Badge variant="secondary">Draft</Badge>;
      case "cancelled": return <Badge variant="destructive">Cancelled</Badge>;
      case "self_review": return <Badge variant="warning">Self Review</Badge>;
      case "manager_review": return <Badge variant="warning">Manager Review</Badge>;
      case "calibration": return <Badge variant="info">Calibration</Badge>;
      default: return <Badge>{status}</Badge>;
    }
  };

  const renderStars = (rating: number | null) => {
    if (rating === null) return <span className="text-gray-400">Not rated</span>;
    return (
      <div className="flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((star) => (
          <Star 
            key={star} 
            className={`h-4 w-4 ${star <= rating ? "text-yellow-400 fill-yellow-400" : "text-gray-300"}`} 
          />
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Team Performance</h1>
          <p className="text-gray-600">Manage goals and performance reviews</p>
        </div>
      </div>

      <div className="flex gap-2 border-b">
        <button
          onClick={() => setActiveTab("goals")}
          className={`px-4 py-2 font-medium ${activeTab === "goals" ? "border-b-2 border-blue-500 text-blue-600" : "text-gray-500"}`}
        >
          Goals
        </button>
        <button
          onClick={() => setActiveTab("reviews")}
          className={`px-4 py-2 font-medium ${activeTab === "reviews" ? "border-b-2 border-blue-500 text-blue-600" : "text-gray-500"}`}
        >
          Reviews
        </button>
      </div>

      {activeTab === "goals" && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <StatCard title="Total Goals" value={goalStats.total} icon={<Target className="h-5 w-5" />} />
            <StatCard title="Active" value={goalStats.active} icon={<TrendingUp className="h-5 w-5" />} />
            <StatCard title="Completed" value={goalStats.completed} icon={<Star className="h-5 w-5" />} />
            <StatCard title="Avg Progress" value={`${goalStats.avgProgress}%`} icon={<TrendingUp className="h-5 w-5" />} />
          </div>

          <div className="space-y-4">
            {goals.length === 0 ? (
              <Card>
                <CardBody className="text-center py-12">
                  <Target className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                  <h3 className="text-lg font-medium text-gray-900">No goals found</h3>
                  <p className="text-gray-500">Your team doesn't have any goals set yet.</p>
                </CardBody>
              </Card>
            ) : (
              goals.map((goal) => (
                <Card key={goal.id}>
                  <CardBody>
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-sm font-medium text-gray-500">{goal.employeeName}</span>
                          {getStatusBadge(goal.status)}
                          <Badge variant="outline">{goal.category}</Badge>
                        </div>
                        <h3 className="font-semibold text-gray-900">{goal.title}</h3>
                        <p className="text-sm text-gray-600 mt-1">{goal.description}</p>
                        <div className="flex items-center gap-4 mt-3">
                          <span className="text-sm text-gray-500">
                            Due: {new Date(goal.targetDate).toLocaleDateString()}
                          </span>
                        </div>
                        <div className="mt-3">
                          <div className="flex items-center justify-between text-sm mb-1">
                            <span>Progress</span>
                            <span>{goal.progress}%</span>
                          </div>
                          <progress
                            aria-label="Goal progress"
                            value={goal.progress}
                            max={100}
                            className="h-2 w-full overflow-hidden rounded-full bg-gray-200 [&::-webkit-progress-bar]:bg-gray-200 [&::-webkit-progress-value]:bg-blue-600 [&::-moz-progress-bar]:bg-blue-600"
                          />
                        </div>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => toast.info("Coming Soon", { message: "Goal detail view will be available in a future update." })}
                      >
                        View
                      </Button>
                    </div>
                  </CardBody>
                </Card>
              ))
            )}
          </div>
        </>
      )}

      {activeTab === "reviews" && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <StatCard title="Total Reviews" value={reviewStats.total} icon={<Users className="h-5 w-5" />} />
            <StatCard title="Pending Review" value={reviewStats.pending} icon={<Calendar className="h-5 w-5" />} />
            <StatCard title="Completed" value={reviewStats.completed} icon={<Star className="h-5 w-5" />} />
          </div>

          <div className="space-y-4">
            {reviews.length === 0 ? (
              <Card>
                <CardBody className="text-center py-12">
                  <Users className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                  <h3 className="text-lg font-medium text-gray-900">No reviews found</h3>
                  <p className="text-gray-500">No performance reviews are currently in progress.</p>
                </CardBody>
              </Card>
            ) : (
              reviews.map((review) => (
                <Card key={review.id}>
                  <CardBody>
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="font-medium">{review.employeeName}</span>
                          {getStatusBadge(review.status)}
                        </div>
                        <p className="text-sm text-gray-600">{review.cycleName}</p>
                        <div className="flex items-center gap-6 mt-3">
                          <div>
                            <span className="text-xs text-gray-500 block">Self Rating</span>
                            {renderStars(review.selfRating)}
                          </div>
                          <div>
                            <span className="text-xs text-gray-500 block">Manager Rating</span>
                            {renderStars(review.managerRating)}
                          </div>
                        </div>
                      </div>
                      {review.status === "manager_review" ? (
                        <Button
                          onClick={() => toast.info("Coming Soon", { message: "The review completion form will be available in a future update." })}
                        >
                          Complete Review
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => toast.info("Coming Soon", { message: "Review detail view will be available in a future update." })}
                        >
                          View
                        </Button>
                      )}
                    </div>
                  </CardBody>
                </Card>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}
