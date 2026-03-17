/**
 * Pension Auto-Enrolment Management
 *
 * Manages UK workplace pension auto-enrolment (Pensions Act 2008):
 * - Compliance dashboard with key metrics
 * - Pension scheme management (CRUD)
 * - Enrolment management with eligibility assessment and auto-enrol actions
 * - Bulk re-enrolment trigger (3-year cycle)
 *
 * All monetary values from the API are in pence -- displayed as GBP pounds.
 */

import { useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "~/components/ui/tabs";

export { RouteErrorBoundary as ErrorBoundary } from "~/components/ui/RouteErrorBoundary";

import { usePensionManagement } from "./use-pension-management";
import { PensionComplianceDashboard } from "./PensionComplianceDashboard";
import { PensionSchemesTable } from "./PensionSchemesTable";
import { PensionEnrolmentsTable } from "./PensionEnrolmentsTable";
import { CreateSchemeModal } from "./CreateSchemeModal";
import { AssessEmployeeModal } from "./AssessEmployeeModal";
import { AutoEnrolModal } from "./AutoEnrolModal";

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function PensionManagementPage() {
  // Tab and filter state
  const [activeTab, setActiveTab] = useState("schemes");
  const [statusFilter, setStatusFilter] = useState("");

  // Modal state
  const [showCreateSchemeModal, setShowCreateSchemeModal] = useState(false);
  const [showAssessModal, setShowAssessModal] = useState(false);
  const [showEnrolModal, setShowEnrolModal] = useState(false);

  // Data hook
  const {
    compliance,
    complianceLoading,
    complianceError,
    refetchCompliance,
    schemes,
    schemesLoading,
    schemesError,
    refetchSchemes,
    enrolments,
    enrolmentsLoading,
    enrolmentsError,
    refetchEnrolments,
    createSchemeMutation,
    assessMutation,
    enrolMutation,
    reEnrolmentMutation,
  } = usePensionManagement(statusFilter);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Pension Auto-Enrolment
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Manage workplace pension schemes and auto-enrolment compliance
            (Pensions Act 2008)
          </p>
        </div>
      </div>

      {/* Compliance Dashboard */}
      <PensionComplianceDashboard
        compliance={compliance}
        isLoading={complianceLoading}
        isError={complianceError}
        onRetry={() => refetchCompliance()}
      />

      {/* Tabs: Schemes and Enrolments */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="schemes">Schemes</TabsTrigger>
          <TabsTrigger value="enrolments">Enrolments</TabsTrigger>
        </TabsList>

        <TabsContent value="schemes">
          <PensionSchemesTable
            schemes={schemes}
            isLoading={schemesLoading}
            isError={schemesError}
            onRetry={() => refetchSchemes()}
            onCreateScheme={() => setShowCreateSchemeModal(true)}
          />
        </TabsContent>

        <TabsContent value="enrolments">
          <PensionEnrolmentsTable
            enrolments={enrolments}
            isLoading={enrolmentsLoading}
            isError={enrolmentsError}
            statusFilter={statusFilter}
            isReEnrolling={reEnrolmentMutation.isPending}
            onRetry={() => refetchEnrolments()}
            onStatusFilterChange={setStatusFilter}
            onAssessEmployee={() => setShowAssessModal(true)}
            onAutoEnrol={() => setShowEnrolModal(true)}
            onTriggerReEnrolment={() => reEnrolmentMutation.mutate()}
          />
        </TabsContent>
      </Tabs>

      {/* Modals */}
      {showCreateSchemeModal && (
        <CreateSchemeModal
          isPending={createSchemeMutation.isPending}
          onSubmit={(payload) => {
            createSchemeMutation.mutate(payload, {
              onSuccess: () => setShowCreateSchemeModal(false),
            });
          }}
          onClose={() => setShowCreateSchemeModal(false)}
        />
      )}

      {showAssessModal && (
        <AssessEmployeeModal
          isPending={assessMutation.isPending}
          onSubmit={(employeeId) => {
            assessMutation.mutate(employeeId, {
              onSuccess: () => setShowAssessModal(false),
            });
          }}
          onClose={() => setShowAssessModal(false)}
        />
      )}

      {showEnrolModal && (
        <AutoEnrolModal
          isPending={enrolMutation.isPending}
          onSubmit={(employeeId) => {
            enrolMutation.mutate(employeeId, {
              onSuccess: () => setShowEnrolModal(false),
            });
          }}
          onClose={() => setShowEnrolModal(false)}
        />
      )}
    </div>
  );
}
