/**
 * CompetencyCard Component
 *
 * Displays a single competency with its levels and assessment status.
 */

import { Award, TrendingUp, Target } from "lucide-react";
import { Card, CardBody } from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";

interface CompetencyLevel {
  level: number;
  name: string;
  description: string;
}

interface CompetencyCardProps {
  competency: {
    id: string;
    code: string;
    name: string;
    category: string;
    description?: string | null;
    levels?: CompetencyLevel[];
    currentLevel?: number | null;
    targetLevel?: number | null;
    gap?: number;
    isRequired?: boolean;
  };
  showAssessment?: boolean;
  onAssess?: (competencyId: string) => void;
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

function LevelIndicator({
  currentLevel,
  targetLevel,
  maxLevel = 5,
}: {
  currentLevel?: number | null;
  targetLevel?: number | null;
  maxLevel?: number;
}) {
  const current = currentLevel ?? 0;
  const target = targetLevel ?? maxLevel;

  return (
    <div className="flex items-center gap-1">
      {Array.from({ length: maxLevel }).map((_, i) => {
        const level = i + 1;
        const isCurrent = level <= current;
        const isTarget = level === target && level > current;

        return (
          <div
            key={level}
            className={`
              w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium
              ${isCurrent ? "bg-green-500 text-white" : ""}
              ${isTarget ? "bg-yellow-200 text-yellow-800 ring-2 ring-yellow-400" : ""}
              ${!isCurrent && !isTarget ? "bg-gray-100 text-gray-400" : ""}
            `}
          >
            {level}
          </div>
        );
      })}
    </div>
  );
}

export function CompetencyCard({
  competency,
  showAssessment = false,
  onAssess,
}: CompetencyCardProps) {
  const hasGap = (competency.gap ?? 0) > 0;
  const categoryColor = categoryColors[competency.category] || "bg-gray-100 text-gray-800";
  const categoryLabel = categoryLabels[competency.category] || competency.category;

  return (
    <Card className={hasGap ? "border-yellow-200" : ""}>
      <CardBody className="p-4">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <Award className="h-5 w-5 text-blue-600" />
              <h3 className="font-semibold text-gray-900">{competency.name}</h3>
              {competency.isRequired && (
                <Badge variant="destructive" className="text-xs">
                  Required
                </Badge>
              )}
            </div>

            <div className="flex items-center gap-2 mb-2">
              <span className={`text-xs px-2 py-0.5 rounded-full ${categoryColor}`}>
                {categoryLabel}
              </span>
              <span className="text-xs text-gray-500">Code: {competency.code}</span>
            </div>

            {competency.description && (
              <p className="text-sm text-gray-600 mb-3 line-clamp-2">
                {competency.description}
              </p>
            )}

            {showAssessment && (
              <div className="space-y-2">
                <LevelIndicator
                  currentLevel={competency.currentLevel}
                  targetLevel={competency.targetLevel}
                />

                <div className="flex items-center gap-4 text-sm">
                  <div className="flex items-center gap-1">
                    <TrendingUp className="h-4 w-4 text-green-600" />
                    <span className="text-gray-600">Current:</span>
                    <span className="font-medium">{competency.currentLevel ?? "Not assessed"}</span>
                  </div>

                  <div className="flex items-center gap-1">
                    <Target className="h-4 w-4 text-blue-600" />
                    <span className="text-gray-600">Target:</span>
                    <span className="font-medium">{competency.targetLevel ?? "N/A"}</span>
                  </div>

                  {hasGap && (
                    <Badge variant="outline" className="text-yellow-700 border-yellow-300 bg-yellow-50">
                      Gap: {competency.gap}
                    </Badge>
                  )}
                </div>
              </div>
            )}
          </div>

          {onAssess && (
            <button
              onClick={() => onAssess(competency.id)}
              className="text-sm text-blue-600 hover:text-blue-800 font-medium"
            >
              Assess
            </button>
          )}
        </div>
      </CardBody>
    </Card>
  );
}
