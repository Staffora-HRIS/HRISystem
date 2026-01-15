import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { MessageSquare, Plus, Clock, CheckCircle } from "lucide-react";
import { Card, CardHeader, CardBody, StatCard } from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { useToast } from "~/components/ui/toast";
import { api } from "~/lib/api-client";

interface HRCase {
  id: string;
  caseNumber: string;
  category: string;
  subject: string;
  description: string;
  priority: "low" | "medium" | "high" | "urgent";
  status: "open" | "in_progress" | "resolved" | "closed";
  assigneeName: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

export default function MyCasesPage() {
  const [showNew, setShowNew] = useState(false);
  const [filter, setFilter] = useState<string>("all");
  const queryClient = useQueryClient();
  const toast = useToast();

  const { data, isLoading } = useQuery({
    queryKey: ["my-cases"],
    queryFn: () => api.get<{ cases: HRCase[]; count: number }>("/cases/my-cases"),
  });

  const createMutation = useMutation({
    mutationFn: (data: { category: string; subject: string; description: string; priority: string }) =>
      api.post("/cases", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-cases"] });
      setShowNew(false);
    },
  });

  const cases = data?.cases || [];
  const filtered = filter === "all" ? cases : cases.filter(c => c.status === filter);

  const stats = {
    total: cases.length,
    open: cases.filter(c => c.status === "open" || c.status === "in_progress").length,
    resolved: cases.filter(c => c.status === "resolved" || c.status === "closed").length,
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "open": return <Badge variant="warning">Open</Badge>;
      case "in_progress": return <Badge variant="info">In Progress</Badge>;
      case "resolved": return <Badge variant="success">Resolved</Badge>;
      case "closed": return <Badge variant="secondary">Closed</Badge>;
      default: return <Badge>{status}</Badge>;
    }
  };

  const getPriorityBadge = (priority: string) => {
    switch (priority) {
      case "urgent": return <Badge variant="destructive">Urgent</Badge>;
      case "high": return <Badge variant="warning">High</Badge>;
      case "medium": return <Badge variant="info">Medium</Badge>;
      default: return <Badge variant="secondary">Low</Badge>;
    }
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    createMutation.mutate({
      category: formData.get("category") as string,
      subject: formData.get("subject") as string,
      description: formData.get("description") as string,
      priority: formData.get("priority") as string,
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My HR Cases</h1>
          <p className="text-gray-600">Submit and track HR inquiries</p>
        </div>
        <Button onClick={() => setShowNew(true)}>
          <Plus className="h-4 w-4 mr-2" />
          New Case
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard title="Total Cases" value={stats.total} icon={<MessageSquare className="h-5 w-5" />} />
        <StatCard title="Open" value={stats.open} icon={<Clock className="h-5 w-5" />} />
        <StatCard title="Resolved" value={stats.resolved} icon={<CheckCircle className="h-5 w-5" />} />
      </div>

      {showNew && (
        <Card>
          <CardHeader>
            <h3 className="font-semibold">Create New Case</h3>
          </CardHeader>
          <CardBody>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="category" className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                  <select id="category" name="category" required aria-label="Category" className="w-full rounded-md border border-gray-300 p-2">
                    <option value="benefits">Benefits</option>
                    <option value="leave">Leave</option>
                    <option value="workplace">Workplace</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="priority" className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
                  <select id="priority" name="priority" required aria-label="Priority" className="w-full rounded-md border border-gray-300 p-2">
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>
              </div>
              <div>
                <label htmlFor="subject" className="block text-sm font-medium text-gray-700 mb-1">Subject</label>
                <input id="subject" type="text" name="subject" required placeholder="Enter case subject" className="w-full rounded-md border border-gray-300 p-2" />
              </div>
              <div>
                <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea id="description" name="description" rows={4} placeholder="Describe your issue" className="w-full rounded-md border border-gray-300 p-2" />
              </div>
              <div className="flex gap-2 justify-end">
                <Button type="button" variant="outline" onClick={() => setShowNew(false)}>Cancel</Button>
                <Button type="submit" disabled={createMutation.isPending}>
                  {createMutation.isPending ? "Submitting..." : "Submit Case"}
                </Button>
              </div>
            </form>
          </CardBody>
        </Card>
      )}

      <div className="flex gap-2">
        {["all", "open", "in_progress", "resolved", "closed"].map((f) => (
          <Button key={f} variant={filter === f ? "primary" : "outline"} size="sm" onClick={() => setFilter(f)}>
            {f === "all" ? "All" : f.replace("_", " ").replace(/\b\w/g, l => l.toUpperCase())}
          </Button>
        ))}
      </div>

      {isLoading ? (
        <div className="text-center py-8">Loading...</div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardBody className="text-center py-12">
            <MessageSquare className="h-12 w-12 mx-auto text-gray-400 mb-4" />
            <h3 className="text-lg font-medium text-gray-900">No cases found</h3>
            <p className="text-gray-500">You haven't submitted any HR cases yet.</p>
          </CardBody>
        </Card>
      ) : (
        <div className="space-y-4">
          {filtered.map((hrCase) => (
            <Card key={hrCase.id}>
              <CardBody>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-sm font-mono text-gray-500">{hrCase.caseNumber}</span>
                      {getStatusBadge(hrCase.status)}
                      {getPriorityBadge(hrCase.priority)}
                    </div>
                    <h3 className="font-semibold text-gray-900">{hrCase.subject}</h3>
                    <p className="text-sm text-gray-600 mt-1">{hrCase.description}</p>
                    <div className="flex items-center gap-4 mt-3 text-sm text-gray-500">
                      <span>Category: {hrCase.category}</span>
                      <span>Created: {new Date(hrCase.createdAt).toLocaleDateString()}</span>
                      {hrCase.assigneeName && <span>Assigned to: {hrCase.assigneeName}</span>}
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      toast.info("Case details", {
                        message: `Case details view is not available yet for ${hrCase.caseNumber}.`,
                      })
                    }
                  >
                    View Details
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
