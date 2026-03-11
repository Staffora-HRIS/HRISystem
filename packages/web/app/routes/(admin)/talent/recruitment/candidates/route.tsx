import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router";
import {
  ArrowLeft,
  Plus,
  User,
  Mail,
  Phone,
  Star,
  ChevronRight,
  Search,
} from "lucide-react";
import { Card, CardHeader, CardBody, StatCard } from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";
import { useToast } from "~/components/ui/toast";
import { Button } from "~/components/ui/button";
import { api } from "~/lib/api-client";

interface Candidate {
  id: string;
  requisitionId: string;
  requisitionTitle?: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  currentStage: "applied" | "screening" | "interview" | "offer" | "hired" | "rejected" | "withdrawn";
  source: string;
  resumeUrl: string | null;
  linkedinUrl: string | null;
  rating: number | null;
  createdAt: string;
}

interface CandidateStats {
  totalCandidates: number;
  appliedCount: number;
  screeningCount: number;
  interviewCount: number;
  offerCount: number;
  hiredCount: number;
  rejectedCount: number;
}

interface PipelineStage {
  stage: string;
  count: number;
}

const stageLabels: Record<string, string> = {
  applied: "Applied",
  screening: "Screening",
  interview: "Interview",
  offer: "Offer",
  hired: "Hired",
  rejected: "Rejected",
  withdrawn: "Withdrawn",
};

const stageColors: Record<string, string> = {
  applied: "bg-gray-100 text-gray-700",
  screening: "bg-blue-100 text-blue-700",
  interview: "bg-purple-100 text-purple-700",
  offer: "bg-green-100 text-green-700",
  hired: "bg-emerald-100 text-emerald-700",
  rejected: "bg-red-100 text-red-700",
  withdrawn: "bg-yellow-100 text-yellow-700",
};

const sourceLabels: Record<string, string> = {
  direct: "Direct",
  referral: "Referral",
  job_board: "Job Board",
  agency: "Agency",
  linkedin: "LinkedIn",
  internal: "Internal",
  career_site: "Career Site",
  other: "Other",
};

export default function CandidatesPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [searchParams] = useSearchParams();
  const requisitionIdFilter = searchParams.get("requisitionId") || "";

  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState<string>("");
  const [sourceFilter, setSourceFilter] = useState<string>("");

  const { data, isLoading } = useQuery({
    queryKey: ["admin-candidates", search, stageFilter, sourceFilter, requisitionIdFilter],
    queryFn: () => api.get<{ candidates: Candidate[]; count: number }>(
      "/recruitment/candidates",
      {
        params: {
          search: search || undefined,
          stage: stageFilter || undefined,
          source: sourceFilter || undefined,
          requisitionId: requisitionIdFilter || undefined,
        },
      }
    ),
  });

  const { data: stats } = useQuery({
    queryKey: ["admin-candidate-stats"],
    queryFn: () => api.get<CandidateStats>("/recruitment/candidates/stats"),
  });

  const { data: pipeline } = useQuery({
    queryKey: ["requisition-pipeline", requisitionIdFilter],
    queryFn: () => api.get<{ stages: PipelineStage[] }>(
      `/recruitment/requisitions/${requisitionIdFilter}/pipeline`
    ),
    enabled: !!requisitionIdFilter,
  });

  const candidates = data?.candidates || [];

  const getStageBadge = (stage: string) => (
    <span className={`px-2 py-1 rounded-full text-xs font-medium ${stageColors[stage] || "bg-gray-100"}`}>
      {stageLabels[stage] || stage}
    </span>
  );

  const renderRating = (rating: number | null) => {
    if (!rating) return null;
    return (
      <div className="flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((star) => (
          <Star
            key={star}
            className={`h-4 w-4 ${star <= rating ? "text-yellow-400 fill-yellow-400" : "text-gray-300"}`}
          />
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" onClick={() => navigate("/admin/talent/recruitment")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900">Candidates</h1>
          <p className="text-gray-600">
            {requisitionIdFilter ? "Candidates for this requisition" : "All candidates across requisitions"}
          </p>
        </div>
        <Button onClick={() => toast.info("Coming Soon", { message: "Candidate creation will be available in a future update." })}>
          <Plus className="h-4 w-4 mr-2" />
          Add Candidate
        </Button>
      </div>

      {/* Stats */}
      {stats && !requisitionIdFilter && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
          <StatCard title="Total" value={stats.totalCandidates} icon={<User className="h-5 w-5" />} />
          <StatCard title="Applied" value={stats.appliedCount} />
          <StatCard title="Screening" value={stats.screeningCount} />
          <StatCard title="Interview" value={stats.interviewCount} />
          <StatCard title="Offer" value={stats.offerCount} />
          <StatCard title="Hired" value={stats.hiredCount} />
          <StatCard title="Rejected" value={stats.rejectedCount} />
        </div>
      )}

      {/* Pipeline for specific requisition */}
      {pipeline && requisitionIdFilter && (
        <Card>
          <CardHeader className="border-b">
            <h3 className="font-semibold">Hiring Pipeline</h3>
          </CardHeader>
          <CardBody className="p-4">
            <div className="flex items-center gap-2 overflow-x-auto">
              {["applied", "screening", "interview", "offer", "hired"].map((stage, index) => {
                const stageData = pipeline.stages.find((s) => s.stage === stage);
                return (
                  <div key={stage} className="flex items-center">
                    <button
                      onClick={() => setStageFilter(stageFilter === stage ? "" : stage)}
                      className={`flex flex-col items-center px-6 py-3 rounded-lg min-w-[100px] transition-all ${
                        stageFilter === stage
                          ? "bg-blue-100 ring-2 ring-blue-500"
                          : "bg-gray-100 hover:bg-gray-200"
                      }`}
                    >
                      <span className="text-2xl font-bold">{stageData?.count || 0}</span>
                      <span className="text-xs text-gray-600">{stageLabels[stage]}</span>
                    </button>
                    {index < 4 && <ChevronRight className="h-5 w-5 text-gray-400 mx-1" />}
                  </div>
                );
              })}
            </div>
          </CardBody>
        </Card>
      )}

      {/* Filters */}
      <Card>
        <CardBody className="p-4">
          <div className="flex flex-wrap items-center gap-4">
            <div className="relative flex-1 min-w-[200px] max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search by name or email..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border rounded-lg"
              />
            </div>
            <select
              value={stageFilter}
              onChange={(e) => setStageFilter(e.target.value)}
              className="px-4 py-2 border rounded-lg"
            >
              <option value="">All Stages</option>
              {Object.entries(stageLabels).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
            <select
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value)}
              className="px-4 py-2 border rounded-lg"
            >
              <option value="">All Sources</option>
              {Object.entries(sourceLabels).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>
        </CardBody>
      </Card>

      {/* Candidates List */}
      <Card>
        <CardHeader className="border-b">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold flex items-center gap-2">
              <User className="h-5 w-5 text-blue-600" />
              Candidates
            </h3>
            <span className="text-sm text-gray-500">
              {candidates.length} candidates
            </span>
          </div>
        </CardHeader>
        <CardBody className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-gray-500">Loading...</div>
          ) : candidates.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              <User className="h-12 w-12 mx-auto text-gray-300 mb-2" />
              <p>No candidates found</p>
              <p className="text-sm">Try adjusting your filters</p>
            </div>
          ) : (
            <div className="divide-y">
              {candidates.map((candidate) => (
                <div
                  key={candidate.id}
                  className="p-4 hover:bg-gray-50 cursor-pointer"
                  onClick={() => toast.info("Coming Soon", { message: "Candidate detail view will be available in a future update." })}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-4">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-100 text-gray-600 font-medium">
                        {candidate.firstName[0]}{candidate.lastName[0]}
                      </div>
                      <div>
                        <h4 className="font-medium text-gray-900">
                          {candidate.firstName} {candidate.lastName}
                        </h4>
                        <div className="flex items-center gap-4 mt-1 text-sm text-gray-500">
                          <span className="flex items-center gap-1">
                            <Mail className="h-3 w-3" />
                            {candidate.email}
                          </span>
                          {candidate.phone && (
                            <span className="flex items-center gap-1">
                              <Phone className="h-3 w-3" />
                              {candidate.phone}
                            </span>
                          )}
                        </div>
                        {candidate.requisitionTitle && (
                          <p className="text-xs text-gray-400 mt-1">
                            Applied for: {candidate.requisitionTitle}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      {getStageBadge(candidate.currentStage)}
                      {renderRating(candidate.rating)}
                      <div className="flex items-center gap-2 text-xs text-gray-400">
                        <Badge variant="secondary">{sourceLabels[candidate.source] || candidate.source}</Badge>
                        <span>{new Date(candidate.createdAt).toLocaleDateString()}</span>
                      </div>
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
