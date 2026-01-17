import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import {
  FileText,
  Users,
  Calendar,
  DollarSign,
  Clock,
  TrendingUp,
  Shield,
  Building2,
  Search,
  Play,
  Download,
  Star,
} from "lucide-react";
import {
  Card,
  CardHeader,
  CardBody,
  Button,
  Badge,
  Input,
} from "~/components/ui";
import { api } from "~/lib/api-client";

interface Report {
  id: string;
  name: string;
  description: string;
  category: string;
  last_run: string | null;
}

const CATEGORY_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  workforce: Users,
  absence: Calendar,
  time: Clock,
  benefits: DollarSign,
  learning: TrendingUp,
  talent: Star,
  compensation: DollarSign,
  organization: Building2,
  compliance: Shield,
};

const CATEGORY_COLORS: Record<string, string> = {
  workforce: "bg-blue-100 text-blue-600",
  absence: "bg-purple-100 text-purple-600",
  time: "bg-yellow-100 text-yellow-600",
  benefits: "bg-green-100 text-green-600",
  learning: "bg-orange-100 text-orange-600",
  talent: "bg-pink-100 text-pink-600",
  compensation: "bg-emerald-100 text-emerald-600",
  organization: "bg-indigo-100 text-indigo-600",
  compliance: "bg-red-100 text-red-600",
};

export default function AdminReportsIndexPage() {
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");

  const { data: reportsData, isLoading } = useQuery({
    queryKey: ["admin-reports"],
    queryFn: () => api.get<{ items: Report[] }>("/analytics/reports"),
  });

  const reports = reportsData?.items ?? [];

  // Get unique categories
  const categories = [...new Set(reports.map((r) => r.category))];

  // Filter reports
  const filteredReports = reports.filter((report) => {
    const matchesSearch =
      !search ||
      report.name.toLowerCase().includes(search.toLowerCase()) ||
      report.description.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = !categoryFilter || report.category === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  // Group by category
  const groupedReports = filteredReports.reduce((acc, report) => {
    if (!acc[report.category]) {
      acc[report.category] = [];
    }
    acc[report.category].push(report);
    return acc;
  }, {} as Record<string, Report[]>);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Reports</h1>
          <p className="text-gray-600">Run and download standard HR reports</p>
        </div>
        <Button variant="outline">
          <Download className="h-4 w-4 mr-2" />
          Export All
        </Button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search reports..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setCategoryFilter("")}
            className={`px-3 py-1.5 text-sm rounded-full transition-colors ${
              !categoryFilter
                ? "bg-blue-100 text-blue-700"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            All
          </button>
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setCategoryFilter(cat)}
              className={`px-3 py-1.5 text-sm rounded-full capitalize transition-colors ${
                categoryFilter === cat
                  ? "bg-blue-100 text-blue-700"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Reports */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      ) : filteredReports.length === 0 ? (
        <Card>
          <CardBody className="text-center py-12">
            <FileText className="h-12 w-12 mx-auto text-gray-400 mb-4" />
            <h3 className="text-lg font-medium text-gray-900">No reports found</h3>
            <p className="text-gray-500">
              {search || categoryFilter
                ? "Try adjusting your filters"
                : "No reports are available"}
            </p>
          </CardBody>
        </Card>
      ) : (
        <div className="space-y-6">
          {Object.entries(groupedReports).map(([category, categoryReports]) => {
            const CategoryIcon = CATEGORY_ICONS[category] || FileText;
            const colorClass = CATEGORY_COLORS[category] || "bg-gray-100 text-gray-600";

            return (
              <div key={category}>
                <h2 className="text-lg font-semibold text-gray-900 capitalize mb-3">
                  {category} Reports
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {categoryReports.map((report) => (
                    <Card key={report.id} className="hover:shadow-md transition-shadow">
                      <CardBody className="p-5">
                        <div className="flex items-start gap-4">
                          <div
                            className={`flex h-10 w-10 items-center justify-center rounded-lg flex-shrink-0 ${colorClass}`}
                          >
                            <CategoryIcon className="h-5 w-5" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <h3 className="font-medium text-gray-900">{report.name}</h3>
                            <p className="text-sm text-gray-500 mt-1 line-clamp-2">
                              {report.description}
                            </p>
                            <div className="flex items-center gap-2 mt-3">
                              <Link to={`/admin/reports/${report.id}`}>
                                <Button size="sm">
                                  <Play className="h-3 w-3 mr-1" />
                                  Run
                                </Button>
                              </Link>
                              <Button size="sm" variant="outline">
                                <Download className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      </CardBody>
                    </Card>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
