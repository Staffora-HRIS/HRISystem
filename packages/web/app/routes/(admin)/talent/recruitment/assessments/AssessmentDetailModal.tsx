/**
 * Assessment Detail Modal
 *
 * Shows details of a candidate assessment with actions to record results or cancel.
 */

import { useState } from "react";
import { Button } from "~/components/ui/button";
import { Modal, ModalHeader, ModalBody, ModalFooter } from "~/components/ui/modal";
import type { CandidateAssessment } from "./types";
import {
  typeLabels,
  typeColors,
  assessmentStatusLabels,
  assessmentStatusColors,
} from "./types";

interface AssessmentDetailModalProps {
  assessment: CandidateAssessment;
  onClose: () => void;
  onRecordResult: (data: { score: number; passed: boolean; feedback?: string }) => void;
  onCancel: () => void;
  isRecordingResult: boolean;
  isCancelling: boolean;
}

export function AssessmentDetailModal({
  assessment,
  onClose,
  onRecordResult,
  onCancel,
  isRecordingResult,
  isCancelling,
}: AssessmentDetailModalProps) {
  const [showRecordResult, setShowRecordResult] = useState(false);
  const [resultData, setResultData] = useState({
    score: "",
    passed: true,
    feedback: "",
  });

  if (showRecordResult) {
    return (
      <Modal open onClose={() => setShowRecordResult(false)} size="sm">
        <ModalHeader>
          <h3 className="text-lg font-semibold">Record Assessment Result</h3>
        </ModalHeader>
        <ModalBody>
          <div className="space-y-4">
            <div>
              <label htmlFor="res-score" className="block text-sm font-medium text-gray-700 mb-1">
                Score <span className="text-red-500">*</span>
              </label>
              <input
                id="res-score"
                type="number"
                value={resultData.score}
                onChange={(e) =>
                  setResultData({ ...resultData, score: e.target.value })
                }
                className="w-full rounded-md border border-gray-300 p-2"
                min="0"
                placeholder="85"
              />
            </div>
            <div>
              <label htmlFor="res-passed" className="block text-sm font-medium text-gray-700 mb-1">
                Result <span className="text-red-500">*</span>
              </label>
              <select
                id="res-passed"
                value={resultData.passed ? "true" : "false"}
                onChange={(e) =>
                  setResultData({
                    ...resultData,
                    passed: e.target.value === "true",
                  })
                }
                className="w-full rounded-md border border-gray-300 p-2"
              >
                <option value="true">Passed</option>
                <option value="false">Failed</option>
              </select>
            </div>
            <div>
              <label htmlFor="res-feedback" className="block text-sm font-medium text-gray-700 mb-1">
                Feedback
              </label>
              <textarea
                id="res-feedback"
                value={resultData.feedback}
                onChange={(e) =>
                  setResultData({ ...resultData, feedback: e.target.value })
                }
                className="w-full rounded-md border border-gray-300 p-2"
                rows={3}
                placeholder="Assessor feedback..."
              />
            </div>
          </div>
        </ModalBody>
        <ModalFooter>
          <Button
            variant="outline"
            onClick={() => setShowRecordResult(false)}
            disabled={isRecordingResult}
          >
            Cancel
          </Button>
          <Button
            onClick={() =>
              onRecordResult({
                score: Number(resultData.score),
                passed: resultData.passed,
                feedback: resultData.feedback || undefined,
              })
            }
            disabled={!resultData.score || isRecordingResult}
          >
            {isRecordingResult ? "Recording..." : "Record Result"}
          </Button>
        </ModalFooter>
      </Modal>
    );
  }

  return (
    <Modal open onClose={onClose} size="md">
      <ModalHeader>
        <h3 className="text-lg font-semibold">
          {assessment.templateName || "Assessment"}
        </h3>
      </ModalHeader>
      <ModalBody>
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <span
              className={`px-2 py-1 rounded-full text-xs font-medium ${assessmentStatusColors[assessment.status]}`}
            >
              {assessmentStatusLabels[assessment.status]}
            </span>
            {assessment.templateType && (
              <span
                className={`px-2 py-1 rounded-full text-xs font-medium ${typeColors[assessment.templateType] || "bg-gray-100"}`}
              >
                {typeLabels[assessment.templateType] || assessment.templateType}
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            {assessment.scheduledAt && (
              <div className="bg-gray-50 rounded-lg p-3">
                <div className="text-xs text-gray-500">Scheduled</div>
                <div className="text-sm">
                  {new Date(assessment.scheduledAt).toLocaleString()}
                </div>
              </div>
            )}
            {assessment.completedAt && (
              <div className="bg-gray-50 rounded-lg p-3">
                <div className="text-xs text-gray-500">Completed</div>
                <div className="text-sm">
                  {new Date(assessment.completedAt).toLocaleString()}
                </div>
              </div>
            )}
            {assessment.score !== null && (
              <div className="bg-gray-50 rounded-lg p-3">
                <div className="text-xs text-gray-500">Score</div>
                <div className="text-sm font-medium">{assessment.score}</div>
              </div>
            )}
            {assessment.passed !== null && (
              <div className="bg-gray-50 rounded-lg p-3">
                <div className="text-xs text-gray-500">Result</div>
                <div
                  className={`text-sm font-medium ${assessment.passed ? "text-green-600" : "text-red-600"}`}
                >
                  {assessment.passed ? "Passed" : "Failed"}
                </div>
              </div>
            )}
          </div>

          {assessment.feedback && (
            <div className="bg-gray-50 rounded-lg p-3">
              <div className="text-xs text-gray-500 mb-1">Feedback</div>
              <div className="text-sm">{assessment.feedback}</div>
            </div>
          )}

          {/* Actions */}
          <div className="border-t pt-4 flex flex-wrap gap-2">
            {(assessment.status === "scheduled" ||
              assessment.status === "in_progress") && (
              <>
                <Button
                  onClick={() => {
                    setResultData({ score: "", passed: true, feedback: "" });
                    setShowRecordResult(true);
                  }}
                >
                  Record Result
                </Button>
                <Button
                  variant="danger"
                  onClick={onCancel}
                  disabled={isCancelling}
                >
                  {isCancelling ? "Cancelling..." : "Cancel Assessment"}
                </Button>
              </>
            )}
          </div>
        </div>
      </ModalBody>
      <ModalFooter>
        <Button variant="outline" onClick={onClose}>
          Close
        </Button>
      </ModalFooter>
    </Modal>
  );
}
