import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart3,
  Users,
  TrendingDown,
  Clock,
  Calendar,
  Download,
  RefreshCw,
} from "lucide-react";
import { Card, CardBody } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { ExecutiveDashboard } from "~/components/analytics";
import { api } from "~/lib/api-client";

interface ReportDefinition {
  id: string;
  name: string;
  description: string;
  category: string;
  last_run?: string;
}

export default function AnalyticsDashboardPage() {
  const [activeTab, setActiveTab] = useState<"dashboard" | "reports">(
    "dashboard"
  );
  const [dateRange, setDateRange] = useState("last_30_days");

  const { data: reports, isLoading: reportsLoading } = useQuery({
    queryKey: ["standard-reports"],
    queryFn: () =>
      api.get<{ items: ReportDefinition[] }>("/analytics/reports"),
    enabled: activeTab === "reports",
  });

  const handleExportDashboard = async () => {
    try {
      const response = await fetch("/api/v1/analytics/dashboard/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ format: "pdf", date_range: dateRange }),
      });
      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `hr-dashboard-${new Date().toISOString().split("T")[0]}.pdf`;
        a.click();
      }
    } catch (err) {
      console.error("Export failed:", err);
    }
  };

  const reportCategories = [
    { id: "headcount", name: "Headcount Reports", icon: Users },
    { id: "turnover", name: "Turnover Analysis", icon: TrendingDown },
    { id: "attendance", name: "Attendance Reports", icon: Clock },
    { id: "leave", name: "Leave Reports", icon: Calendar },
    { id: "compensation", name: "Compensation Reports", icon: BarChart3 },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Analytics & Reporting
          </h1>
          <p className="text-gray-600">
            HR metrics, dashboards, and standard reports
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value)}
            className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
          >
            <option value="last_7_days">Last 7 Days</option>
            <option value="last_30_days">Last 30 Days</option>
            <option value="last_90_days">Last 90 Days</option>
            <option value="last_12_months">Last 12 Months</option>
            <option value="ytd">Year to Date</option>
          </select>
          <Button variant="outline" onClick={handleExportDashboard}>
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex gap-6">
          <button
            onClick={() => setActiveTab("dashboard")}
            className={`py-3 px-1 border-b-2 font-medium text-sm ${
              activeTab === "dashboard"
                ? "border-blue-500 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
            }`}
          >
            Executive Dashboard
          </button>
          <button
            onClick={() => setActiveTab("reports")}
            className={`py-3 px-1 border-b-2 font-medium text-sm ${
              activeTab === "reports"
                ? "border-blue-500 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
            }`}
          >
            Standard Reports
          </button>
        </nav>
      </div>

      {/* Dashboard Tab */}
      {activeTab === "dashboard" && <ExecutiveDashboard />}

      {/* Reports Tab */}
      {activeTab === "reports" && (
        <div className="space-y-6">
          {reportsLoading ? (
            <div className="text-center py-8">Loading reports...</div>
          ) : (
            reportCategories.map((category) => {
              const Icon = category.icon;
              const categoryReports =
                reports?.items.filter((r) => r.category === category.id) || [];

              if (categoryReports.length === 0) return null;

              return (
                <div key={category.id}>
                  <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                    <Icon className="h-5 w-5 text-gray-500" />
                    {category.name}
                  </h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {categoryReports.map((report) => (
                      <Card
                        key={report.id}
                        className="hover:shadow-md transition-shadow cursor-pointer"
                      >
                        <CardBody>
                          <h3 className="font-medium text-gray-900">
                            {report.name}
                          </h3>
                          <p className="text-sm text-gray-500 mt-1">
                            {report.description}
                          </p>
                          {report.last_run && (
                            <p className="text-xs text-gray-400 mt-2">
                              Last run:{" "}
                              {new Date(report.last_run).toLocaleDateString()}
                            </p>
                          )}
                          <div className="flex gap-2 mt-4">
                            <Button variant="outline" size="sm" className="flex-1">
                              <RefreshCw className="h-3 w-3 mr-1" />
                              Run
                            </Button>
                            <Button variant="outline" size="sm" className="flex-1">
                              <Download className="h-3 w-3 mr-1" />
                              Export
                            </Button>
                          </div>
                        </CardBody>
                      </Card>
                    ))}
                  </div>
                </div>
              );
            })
          )}

          {/* Quick Reports */}
          <div>
            <h2 className="text-lg font-semibold mb-4">Quick Reports</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card className="hover:shadow-md transition-shadow cursor-pointer">
                <CardBody className="text-center py-6">
                  <Users className="h-8 w-8 mx-auto text-blue-600 mb-2" />
                  <h3 className="font-medium">Headcount Summary</h3>
                  <p className="text-sm text-gray-500">
                    Current workforce overview
                  </p>
                </CardBody>
              </Card>
              <Card className="hover:shadow-md transition-shadow cursor-pointer">
                <CardBody className="text-center py-6">
                  <TrendingDown className="h-8 w-8 mx-auto text-red-600 mb-2" />
                  <h3 className="font-medium">Turnover Report</h3>
                  <p className="text-sm text-gray-500">
                    Attrition analysis
                  </p>
                </CardBody>
              </Card>
              <Card className="hover:shadow-md transition-shadow cursor-pointer">
                <CardBody className="text-center py-6">
                  <Clock className="h-8 w-8 mx-auto text-yellow-600 mb-2" />
                  <h3 className="font-medium">Attendance Report</h3>
                  <p className="text-sm text-gray-500">
                    Time and attendance data
                  </p>
                </CardBody>
              </Card>
              <Card className="hover:shadow-md transition-shadow cursor-pointer">
                <CardBody className="text-center py-6">
                  <Calendar className="h-8 w-8 mx-auto text-green-600 mb-2" />
                  <h3 className="font-medium">Leave Balances</h3>
                  <p className="text-sm text-gray-500">
                    PTO and leave summary
                  </p>
                </CardBody>
              </Card>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
