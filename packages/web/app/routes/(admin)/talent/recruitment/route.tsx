import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { ArrowLeft, Plus, Users, MapPin, Calendar, Building } from "lucide-react";
import { Card, CardHeader, CardBody } from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { api } from "~/lib/api-client";

interface Requisition {
  id: string;
  title: string;
  department?: string;
  location?: string;
  employmentType: "full_time" | "part_time" | "contract" | "temporary";
  status: "draft" | "open" | "on_hold" | "filled" | "cancelled";
  candidateCount: number;
  hiringManagerName?: string;
  createdAt: string;
  closingDate?: string;
}

export default function RecruitmentPage() {
  const navigate = useNavigate();
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const { data, isLoading } = useQuery({
    queryKey: ["admin-requisitions", statusFilter],
    queryFn: () => api.get<{ requisitions: Requisition[]; count: number }>(
      `/talent/requisitions${statusFilter !== "all" ? `?status=${statusFilter}` : ""}`
    ),
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

  const getEmploymentTypeBadge = (type: string) => {
    switch (type) {
      case "full_time": return <Badge variant="info">Full-time</Badge>;
      case "part_time": return <Badge variant="secondary">Part-time</Badge>;
      case "contract": return <Badge variant="warning">Contract</Badge>;
      case "temporary": return <Badge variant="secondary">Temporary</Badge>;
      default: return <Badge>{type}</Badge>;
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
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          New Requisition
        </Button>
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

      {isLoading ? (
        <div className="text-center py-8">Loading...</div>
      ) : requisitions.length === 0 ? (
        <Card>
          <CardBody className="text-center py-12">
            <Users className="h-12 w-12 mx-auto text-gray-400 mb-4" />
            <h3 className="text-lg font-medium text-gray-900">No requisitions found</h3>
            <p className="text-gray-500 mb-4">Create your first job requisition to start recruiting.</p>
            <Button>
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
                  <h3 className="font-semibold">{req.title}</h3>
                  <div className="flex items-center gap-2 mt-1">
                    {getStatusBadge(req.status)}
                    {getEmploymentTypeBadge(req.employmentType)}
                  </div>
                </div>
                <div className="flex items-center gap-1 text-sm text-gray-500">
                  <Users className="h-4 w-4" />
                  {req.candidateCount}
                </div>
              </CardHeader>
              <CardBody className="space-y-3">
                <div className="grid grid-cols-2 gap-2 text-sm">
                  {req.department && (
                    <div className="flex items-center gap-1 text-gray-600">
                      <Building className="h-4 w-4" />
                      {req.department}
                    </div>
                  )}
                  {req.location && (
                    <div className="flex items-center gap-1 text-gray-600">
                      <MapPin className="h-4 w-4" />
                      {req.location}
                    </div>
                  )}
                  {req.closingDate && (
                    <div className="flex items-center gap-1 text-gray-600">
                      <Calendar className="h-4 w-4" />
                      Closes {new Date(req.closingDate).toLocaleDateString()}
                    </div>
                  )}
                </div>
                {req.hiringManagerName && (
                  <div className="text-sm text-gray-500">
                    Hiring Manager: {req.hiringManagerName}
                  </div>
                )}
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="flex-1">
                    View Candidates
                  </Button>
                  <Button variant="outline" size="sm">
                    Edit
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
