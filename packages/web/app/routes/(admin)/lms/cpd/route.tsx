export { RouteErrorBoundary as ErrorBoundary } from "~/components/ui/RouteErrorBoundary";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { BookOpen, CheckCircle, Clock, Award } from "lucide-react";
import { Card, CardBody, StatCard } from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { api } from "~/lib/api-client";

interface CpdRecord {
  id: string;
  employeeId: string;
  activityType: string;
  title: string;
  provider: string | null;
  hours: number;
  points: number;
  startDate: string;
  endDate: string | null;
  verified: boolean;
  employeeName?: string;
  createdAt: string;
}

const ACTIVITY_TYPE_LABELS: Record<string, string> = {
  course: "Course",
  conference: "Conference",
  workshop: "Workshop",
  self_study: "Self Study",
  mentoring: "Mentoring",
  publication: "Publication",
  presentation: "Presentation",
  professional_body: "Professional Body",
};

export default function CpdRecordsPage() {
  const [activityFilter, setActivityFilter] = useState<string>("");

  const { data, isLoading } = useQuery({
    queryKey: ["cpd-records", activityFilter],
    queryFn: () => {
      const params: Record<string, string> = {};
      if (activityFilter) params.activityType = activityFilter;
      const searchParams = new URLSearchParams(params).toString();
      return api.get<{ items: CpdRecord[] }>(`/cpd/records${searchParams ? `?${searchParams}` : ""}`);
    },
  });

  const records = data?.items || [];

  const totalHours = records.reduce((sum, r) => sum + r.hours, 0);
  const totalPoints = records.reduce((sum, r) => sum + r.points, 0);
  const verifiedCount = records.filter(r => r.verified).length;
  const pendingCount = records.filter(r => !r.verified).length;

  const getActivityBadge = (type: string) => {
    const label = ACTIVITY_TYPE_LABELS[type] || type;
    switch (type) {
      case "course":
      case "workshop":
        return <Badge variant="primary">{label}</Badge>;
      case "conference":
      case "presentation":
        return <Badge variant="info">{label}</Badge>;
      case "self_study":
      case "mentoring":
        return <Badge variant="secondary">{label}</Badge>;
      case "publication":
      case "professional_body":
        return <Badge variant="warning">{label}</Badge>;
      default:
        return <Badge>{label}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">CPD Records</h1>
          <p className="text-gray-600">Track Continuing Professional Development activities</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard
          title="Total Hours"
          value={totalHours.toFixed(1)}
          icon={<Clock className="h-5 w-5" />}
        />
        <StatCard
          title="Total Points"
          value={totalPoints.toFixed(1)}
          icon={<Award className="h-5 w-5" />}
        />
        <StatCard
          title="Verified"
          value={verifiedCount}
          icon={<CheckCircle className="h-5 w-5" />}
        />
        <StatCard
          title="Pending Verification"
          value={pendingCount}
          icon={<BookOpen className="h-5 w-5" />}
        />
      </div>

      {/* Filter Bar */}
      <div className="flex gap-2 flex-wrap">
        <Button
          variant={activityFilter === "" ? "primary" : "outline"}
          size="sm"
          onClick={() => setActivityFilter("")}
        >
          All
        </Button>
        {Object.entries(ACTIVITY_TYPE_LABELS).map(([key, label]) => (
          <Button
            key={key}
            variant={activityFilter === key ? "primary" : "outline"}
            size="sm"
            onClick={() => setActivityFilter(key)}
          >
            {label}
          </Button>
        ))}
      </div>

      {/* Records Table */}
      {isLoading ? (
        <div className="text-center py-8 text-gray-500">Loading...</div>
      ) : records.length === 0 ? (
        <Card>
          <CardBody className="text-center py-12">
            <BookOpen className="h-12 w-12 mx-auto text-gray-400 mb-4" />
            <h3 className="text-lg font-medium text-gray-900">No CPD records</h3>
            <p className="text-gray-500">
              {activityFilter
                ? "No records found for this activity type."
                : "No CPD records have been submitted yet."}
            </p>
          </CardBody>
        </Card>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Employee</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Activity</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Provider</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Hours</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Points</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {records.map((record) => (
                <tr key={record.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 text-sm text-gray-900">{record.employeeName || record.employeeId}</td>
                  <td className="px-6 py-4">
                    <div className="font-medium text-gray-900">{record.title}</div>
                  </td>
                  <td className="px-6 py-4">{getActivityBadge(record.activityType)}</td>
                  <td className="px-6 py-4 text-sm text-gray-500">{record.provider || "-"}</td>
                  <td className="px-6 py-4 text-sm text-gray-500">{record.hours}</td>
                  <td className="px-6 py-4 text-sm text-gray-500">{record.points}</td>
                  <td className="px-6 py-4 text-sm text-gray-500">{record.startDate}</td>
                  <td className="px-6 py-4">
                    {record.verified
                      ? <Badge variant="success">Verified</Badge>
                      : <Badge variant="warning">Pending</Badge>
                    }
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
