import { useQuery } from "@tanstack/react-query";
import { Star, ThumbsUp, BarChart3 } from "lucide-react";
import { Card, CardBody, StatCard } from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";
import { api } from "~/lib/api-client";

interface Course {
  id: string;
  title: string;
  category: string;
  status: string;
  enrollmentCount: number;
  completionCount: number;
}

interface CourseSummary {
  courseId: string;
  totalRatings: number;
  averageRating: number | null;
  ratingDistribution: Record<string, number>;
  recommendationRate: number | null;
}

function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <Star
          key={star}
          className={`h-4 w-4 ${star <= rating ? "text-yellow-400 fill-yellow-400" : "text-gray-300"}`}
        />
      ))}
    </div>
  );
}

function RatingBar({ label, count, total }: { label: string; count: number; total: number }) {
  const percentage = total > 0 ? (count / total) * 100 : 0;
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="w-8 text-gray-600">{label}</span>
      <div className="flex-1 bg-gray-200 rounded-full h-2">
        <div
          className="bg-yellow-400 h-2 rounded-full"
          style={{ width: `${percentage}%` }}
        />
      </div>
      <span className="w-8 text-right text-gray-500">{count}</span>
    </div>
  );
}

function CourseRatingCard({ course }: { course: Course }) {
  const { data: summary } = useQuery({
    queryKey: ["course-rating-summary", course.id],
    queryFn: () => api.get<CourseSummary>(`/course-ratings/summary/${course.id}`),
    enabled: !!course.id,
  });

  const avgRating = summary?.averageRating ?? 0;
  const totalRatings = summary?.totalRatings ?? 0;
  const distribution = summary?.ratingDistribution ?? {};
  const recommendRate = summary?.recommendationRate;

  return (
    <Card>
      <CardBody>
        <div className="flex items-start justify-between mb-3">
          <div>
            <h3 className="font-medium text-gray-900">{course.title}</h3>
            <p className="text-sm text-gray-500">{course.category || "Uncategorised"}</p>
          </div>
          <Badge variant={course.status === "published" ? "success" : "secondary"}>
            {course.status}
          </Badge>
        </div>

        {totalRatings > 0 ? (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <span className="text-3xl font-bold text-gray-900">{avgRating.toFixed(1)}</span>
              <div>
                <StarRating rating={Math.round(avgRating)} />
                <p className="text-sm text-gray-500">{totalRatings} rating{totalRatings !== 1 ? "s" : ""}</p>
              </div>
            </div>

            <div className="space-y-1">
              {["5", "4", "3", "2", "1"].map((star) => (
                <RatingBar
                  key={star}
                  label={`${star}${"\u2605"}`}
                  count={distribution[star] || 0}
                  total={totalRatings}
                />
              ))}
            </div>

            {recommendRate !== null && recommendRate !== undefined && (
              <div className="flex items-center gap-2 pt-2 border-t border-gray-100">
                <ThumbsUp className="h-4 w-4 text-green-500" />
                <span className="text-sm text-gray-600">
                  {recommendRate}% would recommend
                </span>
              </div>
            )}
          </div>
        ) : (
          <div className="text-center py-4 text-gray-400">
            <Star className="h-8 w-8 mx-auto mb-2" />
            <p className="text-sm">No ratings yet</p>
          </div>
        )}
      </CardBody>
    </Card>
  );
}

export default function CourseRatingsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["admin-courses-for-ratings"],
    queryFn: () => api.get<{ courses: Course[] }>("/lms/courses?status=published"),
  });

  const courses = data?.courses || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Course Ratings</h1>
          <p className="text-gray-600">View ratings and feedback for published courses</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard
          title="Published Courses"
          value={courses.length}
          icon={<BarChart3 className="h-5 w-5" />}
        />
        <StatCard
          title="Total Enrollments"
          value={courses.reduce((sum, c) => sum + (c.enrollmentCount || 0), 0)}
          icon={<Star className="h-5 w-5" />}
        />
        <StatCard
          title="Total Completions"
          value={courses.reduce((sum, c) => sum + (c.completionCount || 0), 0)}
          icon={<ThumbsUp className="h-5 w-5" />}
        />
      </div>

      {isLoading ? (
        <div className="text-center py-8 text-gray-500">Loading courses...</div>
      ) : courses.length === 0 ? (
        <Card>
          <CardBody className="text-center py-12">
            <Star className="h-12 w-12 mx-auto text-gray-400 mb-4" />
            <h3 className="text-lg font-medium text-gray-900">No published courses</h3>
            <p className="text-gray-500">Publish courses to start collecting ratings.</p>
          </CardBody>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {courses.map((course) => (
            <CourseRatingCard key={course.id} course={course} />
          ))}
        </div>
      )}
    </div>
  );
}
