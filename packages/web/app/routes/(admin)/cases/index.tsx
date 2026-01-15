import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { MessageSquare, Plus, Clock, AlertTriangle, CheckCircle } from "lucide-react";
import { Card, CardBody, StatCard } from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { api } from "~/lib/api-client";

interface Case {
  id: string;
  caseNumber: string;
  subject: string;
  description: string;
  category: string;
  priority: "low" | "medium" | "high" | "urgent";
  status: "open" | "in_progress" | "pending_info" | "escalated" | "resolved" | "closed" | "cancelled";
  employeeId: string;
  employeeName?: string;
  assigneeId?: string;
  assigneeName?: string;
  createdAt: string;
  updatedAt: string;
}

export default function CasesAdminPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["admin-cases"],
    queryFn: () => api.get<{ cases: Case[]; count: number }>("/cases"),
  });

  const cases = data?.cases || [];

  const stats = {
    total: cases.length,
    open: cases.filter(c => c.status === "open").length,
    inProgress: cases.filter(c => c.status === "in_progress").length,
    escalated: cases.filter(c => c.status === "escalated").length,
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "open": return <Badge variant="info">Open</Badge>;
      case "in_progress": return <Badge variant="warning">In Progress</Badge>;
      case "pending_info": return <Badge variant="secondary">Pending Info</Badge>;
      case "escalated": return <Badge variant="destructive">Escalated</Badge>;
      case "resolved": return <Badge variant="success">Resolved</Badge>;
      case "closed": return <Badge variant="secondary">Closed</Badge>;
      case "cancelled": return <Badge variant="secondary">Cancelled</Badge>;
      default: return <Badge>{status}</Badge>;
    }
  };

  const getPriorityBadge = (priority: string) => {
    switch (priority) {
      case "urgent": return <Badge variant="destructive">Urgent</Badge>;
      case "high": return <Badge variant="warning">High</Badge>;
      case "medium": return <Badge variant="info">Medium</Badge>;
      case "low": return <Badge variant="secondary">Low</Badge>;
      default: return <Badge>{priority}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">HR Cases</h1>
          <p className="text-gray-600">Manage employee inquiries and support requests</p>
        </div>
        <Link to="/admin/cases/new">
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            New Case
          </Button>
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard title="Total Cases" value={stats.total} icon={<MessageSquare className="h-5 w-5" />} />
        <StatCard title="Open" value={stats.open} icon={<Clock className="h-5 w-5" />} />
        <StatCard title="In Progress" value={stats.inProgress} icon={<CheckCircle className="h-5 w-5" />} />
        <StatCard title="Escalated" value={stats.escalated} icon={<AlertTriangle className="h-5 w-5" />} />
      </div>

      {isLoading ? (
        <div className="text-center py-8">Loading...</div>
      ) : cases.length === 0 ? (
        <Card>
          <CardBody className="text-center py-12">
            <MessageSquare className="h-12 w-12 mx-auto text-gray-400 mb-4" />
            <h3 className="text-lg font-medium text-gray-900">No cases yet</h3>
            <p className="text-gray-500 mb-4">Cases submitted by employees will appear here.</p>
          </CardBody>
        </Card>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Case</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Employee</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Category</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Priority</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Assignee</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {cases.map((caseItem) => (
                <tr key={caseItem.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <div>
                      <div className="font-medium text-gray-900">{caseItem.caseNumber}</div>
                      <div className="text-sm text-gray-500 truncate max-w-xs">{caseItem.subject}</div>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">{caseItem.employeeName || "Unknown"}</td>
                  <td className="px-6 py-4 text-sm text-gray-500">{caseItem.category}</td>
                  <td className="px-6 py-4">{getPriorityBadge(caseItem.priority)}</td>
                  <td className="px-6 py-4">{getStatusBadge(caseItem.status)}</td>
                  <td className="px-6 py-4 text-sm text-gray-500">{caseItem.assigneeName || "Unassigned"}</td>
                  <td className="px-6 py-4 text-right">
                    <Link to={`/admin/cases/${caseItem.id}`}>
                      <Button variant="outline" size="sm">View</Button>
                    </Link>
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
