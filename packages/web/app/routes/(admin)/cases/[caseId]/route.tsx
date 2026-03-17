export { RouteErrorBoundary as ErrorBoundary } from "~/components/ui/RouteErrorBoundary";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useNavigate } from "react-router";
import { ArrowLeft, Send, User, Clock, AlertTriangle } from "lucide-react";
import { Card, CardHeader, CardBody } from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { api } from "~/lib/api-client";

interface CaseDetail {
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
  resolution?: string;
  createdAt: string;
  updatedAt: string;
}

interface CaseComment {
  id: string;
  content: string;
  authorId: string;
  authorName?: string;
  isInternal: boolean;
  createdAt: string;
}

export default function CaseDetailPage() {
  const { caseId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [newComment, setNewComment] = useState("");
  const [isInternal, setIsInternal] = useState(false);

  const { data: caseData, isLoading } = useQuery({
    queryKey: ["case", caseId],
    queryFn: () => api.get<CaseDetail>(`/cases/${caseId}`),
    enabled: !!caseId,
  });

  const { data: commentsData } = useQuery({
    queryKey: ["case-comments", caseId],
    queryFn: () => api.get<{ comments: CaseComment[] }>(`/cases/${caseId}/comments`),
    enabled: !!caseId,
  });

  const addCommentMutation = useMutation({
    mutationFn: (data: { content: string; isInternal: boolean }) =>
      api.post(`/cases/${caseId}/comments`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["case-comments", caseId] });
      setNewComment("");
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: (status: string) =>
      api.patch(`/cases/${caseId}`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["case", caseId] });
      queryClient.invalidateQueries({ queryKey: ["admin-cases"] });
    },
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "open": return <Badge variant="info">Open</Badge>;
      case "in_progress": return <Badge variant="warning">In Progress</Badge>;
      case "pending_info": return <Badge variant="secondary">Pending Info</Badge>;
      case "escalated": return <Badge variant="destructive">Escalated</Badge>;
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
      case "low": return <Badge variant="secondary">Low</Badge>;
      default: return <Badge>{priority}</Badge>;
    }
  };

  if (isLoading) {
    return <div className="text-center py-8">Loading...</div>;
  }

  if (!caseData) {
    return <div className="text-center py-8">Case not found</div>;
  }

  const comments = commentsData?.comments || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" onClick={() => navigate("/admin/cases")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900">{caseData.caseNumber}</h1>
          <p className="text-gray-600">{caseData.subject}</p>
        </div>
        <div className="flex gap-2">
          {getStatusBadge(caseData.status)}
          {getPriorityBadge(caseData.priority)}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <h3 className="font-semibold">Description</h3>
            </CardHeader>
            <CardBody>
              <p className="text-gray-700 whitespace-pre-wrap">{caseData.description}</p>
            </CardBody>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <h3 className="font-semibold">Comments</h3>
              <span className="text-sm text-gray-500">{comments.length} comments</span>
            </CardHeader>
            <CardBody className="space-y-4">
              {comments.length === 0 ? (
                <p className="text-gray-500 text-center py-4">No comments yet</p>
              ) : (
                <div className="space-y-4">
                  {comments.map((comment) => (
                    <div
                      key={comment.id}
                      className={`p-4 rounded-lg ${comment.isInternal ? "bg-yellow-50 border border-yellow-200" : "bg-gray-50"}`}
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <User className="h-4 w-4 text-gray-400" />
                        <span className="font-medium text-sm">{comment.authorName || "Unknown"}</span>
                        {comment.isInternal && (
                          <Badge variant="warning" className="text-xs">Internal</Badge>
                        )}
                        <span className="text-xs text-gray-500 ml-auto">
                          {new Date(comment.createdAt).toLocaleString()}
                        </span>
                      </div>
                      <p className="text-gray-700">{comment.content}</p>
                    </div>
                  ))}
                </div>
              )}

              <div className="border-t pt-4">
                <textarea
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  placeholder="Add a comment..."
                  rows={3}
                  className="w-full rounded-md border border-gray-300 p-2"
                />
                <div className="flex items-center justify-between mt-2">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={isInternal}
                      onChange={(e) => setIsInternal(e.target.checked)}
                      className="rounded"
                    />
                    Internal note (not visible to employee)
                  </label>
                  <Button
                    onClick={() => addCommentMutation.mutate({ content: newComment, isInternal })}
                    disabled={!newComment.trim() || addCommentMutation.isPending}
                  >
                    <Send className="h-4 w-4 mr-2" />
                    {addCommentMutation.isPending ? "Sending..." : "Send"}
                  </Button>
                </div>
              </div>
            </CardBody>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <h3 className="font-semibold">Details</h3>
            </CardHeader>
            <CardBody className="space-y-4">
              <div>
                <label className="text-sm text-gray-500">Category</label>
                <p className="font-medium">{caseData.category}</p>
              </div>
              <div>
                <label className="text-sm text-gray-500">Employee</label>
                <p className="font-medium">{caseData.employeeName || "Unknown"}</p>
              </div>
              <div>
                <label className="text-sm text-gray-500">Assignee</label>
                <p className="font-medium">{caseData.assigneeName || "Unassigned"}</p>
              </div>
              <div>
                <label className="text-sm text-gray-500">Created</label>
                <p className="font-medium">{new Date(caseData.createdAt).toLocaleString()}</p>
              </div>
              <div>
                <label className="text-sm text-gray-500">Last Updated</label>
                <p className="font-medium">{new Date(caseData.updatedAt).toLocaleString()}</p>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <h3 className="font-semibold">Actions</h3>
            </CardHeader>
            <CardBody className="space-y-2">
              {caseData.status === "open" && (
                <Button
                  className="w-full"
                  onClick={() => updateStatusMutation.mutate("in_progress")}
                  disabled={updateStatusMutation.isPending}
                >
                  <Clock className="h-4 w-4 mr-2" />
                  Start Working
                </Button>
              )}
              {caseData.status === "in_progress" && (
                <>
                  <Button
                    className="w-full"
                    variant="outline"
                    onClick={() => updateStatusMutation.mutate("pending_info")}
                    disabled={updateStatusMutation.isPending}
                  >
                    Request Info
                  </Button>
                  <Button
                    className="w-full"
                    variant="outline"
                    onClick={() => updateStatusMutation.mutate("escalated")}
                    disabled={updateStatusMutation.isPending}
                  >
                    <AlertTriangle className="h-4 w-4 mr-2" />
                    Escalate
                  </Button>
                  <Button
                    className="w-full"
                    onClick={() => updateStatusMutation.mutate("resolved")}
                    disabled={updateStatusMutation.isPending}
                  >
                    Mark Resolved
                  </Button>
                </>
              )}
              {caseData.status === "resolved" && (
                <Button
                  className="w-full"
                  onClick={() => updateStatusMutation.mutate("closed")}
                  disabled={updateStatusMutation.isPending}
                >
                  Close Case
                </Button>
              )}
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}
