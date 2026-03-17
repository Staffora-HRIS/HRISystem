export { RouteErrorBoundary as ErrorBoundary } from "~/components/ui/RouteErrorBoundary";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { ArrowLeft, Upload } from "lucide-react";
import { Card, CardHeader, CardBody } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { api } from "~/lib/api-client";

export default function CreateCoursePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("general");
  const [durationMinutes, setDurationMinutes] = useState(30);
  const [contentType, setContentType] = useState("video");
  const [contentUrl, setContentUrl] = useState("");

  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => api.post("/lms/courses", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-courses"] });
      navigate("/admin/lms");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate({
      title,
      description,
      category,
      durationMinutes,
      contentType,
      contentUrl: contentUrl || undefined,
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" onClick={() => navigate("/admin/lms")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Create Course</h1>
          <p className="text-gray-600">Add a new learning course</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card>
          <CardHeader>
            <h3 className="font-semibold">Course Details</h3>
          </CardHeader>
          <CardBody className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Course Title</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                className="w-full rounded-md border border-gray-300 p-2"
                placeholder="Introduction to Company Policies"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className="w-full rounded-md border border-gray-300 p-2"
                placeholder="Describe what employees will learn..."
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="course-category" className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                <select
                  id="course-category"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  aria-label="Course category"
                  className="w-full rounded-md border border-gray-300 p-2"
                >
                  <option value="general">General</option>
                  <option value="compliance">Compliance</option>
                  <option value="technical">Technical</option>
                  <option value="leadership">Leadership</option>
                  <option value="onboarding">Onboarding</option>
                  <option value="safety">Safety</option>
                </select>
              </div>
              <div>
                <label htmlFor="course-duration" className="block text-sm font-medium text-gray-700 mb-1">Duration (minutes)</label>
                <input
                  id="course-duration"
                  type="number"
                  value={durationMinutes}
                  onChange={(e) => setDurationMinutes(parseInt(e.target.value) || 0)}
                  min={1}
                  placeholder="30"
                  className="w-full rounded-md border border-gray-300 p-2"
                />
              </div>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <h3 className="font-semibold">Content</h3>
          </CardHeader>
          <CardBody className="space-y-4">
            <div>
              <label htmlFor="content-type" className="block text-sm font-medium text-gray-700 mb-1">Content Type</label>
              <select
                id="content-type"
                value={contentType}
                onChange={(e) => setContentType(e.target.value)}
                aria-label="Content type"
                className="w-full rounded-md border border-gray-300 p-2"
              >
                <option value="video">Video</option>
                <option value="document">Document</option>
                <option value="scorm">SCORM Package</option>
                <option value="external">External Link</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Content URL</label>
              <input
                type="url"
                value={contentUrl}
                onChange={(e) => setContentUrl(e.target.value)}
                className="w-full rounded-md border border-gray-300 p-2"
                placeholder="https://..."
              />
            </div>
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
              <Upload className="h-8 w-8 mx-auto text-gray-400 mb-2" />
              <p className="text-sm text-gray-600">Drag and drop files here, or click to upload</p>
              <p className="text-xs text-gray-500 mt-1">Supports: MP4, PDF, SCORM (max 500MB)</p>
            </div>
          </CardBody>
        </Card>

        <div className="flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={() => navigate("/admin/lms")}>
            Cancel
          </Button>
          <Button type="submit" disabled={createMutation.isPending}>
            {createMutation.isPending ? "Creating..." : "Create Course"}
          </Button>
        </div>
      </form>
    </div>
  );
}
