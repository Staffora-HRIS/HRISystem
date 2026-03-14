/**
 * System Report Templates Page
 *
 * Browse system-provided report templates and clone them into your own reports.
 */

import { useNavigate } from "react-router";
import {
  FileText,
  Copy,
  Table2,
  BarChart3,
  Grid3X3,
  PieChart,
  Layout,
  AlertCircle,
  RefreshCw,
  ArrowLeft,
} from "lucide-react";
import { Button, Card, CardBody, Badge, Spinner, toast } from "~/components/ui";
import { useSystemTemplates, useCreateFromTemplate } from "../hooks";
import { Link } from "react-router";

const typeIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  tabular: Table2,
  summary: BarChart3,
  cross_tab: Grid3X3,
  chart: PieChart,
  dashboard_widget: Layout,
};

const typeLabels: Record<string, string> = {
  tabular: "Table",
  summary: "Summary",
  cross_tab: "Pivot",
  chart: "Chart",
  dashboard_widget: "Widget",
};

export default function TemplatesPage() {
  const navigate = useNavigate();
  const { data, isLoading, isError, refetch } = useSystemTemplates();
  const createFromTemplate = useCreateFromTemplate();

  const templates = data?.data ?? [];

  // Group by category
  const grouped = templates.reduce<Record<string, typeof templates>>((acc, t) => {
    const cat = t.category ?? "Other";
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(t);
    return acc;
  }, {});

  const handleUseTemplate = async (templateId: string) => {
    try {
      const result = await createFromTemplate.mutateAsync(templateId);
      toast.success("Report created from template!");
      navigate(`/admin/reports/${result?.data?.id}/edit`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to create from template";
      toast.error(msg);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-2">
          <Link to="/admin/reports">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back
            </Button>
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">Report Templates</h1>
        </div>
        <div className="flex justify-center py-12" role="status">
          <Spinner size="lg" />
          <span className="sr-only">Loading templates...</span>
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-2">
          <Link to="/admin/reports">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back
            </Button>
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">Report Templates</h1>
        </div>
        <div className="flex flex-col items-center justify-center py-12 space-y-4">
          <AlertCircle className="h-12 w-12 text-red-400" />
          <p className="text-gray-700 font-medium">Failed to load templates</p>
          <Button variant="outline" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Retry
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Link to="/admin/reports">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Report Templates</h1>
            <p className="text-gray-600">
              Pre-built report templates — clone and customise to your needs
            </p>
          </div>
        </div>
      </div>

      {templates.length === 0 ? (
        <Card>
          <CardBody className="text-center py-12">
            <FileText className="h-12 w-12 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No templates available</h3>
            <p className="text-gray-500">System templates will appear here once they are seeded.</p>
          </CardBody>
        </Card>
      ) : (
        Object.entries(grouped).map(([category, catTemplates]) => (
          <div key={category} className="space-y-3">
            <h2 className="text-lg font-semibold text-gray-800">{category}</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {catTemplates.map((template) => {
                const TypeIcon = typeIcons[template.reportType] ?? FileText;
                return (
                  <Card key={template.id} className="hover:shadow-md transition-shadow">
                    <CardBody className="space-y-3">
                      <div className="flex items-start gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-50 shrink-0">
                          <TypeIcon className="h-5 w-5 text-purple-600" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <h3 className="font-medium text-gray-900 truncate">
                            {template.name}
                          </h3>
                          <span className="text-xs text-gray-500">
                            {typeLabels[template.reportType] ?? template.reportType}
                          </span>
                        </div>
                      </div>

                      {template.description && (
                        <p className="text-sm text-gray-600 line-clamp-2">
                          {template.description}
                        </p>
                      )}

                      <div className="flex items-center justify-between pt-2 border-t border-gray-100">
                        <Badge variant="default" size="sm">
                          {template.config?.columns?.length ?? 0} columns
                        </Badge>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleUseTemplate(template.id)}
                          disabled={createFromTemplate.isPending}
                        >
                          <Copy className="h-3.5 w-3.5 mr-1" />
                          Use Template
                        </Button>
                      </div>
                    </CardBody>
                  </Card>
                );
              })}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
