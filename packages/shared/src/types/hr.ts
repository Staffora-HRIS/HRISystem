/**
 * Core HR Types
 *
 * Type definitions for employee management, organizational structure,
 * positions, contracts, compensation, and effective dating.
 */

import type {
  UUID,
  DateString,
  TimestampString,
  TenantScopedEntity,
  EffectiveDated,
  Money,
} from "./common";

// =============================================================================
// Employee Status Types
// =============================================================================

/** Employee lifecycle status */
export type EmployeeStatus = "pending" | "active" | "on_leave" | "terminated";

/** Employment type */
export type EmploymentType =
  | "full_time"
  | "part_time"
  | "contract"
  | "temporary"
  | "intern";

/** Gender options */
export type Gender = "male" | "female" | "non_binary" | "prefer_not_to_say" | "other";

/** Marital status options */
export type MaritalStatus =
  | "single"
  | "married"
  | "divorced"
  | "widowed"
  | "domestic_partnership"
  | "separated";

// =============================================================================
// Employee Types
// =============================================================================

/**
 * Core employee entity.
 */
export interface Employee extends TenantScopedEntity {
  /** Employee number (unique within tenant) */
  employeeNumber: string;
  /** Associated user account ID (if any) */
  userId?: UUID;
  /** Current lifecycle status */
  status: EmployeeStatus;
  /** Date of hire */
  hireDate: DateString;
  /** Original hire date (for rehires) */
  originalHireDate?: DateString;
  /** Date of termination (if terminated) */
  terminationDate?: DateString;
  /** Termination reason (if terminated) */
  terminationReason?: string;
  /** Primary work email */
  workEmail: string;
  /** Work phone number */
  workPhone?: string;
  /** Current job title */
  jobTitle: string;
  /** Current position ID */
  positionId?: UUID;
  /** Primary org unit ID */
  orgUnitId?: UUID;
  /** Primary cost center ID */
  costCenterId?: UUID;
  /** Primary work location ID */
  locationId?: UUID;
  /** Direct manager employee ID */
  managerId?: UUID;
  /** Employment type */
  employmentType: EmploymentType;
  /** Standard hours per week */
  standardHoursPerWeek: number;
  /** FTE (Full-Time Equivalent) value */
  fte: number;
  /** Whether employee is exempt from overtime */
  isExempt: boolean;
  /** Probation end date */
  probationEndDate?: DateString;
  /** Notice period in days */
  noticePeriodDays?: number;
}

/**
 * Employee personal information.
 */
export interface EmployeePersonal extends TenantScopedEntity {
  /** Employee ID */
  employeeId: UUID;
  /** Legal first name */
  firstName: string;
  /** Legal middle name */
  middleName?: string;
  /** Legal last name */
  lastName: string;
  /** Preferred first name */
  preferredFirstName?: string;
  /** Name prefix (Mr., Mrs., Dr., etc.) */
  prefix?: string;
  /** Name suffix (Jr., III, PhD, etc.) */
  suffix?: string;
  /** Full legal name */
  legalName: string;
  /** Date of birth */
  dateOfBirth?: DateString;
  /** Gender */
  gender?: Gender;
  /** Marital status */
  maritalStatus?: MaritalStatus;
  /** Nationality */
  nationality?: string;
  /** Primary citizenship */
  citizenship?: string;
  /** Ethnicities (for diversity reporting) */
  ethnicities?: string[];
  /** Disability status */
  disabilityStatus?: "yes" | "no" | "prefer_not_to_say";
  /** Veteran status */
  veteranStatus?: "yes" | "no" | "prefer_not_to_say";
  /** Profile photo URL */
  photoUrl?: string;
  /** Personal bio */
  bio?: string;
}

/**
 * Employee contact information.
 */
export interface EmployeeContact extends TenantScopedEntity {
  /** Employee ID */
  employeeId: UUID;
  /** Personal email */
  personalEmail?: string;
  /** Mobile phone */
  mobilePhone?: string;
  /** Home phone */
  homePhone?: string;
  /** Emergency contact name */
  emergencyContactName?: string;
  /** Emergency contact relationship */
  emergencyContactRelationship?: string;
  /** Emergency contact phone */
  emergencyContactPhone?: string;
  /** Emergency contact email */
  emergencyContactEmail?: string;
  /** Alternative emergency contact name */
  emergencyContact2Name?: string;
  /** Alternative emergency contact phone */
  emergencyContact2Phone?: string;
}

/** Address type */
export type AddressType = "home" | "mailing" | "work" | "other";

/**
 * Employee address.
 */
export interface EmployeeAddress extends TenantScopedEntity {
  /** Employee ID */
  employeeId: UUID;
  /** Address type */
  addressType: AddressType;
  /** Is this the primary address of this type? */
  isPrimary: boolean;
  /** Street address line 1 */
  street1: string;
  /** Street address line 2 */
  street2?: string;
  /** City */
  city: string;
  /** State/Province */
  state?: string;
  /** Postal/ZIP code */
  postalCode?: string;
  /** Country code (ISO 3166-1 alpha-2) */
  countryCode: string;
  /** County */
  county?: string;
  /** Effective from date */
  effectiveFrom: DateString;
  /** Effective to date */
  effectiveTo?: DateString;
}

/** Identifier type */
export type IdentifierType =
  | "nino"
  | "national_id"
  | "passport"
  | "drivers_license"
  | "tax_id"
  | "work_permit"
  | "visa"
  | "other";

/**
 * Employee identifier (sensitive data).
 */
export interface EmployeeIdentifier extends TenantScopedEntity {
  /** Employee ID */
  employeeId: UUID;
  /** Identifier type */
  identifierType: IdentifierType;
  /** Identifier value (encrypted at rest) */
  identifierValue: string;
  /** Issuing country */
  issuingCountry?: string;
  /** Issue date */
  issueDate?: DateString;
  /** Expiration date */
  expirationDate?: DateString;
  /** Whether this is the primary identifier of this type */
  isPrimary: boolean;
  /** Verification status */
  verificationStatus?: "pending" | "verified" | "failed";
  /** Date verified */
  verifiedAt?: TimestampString;
}

// =============================================================================
// Organizational Structure Types
// =============================================================================

/** Org unit type */
export type OrgUnitType =
  | "company"
  | "division"
  | "department"
  | "team"
  | "group"
  | "other";

/**
 * Organizational unit (department, team, etc.).
 */
export interface OrgUnit extends TenantScopedEntity, EffectiveDated {
  /** Org unit code */
  code: string;
  /** Org unit name */
  name: string;
  /** Description */
  description?: string;
  /** Org unit type */
  type: OrgUnitType;
  /** Parent org unit ID */
  parentId?: UUID;
  /** Head/Manager employee ID */
  headEmployeeId?: UUID;
  /** Default cost center ID */
  costCenterId?: UUID;
  /** Default location ID */
  locationId?: UUID;
  /** Sort order for display */
  sortOrder: number;
  /** Whether this unit is active */
  isActive: boolean;
  /** Materialized path for hierarchy queries */
  path?: string;
  /** Hierarchy level (0 = root) */
  level: number;
}

/**
 * Position definition.
 */
export interface Position extends TenantScopedEntity, EffectiveDated {
  /** Position code */
  code: string;
  /** Position title */
  title: string;
  /** Position description */
  description?: string;
  /** Job family/category */
  jobFamily?: string;
  /** Job grade/level */
  jobGrade?: string;
  /** Org unit this position belongs to */
  orgUnitId: UUID;
  /** Reports to position ID */
  reportsToPositionId?: UUID;
  /** Location ID */
  locationId?: UUID;
  /** Cost center ID */
  costCenterId?: UUID;
  /** Number of headcount for this position */
  headcount: number;
  /** Currently filled count */
  filledCount: number;
  /** Whether position is budgeted */
  isBudgeted: boolean;
  /** Target compensation range */
  compensationRange?: {
    min: Money;
    mid: Money;
    max: Money;
  };
  /** Employment type */
  employmentType: EmploymentType;
  /** Standard hours per week */
  standardHoursPerWeek: number;
  /** Whether position is exempt */
  isExempt: boolean;
  /** Required qualifications */
  qualifications?: string[];
  /** Required skills */
  requiredSkills?: UUID[];
  /** UK Standard Occupational Classification (SOC) code */
  socCode?: string;
  /** Working Time Regulations status */
  wtrStatus?: "subject_to_wtr" | "opted_out";
}

/**
 * Cost center for financial allocation.
 */
export interface CostCenter extends TenantScopedEntity, EffectiveDated {
  /** Cost center code */
  code: string;
  /** Cost center name */
  name: string;
  /** Description */
  description?: string;
  /** Parent cost center ID */
  parentId?: UUID;
  /** Manager employee ID */
  managerId?: UUID;
  /** Whether cost center is active */
  isActive: boolean;
  /** Budget amount */
  budget?: Money;
  /** GL account code */
  glAccountCode?: string;
}

// =============================================================================
// Contract Types
// =============================================================================

/** Contract type */
export type ContractType =
  | "permanent"
  | "fixed_term"
  | "temporary"
  | "contractor"
  | "consultant"
  | "intern";

/** Contract status */
export type ContractStatus =
  | "draft"
  | "pending_signature"
  | "active"
  | "expired"
  | "terminated"
  | "renewed";

/**
 * Employment contract.
 */
export interface EmploymentContract extends TenantScopedEntity {
  /** Employee ID */
  employeeId: UUID;
  /** Contract type */
  contractType: ContractType;
  /** Contract status */
  status: ContractStatus;
  /** Contract reference number */
  contractNumber?: string;
  /** Contract start date */
  startDate: DateString;
  /** Contract end date (null for permanent) */
  endDate?: DateString;
  /** Original contract this renews (if renewal) */
  renewedFromId?: UUID;
  /** Probation period in days */
  probationPeriodDays?: number;
  /** Notice period in days */
  noticePeriodDays?: number;
  /** Working hours per week */
  hoursPerWeek: number;
  /** Working days per week */
  daysPerWeek: number;
  /** Contract terms and conditions */
  terms?: string;
  /** Document URL */
  documentUrl?: string;
  /** Date signed by employee */
  signedByEmployeeAt?: TimestampString;
  /** Date signed by employer */
  signedByEmployerAt?: TimestampString;
  /** Signer on behalf of employer */
  employerSignerId?: UUID;
}

// =============================================================================
// Position Assignment Types
// =============================================================================

/** Assignment status */
export type AssignmentStatus = "active" | "inactive" | "pending" | "ended";

/**
 * Position assignment linking employee to position.
 */
export interface PositionAssignment extends TenantScopedEntity, EffectiveDated {
  /** Employee ID */
  employeeId: UUID;
  /** Position ID */
  positionId: UUID;
  /** Assignment status */
  status: AssignmentStatus;
  /** Whether this is the primary position */
  isPrimary: boolean;
  /** FTE allocation for this assignment */
  fte: number;
  /** Reason for assignment */
  reason?: string;
}

/**
 * Reporting line relationship.
 */
export interface ReportingLine extends TenantScopedEntity, EffectiveDated {
  /** Employee ID */
  employeeId: UUID;
  /** Manager employee ID */
  managerId: UUID;
  /** Reporting line type */
  lineType: "direct" | "matrix" | "dotted";
  /** Whether this is the primary reporting line */
  isPrimary: boolean;
}

// =============================================================================
// Compensation Types
// =============================================================================

/** Compensation type */
export type CompensationType =
  | "base_salary"
  | "hourly_rate"
  | "bonus"
  | "commission"
  | "allowance"
  | "equity"
  | "other";

/** Pay frequency */
export type PayFrequency =
  | "weekly"
  | "bi_weekly"
  | "semi_monthly"
  | "monthly"
  | "quarterly"
  | "annually";

/** Compensation change reason */
export type CompensationChangeReason =
  | "hire"
  | "promotion"
  | "merit_increase"
  | "market_adjustment"
  | "cost_of_living"
  | "transfer"
  | "demotion"
  | "correction"
  | "other";

/**
 * Compensation history record.
 */
export interface CompensationHistory extends TenantScopedEntity, EffectiveDated {
  /** Employee ID */
  employeeId: UUID;
  /** Compensation type */
  type: CompensationType;
  /** Amount */
  amount: Money;
  /** Pay frequency */
  frequency: PayFrequency;
  /** Annualized amount */
  annualizedAmount: Money;
  /** Reason for change */
  changeReason: CompensationChangeReason;
  /** Change percentage from previous */
  changePercentage?: number;
  /** Previous amount */
  previousAmount?: Money;
  /** Approved by */
  approvedBy?: UUID;
  /** Approval date */
  approvedAt?: TimestampString;
  /** Notes */
  notes?: string;
}

// =============================================================================
// Location Types
// =============================================================================

/** Location type */
export type LocationType =
  | "headquarters"
  | "office"
  | "branch"
  | "warehouse"
  | "remote"
  | "other";

/**
 * Work location.
 */
export interface Location extends TenantScopedEntity {
  /** Location code */
  code: string;
  /** Location name */
  name: string;
  /** Location type */
  type: LocationType;
  /** Street address line 1 */
  street1?: string;
  /** Street address line 2 */
  street2?: string;
  /** City */
  city?: string;
  /** State/Province */
  state?: string;
  /** Postal code */
  postalCode?: string;
  /** Country code */
  countryCode: string;
  /** Timezone */
  timezone: string;
  /** Phone number */
  phone?: string;
  /** Whether location is active */
  isActive: boolean;
  /** Latitude */
  latitude?: number;
  /** Longitude */
  longitude?: number;
  /** Geofence radius in meters */
  geofenceRadius?: number;
}

// =============================================================================
// Job Types
// =============================================================================

/**
 * Job definition (template for positions).
 */
export interface Job extends TenantScopedEntity {
  /** Job code */
  code: string;
  /** Job title */
  title: string;
  /** Job description */
  description?: string;
  /** Job summary */
  summary?: string;
  /** Job family */
  family?: string;
  /** Job grade/level */
  grade?: string;
  /** Essential functions */
  essentialFunctions?: string[];
  /** Qualifications */
  qualifications?: string[];
  /** Physical requirements */
  physicalRequirements?: string[];
  /** Working conditions */
  workingConditions?: string[];
  /** Working Time Regulations status */
  wtrStatus: "subject_to_wtr" | "opted_out";
  /** UK Standard Occupational Classification (SOC) code */
  socCode?: string;
  /** Whether job is active */
  isActive: boolean;
}

// =============================================================================
// Document Types
// =============================================================================

/** Document type */
export type EmployeeDocumentType =
  | "contract"
  | "id_document"
  | "tax_form"
  | "performance_review"
  | "disciplinary"
  | "certification"
  | "resume"
  | "offer_letter"
  | "policy_acknowledgment"
  | "other";

/**
 * Employee document.
 */
export interface EmployeeDocument extends TenantScopedEntity {
  /** Employee ID */
  employeeId: UUID;
  /** Document type */
  documentType: EmployeeDocumentType;
  /** Document name */
  name: string;
  /** Description */
  description?: string;
  /** File name */
  fileName: string;
  /** File size in bytes */
  fileSize: number;
  /** MIME type */
  mimeType: string;
  /** Storage path/URL */
  storagePath: string;
  /** Upload date */
  uploadedAt: TimestampString;
  /** Uploaded by user ID */
  uploadedBy: UUID;
  /** Expiration date (if applicable) */
  expirationDate?: DateString;
  /** Whether document is confidential */
  isConfidential: boolean;
  /** Document tags */
  tags?: string[];
}
