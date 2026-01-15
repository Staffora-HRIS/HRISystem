import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { Users, Briefcase, Target, TrendingUp, UserPlus } from "lucide-react";
import { Card, CardHeader, CardBody, StatCard } from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { api } from "~/lib/api-client";

interface Requisition {
  id: string;
  title: string;
  department?: string;
  status: "draft" | "open" | "on_hold" | "filled" | "cancelled";
  candidateCount: number;
  createdAt: string;
}

interface PerformanceCycle {
  id: string;
  name: string;
  status: "draft" | "active" | "completed";
  startDate: string;
  endDate: string;
  completionRate: number;
}

export default function TalentAdminPage() {
  const { data: requisitionsData } = useQuery({
    queryKey: ["admin-requisitions"],
    queryFn: () => api.get<{ requisitions: Requisition[]; count: number }>("/talent/requisitions"),
  });

  const { data: cyclesData } = useQuery({
    queryKey: ["admin-performance-cycles"],
    queryFn: () => api.get<{ cycles: PerformanceCycle[] }>("/talent/performance/cycles"),
  });

  const requisitions = requisitionsData?.requisitions || [];
  const cycles = cyclesData?.cycles || [];

  const openRequisitions = requisitions.filter(r => r.status === "open");
  const activeCycles = cycles.filter(c => c.status === "active");

  const stats = {
    openPositions: openRequisitions.length,
    totalCandidates: requisitions.reduce((sum, r) => sum + (r.candidateCount || 0), 0),
    activeCycles: activeCycles.length,
    avgCompletion: activeCycles.length > 0
      ? Math.round(activeCycles.reduce((sum, c) => sum + c.completionRate, 0) / activeCycles.length)
      : 0,
  };

  const getRequisitionStatusBadge = (status: string) => {
    switch (status) {
      case "open": return <Badge variant="success">Open</Badge>;
      case "draft": return <Badge variant="secondary">Draft</Badge>;
      case "on_hold": return <Badge variant="warning">On Hold</Badge>;
      case "filled": return <Badge variant="info">Filled</Badge>;
      case "cancelled": return <Badge variant="destructive">Cancelled</Badge>;
      default: return <Badge>{status}</Badge>;
    }
  };

  const getCycleStatusBadge = (status: string) => {
    switch (status) {
      case "active": return <Badge variant="success">Active</Badge>;
      case "draft": return <Badge variant="secondary">Draft</Badge>;
      case "completed": return <Badge variant="info">Completed</Badge>;
      default: return <Badge>{status}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Talent Management</h1>
          <p className="text-gray-600">Recruitment and performance management</p>
        </div>
        <div className="flex gap-2">
          <Link to="/admin/talent/recruitment">
            <Button variant="outline">
              <UserPlus className="h-4 w-4 mr-2" />
              Recruitment
            </Button>
          </Link>
          <Link to="/admin/talent/performance">
            <Button variant="outline">
              <Target className="h-4 w-4 mr-2" />
              Performance
            </Button>
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard title="Open Positions" value={stats.openPositions} icon={<Briefcase className="h-5 w-5" />} />
        <StatCard title="Total Candidates" value={stats.totalCandidates} icon={<Users className="h-5 w-5" />} />
        <StatCard title="Active Reviews" value={stats.activeCycles} icon={<Target className="h-5 w-5" />} />
        <StatCard title="Avg. Completion" value={`${stats.avgCompletion}%`} icon={<TrendingUp className="h-5 w-5" />} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Open Requisitions */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <h2 className="font-semibold">Open Positions</h2>
            <Link to="/admin/talent/recruitment">
              <Button variant="outline" size="sm">View All</Button>
            </Link>
          </CardHeader>
          <CardBody>
            {openRequisitions.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <Briefcase className="h-12 w-12 mx-auto text-gray-400 mb-2" />
                <p>No open positions</p>
              </div>
            ) : (
              <div className="space-y-3">
                {openRequisitions.slice(0, 5).map((req) => (
                  <div key={req.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div>
                      <div className="font-medium">{req.title}</div>
                      <div className="text-sm text-gray-500">{req.department || "No department"}</div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-sm text-gray-500">
                        <Users className="h-4 w-4 inline mr-1" />
                        {req.candidateCount}
                      </div>
                      {getRequisitionStatusBadge(req.status)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardBody>
        </Card>

        {/* Performance Cycles */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <h2 className="font-semibold">Performance Cycles</h2>
            <Link to="/admin/talent/performance">
              <Button variant="outline" size="sm">View All</Button>
            </Link>
          </CardHeader>
          <CardBody>
            {cycles.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <Target className="h-12 w-12 mx-auto text-gray-400 mb-2" />
                <p>No performance cycles</p>
              </div>
            ) : (
              <div className="space-y-3">
                {cycles.slice(0, 5).map((cycle) => (
                  <div key={cycle.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div>
                      <div className="font-medium">{cycle.name}</div>
                      <div className="text-sm text-gray-500">
                        {new Date(cycle.startDate).toLocaleDateString()} - {new Date(cycle.endDate).toLocaleDateString()}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {cycle.status === "active" && (
                        <div className="text-sm">
                          <span className="text-gray-500">{cycle.completionRate}%</span>
                        </div>
                      )}
                      {getCycleStatusBadge(cycle.status)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
