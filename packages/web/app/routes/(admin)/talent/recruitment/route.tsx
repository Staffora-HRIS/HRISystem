import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { ArrowLeft, Plus, Users, MapPin, Calendar, Building, Search, BarChart3 } from "lucide-react";
import { Card, CardHeader, CardBody, StatCard } from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { useToast } from "~/components/ui/toast";
import { api } from "~/lib/api-client";

interface Requisition {
  id: string;
  code: string;
  title: string;
  department?: string;
  org_unit_name?: string;
  location?: string;
  employment_type?: "full_time" | "part_time" | "contract" | "temporary";
  status: "draft" | "open" | "on_hold" | "filled" | "cancelled";
  candidate_count?: number;
  hiring_manager_name?: string;
  created_at: string;
  deadline?: string;
  openings: number;
  filled: number;
  priority: number;
}

interface RequisitionStats {
  totalRequisitions: number;
  openCount: number;
  onHoldCount: number;
  filledCount: number;
  totalOpenings: number;
  totalFilled: number;
}

export default function RecruitmentPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["admin-requisitions", statusFilter, search],
    queryFn: () => api.get<{ requisitions: Requisition[]; count: number }>(
      `/recruitment/requisitions`,
      {
        params: {
          status: statusFilter !== "all" ? statusFilter : undefined,
          search: search || undefined,
        },
      }
    ),
  });

  const { data: stats } = useQuery({
    queryKey: ["admin-requisition-stats"],
    queryFn: () => api.get<RequisitionStats>("/recruitment/requisitions/stats"),
  });

  const requisitions = data?.requisitions || [];

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "open": return <Badge variant="success">Open</Badge>;
      case "draft": return <Badge variant="secondary">Draft</Badge>;
      case "on_hold": return <Badge variant="warning">On Hold</Badge>;
      case "filled": return <Badge variant="info">Filled</Badge>;
      case "cancelled": return <Badge variant="destructive">Cancelled</Badge>;
      default: return <Badge>{status}</Badge>;
    }
  };

  const getEmploymentTypeBadge = (type?: string) => {
    switch (type) {
      case "full_time": return <Badge variant="info">Full-time</Badge>;
      case "part_time": return <Badge variant="secondary">Part-time</Badge>;
      case "contract": return <Badge variant="warning">Contract</Badge>;
      case "temporary": return <Badge variant="secondary">Temporary</Badge>;
      default: return null;
    }
  };

  const getPriorityLabel = (priority: number) => {
    switch (priority) {
      case 1: return <Badge variant="destructive">Urgent</Badge>;
      case 2: return <Badge variant="warning">High</Badge>;
      case 3: return null; // Normal priority, no badge
      case 4: return <Badge variant="secondary">Low</Badge>;
      case 5: return <Badge variant="secondary">Lowest</Badge>;
      default: return null;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" onClick={() => navigate("/admin/talent")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900">Recruitment</h1>
          <p className="text-gray-600">Manage job requisitions and candidates</p>
        </div>
        <Button onClick={() => navigate("/admin/talent/recruitment/candidates")}>
          <Users className="h-4 w-4 mr-2" />
          View Candidates
        </Button>
        <Button onClick={() => toast.info("Coming Soon", { message: "The requisition creation form will be available in a future update." })}>
          <Plus className="h-4 w-4 mr-2" />
          New Requisition
        </Button>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <StatCard title="Total Requisitions" value={stats.totalRequisitions} icon={<Building className="h-5 w-5" />} />
          <StatCard title="Open Positions" value={stats.openCount} icon={<Users className="h-5 w-5" />} />
          <StatCard title="On Hold" value={stats.onHoldCount} icon={<Calendar className="h-5 w-5" />} />
          <StatCard title="Filled" value={stats.filledCount} icon={<BarChart3 className="h-5 w-5" />} />
          <StatCard title="Openings Remaining" value={(stats.totalOpenings ?? 0) - (stats.totalFilled ?? 0)} icon={<Users className="h-5 w-5" />} />
        </div>
      )}

      {/* Filters */}
      <Card>
        <CardBody className="p-4">
          <div className="flex items-center gap-4">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search requisitions..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border rounded-lg"
              />
            </div>
            <div className="flex gap-2">
              {["all", "open", "draft", "on_hold", "filled"].map((status) => (
                <Button
                  key={status}
                  variant={statusFilter === status ? "primary" : "outline"}
                  size="sm"
                  onClick={() => setStatusFilter(status)}
                >
                  {status === "all" ? "All" : status.replace("_", " ").replace(/\b\w/g, l => l.toUpperCase())}
                </Button>
              ))}
            </div>
          </div>
        </CardBody>
      </Card>

      {isLoading ? (
        <div className="text-center py-8">Loading...</div>
      ) : requisitions.length === 0 ? (
        <Card>
          <CardBody className="text-center py-12">
            <Users className="h-12 w-12 mx-auto text-gray-400 mb-4" />
            <h3 className="text-lg font-medium text-gray-900">No requisitions found</h3>
            <p className="text-gray-500 mb-4">Create your first job requisition to start recruiting.</p>
            <Button onClick={() => toast.info("Coming Soon", { message: "The requisition creation form will be available in a future update." })}>
              <Plus className="h-4 w-4 mr-2" />
              New Requisition
            </Button>
          </CardBody>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {requisitions.map((req) => (
            <Card key={req.id} className="hover:shadow-lg transition-shadow">
              <CardHeader className="flex flex-row items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold">{req.title}</h3>
                    <span className="text-xs text-gray-500">({req.code})</span>
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    {getStatusBadge(req.status)}
                    {getEmploymentTypeBadge(req.employment_type)}
                    {getPriorityLabel(req.priority)}
                  </div>
                </div>
                <div className="text-right">
                  <div className="flex items-center gap-1 text-sm text-gray-500">
                    <Users className="h-4 w-4" />
                    {req.candidate_count || 0} candidates
                  </div>
                  <div className="text-xs text-gray-400">
                    {req.filled}/{req.openings} filled
                  </div>
                </div>
              </CardHeader>
              <CardBody className="space-y-3">
                <div className="grid grid-cols-2 gap-2 text-sm">
                  {(req.org_unit_name || req.department) && (
                    <div className="flex items-center gap-1 text-gray-600">
                      <Building className="h-4 w-4" />
                      {req.org_unit_name || req.department}
                    </div>
                  )}
                  {req.location && (
                    <div className="flex items-center gap-1 text-gray-600">
                      <MapPin className="h-4 w-4" />
                      {req.location}
                    </div>
                  )}
                  {req.deadline && (
                    <div className="flex items-center gap-1 text-gray-600">
                      <Calendar className="h-4 w-4" />
                      Deadline: {new Date(req.deadline).toLocaleDateString()}
                    </div>
                  )}
                  <div className="flex items-center gap-1 text-gray-600">
                    <Calendar className="h-4 w-4" />
                    Created: {new Date(req.created_at).toLocaleDateString()}
                  </div>
                </div>
                {req.hiring_manager_name && (
                  <div className="text-sm text-gray-500">
                    Hiring Manager: {req.hiring_manager_name}
                  </div>
                )}
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => navigate(`/admin/talent/recruitment/candidates?requisitionId=${req.id}`)}
                  >
                    View Candidates
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => toast.info("Coming Soon", { message: "Requisition detail view will be available in a future update." })}
                  >
                    View
                  </Button>
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
