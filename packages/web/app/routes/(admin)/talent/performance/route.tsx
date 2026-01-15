import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { ArrowLeft, Plus, Target, Calendar, Users, BarChart } from "lucide-react";
import { Card, CardHeader, CardBody } from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { api } from "~/lib/api-client";

interface PerformanceCycle {
  id: string;
  name: string;
  description?: string;
  status: "draft" | "goal_setting" | "in_progress" | "review" | "calibration" | "completed" | "archived";
  startDate: string;
  endDate: string;
  goalSettingDeadline?: string;
  selfReviewDeadline?: string;
  managerReviewDeadline?: string;
  calibrationDeadline?: string;
  totalParticipants: number;
  completedReviews: number;
  averageRating?: number;
}

export default function PerformanceManagementPage() {
  const navigate = useNavigate();
  const [showCreateModal, setShowCreateModal] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-performance-cycles"],
    queryFn: () => api.get<{ cycles: PerformanceCycle[] }>("/talent/performance/cycles"),
  });

  const cycles = data?.cycles || [];
  const activeCycles = cycles.filter(c => !["completed", "archived", "draft"].includes(c.status));

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "draft": return <Badge variant="secondary">Draft</Badge>;
      case "goal_setting": return <Badge variant="info">Goal Setting</Badge>;
      case "in_progress": return <Badge variant="warning">In Progress</Badge>;
      case "review": return <Badge variant="info">Review Phase</Badge>;
      case "calibration": return <Badge variant="warning">Calibration</Badge>;
      case "completed": return <Badge variant="success">Completed</Badge>;
      case "archived": return <Badge variant="secondary">Archived</Badge>;
      default: return <Badge>{status}</Badge>;
    }
  };

  const getCompletionRate = (cycle: PerformanceCycle) => {
    if (cycle.totalParticipants === 0) return 0;
    return Math.round((cycle.completedReviews / cycle.totalParticipants) * 100);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" onClick={() => navigate("/admin/talent")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900">Performance Management</h1>
          <p className="text-gray-600">Manage performance review cycles</p>
        </div>
        <Button onClick={() => setShowCreateModal(true)}>
          <Plus className="h-4 w-4 mr-2" />
          New Cycle
        </Button>
      </div>

      {isLoading ? (
        <div className="text-center py-8">Loading...</div>
      ) : cycles.length === 0 ? (
        <Card>
          <CardBody className="text-center py-12">
            <Target className="h-12 w-12 mx-auto text-gray-400 mb-4" />
            <h3 className="text-lg font-medium text-gray-900">No performance cycles</h3>
            <p className="text-gray-500 mb-4">Create your first performance review cycle.</p>
            <Button onClick={() => setShowCreateModal(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Create Cycle
            </Button>
          </CardBody>
        </Card>
      ) : (
        <div className="space-y-6">
          {/* Active Cycles */}
          {activeCycles.length > 0 && (
            <div>
              <h2 className="text-lg font-semibold mb-4">Active Cycles</h2>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {activeCycles.map((cycle) => {
                  const completionRate = getCompletionRate(cycle);
                  return (
                    <Card key={cycle.id} className="border-l-4 border-l-blue-500">
                      <CardHeader className="flex flex-row items-start justify-between">
                        <div>
                          <h3 className="font-semibold">{cycle.name}</h3>
                          {getStatusBadge(cycle.status)}
                        </div>
                        <div className="text-right text-sm text-gray-500">
                          <div className="flex items-center gap-1">
                            <Calendar className="h-4 w-4" />
                            {new Date(cycle.endDate).toLocaleDateString()}
                          </div>
                        </div>
                      </CardHeader>
                      <CardBody className="space-y-4">
                        {cycle.description && (
                          <p className="text-sm text-gray-600">{cycle.description}</p>
                        )}

                        <div className="grid grid-cols-3 gap-4 text-center">
                          <div>
                            <div className="text-2xl font-bold text-blue-600">{cycle.totalParticipants}</div>
                            <div className="text-xs text-gray-500">Participants</div>
                          </div>
                          <div>
                            <div className="text-2xl font-bold text-green-600">{completionRate}%</div>
                            <div className="text-xs text-gray-500">Complete</div>
                          </div>
                          <div>
                            <div className="text-2xl font-bold text-gray-600">
                              {cycle.averageRating ? cycle.averageRating.toFixed(1) : "-"}
                            </div>
                            <div className="text-xs text-gray-500">Avg Rating</div>
                          </div>
                        </div>

                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div
                            className="bg-blue-600 h-2 rounded-full transition-all"
                            style={{ width: `${completionRate}%` }}
                          />
                        </div>

                        <div className="flex gap-2">
                          <Button variant="outline" size="sm" className="flex-1">
                            <BarChart className="h-4 w-4 mr-1" />
                            Dashboard
                          </Button>
                          <Button variant="outline" size="sm" className="flex-1">
                            <Users className="h-4 w-4 mr-1" />
                            Reviews
                          </Button>
                        </div>
                      </CardBody>
                    </Card>
                  );
                })}
              </div>
            </div>
          )}

          {/* Completed/Draft Cycles */}
          {cycles.filter(c => ["completed", "archived", "draft"].includes(c.status)).length > 0 && (
            <div>
              <h2 className="text-lg font-semibold mb-4">Past & Draft Cycles</h2>
              <div className="bg-white rounded-lg shadow overflow-hidden">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Cycle</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Period</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Participants</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {cycles
                      .filter(c => ["completed", "archived", "draft"].includes(c.status))
                      .map((cycle) => (
                        <tr key={cycle.id} className="hover:bg-gray-50">
                          <td className="px-6 py-4">
                            <div className="font-medium text-gray-900">{cycle.name}</div>
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-500">
                            {new Date(cycle.startDate).toLocaleDateString()} - {new Date(cycle.endDate).toLocaleDateString()}
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-500">{cycle.totalParticipants}</td>
                          <td className="px-6 py-4">{getStatusBadge(cycle.status)}</td>
                          <td className="px-6 py-4 text-right">
                            <Button variant="outline" size="sm">View</Button>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Create Modal Placeholder */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <Card className="w-full max-w-md">
            <CardHeader>
              <h3 className="font-semibold">Create Performance Cycle</h3>
            </CardHeader>
            <CardBody className="space-y-4">
              <p className="text-gray-600">Performance cycle creation form would go here.</p>
              <div className="flex gap-2 pt-4">
                <Button variant="outline" className="flex-1" onClick={() => setShowCreateModal(false)}>
                  Cancel
                </Button>
                <Button className="flex-1" onClick={() => setShowCreateModal(false)}>
                  Create
                </Button>
              </div>
            </CardBody>
          </Card>
        </div>
      )}
    </div>
  );
}
