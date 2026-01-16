/**
 * CompetencyGapChart Component
 *
 * Displays a visual gap analysis for employee competencies.
 */

import { AlertTriangle, CheckCircle, TrendingUp } from "lucide-react";
import { Card, CardHeader, CardBody } from "~/components/ui/card";

interface CompetencyGap {
  competencyId: string;
  competencyName: string;
  competencyCategory: string;
  requiredLevel: number;
  currentLevel: number;
  gap: number;
  isRequired: boolean;
}

interface CompetencyGapChartProps {
  gaps: CompetencyGap[];
  showHeader?: boolean;
}

const categoryColors: Record<string, string> = {
  technical: "bg-blue-500",
  leadership: "bg-purple-500",
  core: "bg-green-500",
  functional: "bg-yellow-500",
  behavioral: "bg-pink-500",
  management: "bg-indigo-500",
};

function GapBar({
  currentLevel,
  requiredLevel,
  maxLevel = 5,
  category,
}: {
  currentLevel: number;
  requiredLevel: number;
  maxLevel?: number;
  category: string;
}) {
  const currentPercent = (currentLevel / maxLevel) * 100;
  const requiredPercent = (requiredLevel / maxLevel) * 100;
  const barColor = categoryColors[category] || "bg-gray-500";

  return (
    <div className="relative h-6 bg-gray-100 rounded-full overflow-hidden">
      {/* Current level bar */}
      <div
        className={`absolute left-0 top-0 h-full ${barColor} transition-all duration-300`}
        style={{ width: `${currentPercent}%` }}
      />

      {/* Required level marker */}
      <div
        className="absolute top-0 h-full w-0.5 bg-red-500"
        style={{ left: `${requiredPercent}%` }}
      >
        <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-red-500" />
      </div>

      {/* Level labels */}
      <div className="absolute inset-0 flex items-center justify-between px-2 text-xs">
        <span className="font-medium text-white drop-shadow">{currentLevel}</span>
        <span className="font-medium text-gray-600">{requiredLevel}</span>
      </div>
    </div>
  );
}

export function CompetencyGapChart({
  gaps,
  showHeader = true,
}: CompetencyGapChartProps) {
  const criticalGaps = gaps.filter((g) => g.gap >= 2 && g.isRequired);
  const moderateGaps = gaps.filter((g) => g.gap === 1 || (g.gap >= 2 && !g.isRequired));
  const metCompetencies = gaps.filter((g) => g.gap <= 0);

  const totalGaps = gaps.reduce((sum, g) => sum + Math.max(0, g.gap), 0);
  const avgGap = gaps.length > 0 ? (totalGaps / gaps.length).toFixed(1) : "0";

  return (
    <Card>
      {showHeader && (
        <CardHeader className="border-b">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">Competency Gap Analysis</h3>
            <div className="flex items-center gap-4 text-sm">
              <div className="flex items-center gap-1">
                <span className="text-gray-500">Total Gaps:</span>
                <span className="font-medium text-red-600">{totalGaps}</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-gray-500">Avg Gap:</span>
                <span className="font-medium">{avgGap}</span>
              </div>
            </div>
          </div>
        </CardHeader>
      )}

      <CardBody className="p-4 space-y-6">
        {/* Summary boxes */}
        <div className="grid grid-cols-3 gap-4">
          <div className="p-3 bg-red-50 rounded-lg text-center">
            <AlertTriangle className="h-5 w-5 mx-auto text-red-500 mb-1" />
            <p className="text-2xl font-bold text-red-700">{criticalGaps.length}</p>
            <p className="text-xs text-red-600">Critical Gaps</p>
          </div>
          <div className="p-3 bg-yellow-50 rounded-lg text-center">
            <TrendingUp className="h-5 w-5 mx-auto text-yellow-500 mb-1" />
            <p className="text-2xl font-bold text-yellow-700">{moderateGaps.length}</p>
            <p className="text-xs text-yellow-600">Development Areas</p>
          </div>
          <div className="p-3 bg-green-50 rounded-lg text-center">
            <CheckCircle className="h-5 w-5 mx-auto text-green-500 mb-1" />
            <p className="text-2xl font-bold text-green-700">{metCompetencies.length}</p>
            <p className="text-xs text-green-600">Meeting Target</p>
          </div>
        </div>

        {/* Gap list */}
        {gaps.length > 0 ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between text-xs text-gray-500">
              <span>Current Level</span>
              <span>Required Level</span>
            </div>

            {gaps
              .sort((a, b) => b.gap - a.gap)
              .map((gap) => (
                <div key={gap.competencyId} className="space-y-1">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{gap.competencyName}</span>
                      {gap.isRequired && (
                        <span className="text-xs px-1.5 py-0.5 bg-red-100 text-red-700 rounded">
                          Required
                        </span>
                      )}
                    </div>
                    <span
                      className={`text-sm font-medium ${
                        gap.gap > 0 ? "text-red-600" : "text-green-600"
                      }`}
                    >
                      {gap.gap > 0 ? `Gap: ${gap.gap}` : "Met"}
                    </span>
                  </div>
                  <GapBar
                    currentLevel={gap.currentLevel}
                    requiredLevel={gap.requiredLevel}
                    category={gap.competencyCategory}
                  />
                </div>
              ))}
          </div>
        ) : (
          <div className="text-center py-8 text-gray-500">
            <CheckCircle className="h-12 w-12 mx-auto text-green-300 mb-2" />
            <p>No competency gaps identified</p>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
