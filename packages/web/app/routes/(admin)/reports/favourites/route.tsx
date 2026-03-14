/**
 * Favourites Page — Shows user's bookmarked reports.
 */

import { useNavigate } from "react-router";
import { Link } from "react-router";
import {
  Star,
  Play,
  Table2,
  BarChart3,
  Grid3X3,
  PieChart,
  Layout,
  FileText,
  AlertCircle,
  RefreshCw,
  ArrowLeft,
} from "lucide-react";
import { Button, Card, CardBody, Badge, Spinner, toast } from "~/components/ui";
import { useFavourites, useRemoveFavourite } from "../hooks";

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

export default function FavouritesPage() {
  const navigate = useNavigate();
  const { data, isLoading, isError, refetch } = useFavourites();
  const removeFavourite = useRemoveFavourite();

  const reports = data?.data ?? [];

  const handleRemoveFavourite = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await removeFavourite.mutateAsync(id);
      toast.success("Removed from favourites");
    } catch {
      toast.error("Failed to remove favourite");
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
          <h1 className="text-2xl font-bold text-gray-900">Favourite Reports</h1>
        </div>
        <div className="flex justify-center py-12" role="status">
          <Spinner size="lg" />
          <span className="sr-only">Loading favourites...</span>
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
          <h1 className="text-2xl font-bold text-gray-900">Favourite Reports</h1>
        </div>
        <div className="flex flex-col items-center justify-center py-12 space-y-4">
          <AlertCircle className="h-12 w-12 text-red-400" />
          <p className="text-gray-700 font-medium">Failed to load favourites</p>
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
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Link to="/admin/reports">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Favourite Reports</h1>
            <p className="text-gray-600">Your bookmarked reports for quick access</p>
          </div>
        </div>
      </div>

      {reports.length === 0 ? (
        <Card>
          <CardBody className="text-center py-12">
            <Star className="h-12 w-12 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No favourites yet</h3>
            <p className="text-gray-500 mb-4">
              Star reports from the library to add them to your favourites.
            </p>
            <Link to="/admin/reports">
              <Button variant="primary">Browse Reports</Button>
            </Link>
          </CardBody>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {reports.map((report) => {
            const TypeIcon = typeIcons[report.reportType] ?? FileText;
            return (
              <Card
                key={report.id}
                className="hover:shadow-md transition-shadow cursor-pointer"
                onClick={() => navigate(`/admin/reports/${report.id}`)}
              >
                <CardBody className="space-y-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 shrink-0">
                        <TypeIcon className="h-5 w-5 text-blue-600" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-medium text-gray-900 truncate">{report.name}</h3>
                        <span className="text-xs text-gray-500">
                          {typeLabels[report.reportType] ?? report.reportType}
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      aria-label="Remove from favourites"
                      onClick={(e) => handleRemoveFavourite(report.id, e)}
                      className="text-yellow-500 hover:text-yellow-600 p-0.5"
                    >
                      <Star className="h-5 w-5 fill-current" />
                    </button>
                  </div>

                  {report.description && (
                    <p className="text-sm text-gray-600 line-clamp-2">{report.description}</p>
                  )}

                  {report.category && (
                    <Badge variant="default" size="sm">{report.category}</Badge>
                  )}

                  <div className="flex items-center justify-between pt-2 border-t border-gray-100">
                    <span className="text-xs text-gray-500">
                      {report.runCount > 0 ? `${report.runCount} runs` : "Never run"}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/admin/reports/${report.id}`);
                      }}
                    >
                      <Play className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </CardBody>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
