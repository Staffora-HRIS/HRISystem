import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import {
  ArrowLeft,
  Plus,
  Award,
  Search,
} from "lucide-react";
import { Card, CardHeader, CardBody } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { Badge } from "~/components/ui/badge";
import { useToast } from "~/components/ui/toast";
import { api } from "~/lib/api-client";

interface Competency {
  id: string;
  code: string;
  name: string;
  category: string;
  description: string | null;
  isActive: boolean;
  createdAt: string;
}

interface CompetenciesResponse {
  items: Competency[];
  nextCursor: string | null;
  hasMore: boolean;
}

const categoryColors: Record<string, string> = {
  technical: "bg-blue-100 text-blue-800",
  leadership: "bg-purple-100 text-purple-800",
  core: "bg-green-100 text-green-800",
  functional: "bg-yellow-100 text-yellow-800",
  behavioral: "bg-pink-100 text-pink-800",
  management: "bg-indigo-100 text-indigo-800",
};

const categoryLabels: Record<string, string> = {
  technical: "Technical",
  leadership: "Leadership",
  core: "Core",
  functional: "Functional",
  behavioral: "Behavioral",
  management: "Management",
};

export default function CompetenciesPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("");

  const { data, isLoading } = useQuery({
    queryKey: ["competencies", search, categoryFilter],
    queryFn: () =>
      api.get<CompetenciesResponse>("/competencies", {
        params: {
          search: search || undefined,
          category: categoryFilter || undefined,
        },
      }),
  });

  const categories = ["technical", "leadership", "core", "functional", "behavioral", "management"];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" onClick={() => navigate("/admin/talent")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900">Competency Library</h1>
          <p className="text-gray-600">
            Manage your organization's competency framework
          </p>
        </div>
        <Button onClick={() => toast.info("Coming Soon", { message: "Competency creation will be available in a future update." })}>
          <Plus className="h-4 w-4 mr-2" />
          Add Competency
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        {categories.map((cat) => {
          const count = data?.items.filter((c) => c.category === cat).length || 0;
          return (
            <Card
              key={cat}
              className={`cursor-pointer transition-all ${
                categoryFilter === cat ? "ring-2 ring-blue-500" : ""
              }`}
              onClick={() => setCategoryFilter(categoryFilter === cat ? "" : cat)}
            >
              <CardBody className="p-4 text-center">
                <p className="text-2xl font-bold text-gray-900">{count}</p>
                <p className="text-sm text-gray-500 capitalize">{cat}</p>
              </CardBody>
            </Card>
          );
        })}
      </div>

      {/* Filters */}
      <Card>
        <CardBody className="p-4">
          <div className="flex items-center gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search competencies..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border rounded-lg"
              />
            </div>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="px-4 py-2 border rounded-lg"
            >
              <option value="">All Categories</option>
              {categories.map((cat) => (
                <option key={cat} value={cat}>
                  {categoryLabels[cat]}
                </option>
              ))}
            </select>
          </div>
        </CardBody>
      </Card>

      {/* Competencies List */}
      <Card>
        <CardHeader className="border-b">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold flex items-center gap-2">
              <Award className="h-5 w-5 text-blue-600" />
              Competencies
            </h3>
            <span className="text-sm text-gray-500">
              {data?.items.length || 0} competencies
            </span>
          </div>
        </CardHeader>
        <CardBody className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-gray-500">Loading...</div>
          ) : data?.items.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              <Award className="h-12 w-12 mx-auto text-gray-300 mb-2" />
              <p>No competencies found</p>
              <p className="text-sm">Add competencies to build your framework</p>
            </div>
          ) : (
            <div className="divide-y">
              {data?.items.map((competency) => (
                <div
                  key={competency.id}
                  className="p-4 hover:bg-gray-50 cursor-pointer"
                  onClick={() => toast.info("Coming Soon", { message: "Competency detail view will be available in a future update." })}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="font-medium text-gray-900">
                          {competency.name}
                        </h4>
                        <span className="text-xs text-gray-500">
                          ({competency.code})
                        </span>
                      </div>
                      {competency.description && (
                        <p className="text-sm text-gray-600 line-clamp-1">
                          {competency.description}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-xs px-2 py-1 rounded-full ${
                          categoryColors[competency.category] || "bg-gray-100"
                        }`}
                      >
                        {categoryLabels[competency.category] || competency.category}
                      </span>
                      <Badge variant={competency.isActive ? "success" : "secondary"}>
                        {competency.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
