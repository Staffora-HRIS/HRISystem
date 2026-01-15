import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { GitBranch, Plus, Play, Pause, Settings } from "lucide-react";
import { Card, CardHeader, CardBody, StatCard } from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { api } from "~/lib/api-client";

interface WorkflowDefinition {
  id: string;
  code: string;
  name: string;
  description: string;
  category: string;
  triggerType: "manual" | "event" | "scheduled";
  status: "draft" | "active" | "inactive" | "archived";
  version: number;
  createdAt: string;
}

export default function WorkflowsAdminPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["workflow-definitions"],
    queryFn: () => api.get<{ definitions: WorkflowDefinition[]; count: number }>("/workflows/definitions"),
  });

  const definitions = data?.definitions || [];

  const stats = {
    total: definitions.length,
    active: definitions.filter(d => d.status === "active").length,
    draft: definitions.filter(d => d.status === "draft").length,
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "active": return <Badge variant="success">Active</Badge>;
      case "draft": return <Badge variant="warning">Draft</Badge>;
      case "inactive": return <Badge variant="secondary">Inactive</Badge>;
      case "archived": return <Badge variant="secondary">Archived</Badge>;
      default: return <Badge>{status}</Badge>;
    }
  };

  const getTriggerBadge = (trigger: string) => {
    switch (trigger) {
      case "manual": return <Badge variant="info">Manual</Badge>;
      case "event": return <Badge variant="info">Event</Badge>;
      case "scheduled": return <Badge variant="info">Scheduled</Badge>;
      default: return <Badge>{trigger}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Workflow Administration</h1>
          <p className="text-gray-600">Manage workflow definitions and automation</p>
        </div>
        <Link to="/admin/workflows/builder">
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            New Workflow
          </Button>
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard title="Total Workflows" value={stats.total} icon={<GitBranch className="h-5 w-5" />} />
        <StatCard title="Active" value={stats.active} icon={<Play className="h-5 w-5" />} />
        <StatCard title="Draft" value={stats.draft} icon={<Pause className="h-5 w-5" />} />
      </div>

      {isLoading ? (
        <div className="text-center py-8">Loading...</div>
      ) : definitions.length === 0 ? (
        <Card>
          <CardBody className="text-center py-12">
            <GitBranch className="h-12 w-12 mx-auto text-gray-400 mb-4" />
            <h3 className="text-lg font-medium text-gray-900">No workflows defined</h3>
            <p className="text-gray-500 mb-4">Create your first workflow to automate HR processes.</p>
            <Link to="/admin/workflows/builder">
              <Button>Create Workflow</Button>
            </Link>
          </CardBody>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {definitions.map((workflow) => (
            <Card key={workflow.id}>
              <CardHeader className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold text-gray-900">{workflow.name}</h3>
                  <span className="text-xs text-gray-500 font-mono">{workflow.code}</span>
                </div>
                {getStatusBadge(workflow.status)}
              </CardHeader>
              <CardBody>
                <p className="text-sm text-gray-600 mb-4 line-clamp-2">{workflow.description}</p>
                <div className="flex items-center gap-2 mb-4">
                  <Badge variant="secondary">{workflow.category}</Badge>
                  {getTriggerBadge(workflow.triggerType)}
                  <span className="text-xs text-gray-500">v{workflow.version}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500">
                    Created {new Date(workflow.createdAt).toLocaleDateString()}
                  </span>
                  <Button variant="outline" size="sm">
                    <Settings className="h-4 w-4 mr-1" />
                    Configure
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
