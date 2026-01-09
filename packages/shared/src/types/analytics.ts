/**
 * Analytics Types
 *
 * Type definitions for predictive analytics models,
 * datasets, feature definitions, insights, and cohort analysis.
 */

import type {
  UUID,
  DateString,
  TimestampString,
  TenantScopedEntity,
} from "./common";

// =============================================================================
// Predictive Analytics Model Types
// =============================================================================

/** Model type */
export type PAModelType =
  | "attrition_risk"
  | "performance_prediction"
  | "flight_risk"
  | "promotion_readiness"
  | "engagement_score"
  | "skill_gap"
  | "succession_planning"
  | "workforce_planning"
  | "custom";

/** Model status */
export type PAModelStatus =
  | "draft"
  | "training"
  | "validating"
  | "active"
  | "inactive"
  | "failed"
  | "deprecated";

/**
 * Predictive analytics model definition.
 */
export interface PAModel extends TenantScopedEntity {
  /** Model name */
  name: string;
  /** Description */
  description?: string;
  /** Model type */
  type: PAModelType;
  /** Model status */
  status: PAModelStatus;
  /** Model version */
  version: number;
  /** Algorithm type */
  algorithm:
    | "logistic_regression"
    | "random_forest"
    | "gradient_boosting"
    | "neural_network"
    | "xgboost"
    | "ensemble"
    | "custom";
  /** Feature definitions */
  features: PAFeatureDefinition[];
  /** Target variable */
  target: {
    name: string;
    type: "classification" | "regression" | "probability";
    classes?: string[];
  };
  /** Hyperparameters */
  hyperparameters?: Record<string, unknown>;
  /** Training dataset ID */
  trainingDatasetId?: UUID;
  /** Validation dataset ID */
  validationDatasetId?: UUID;
  /** Model metrics */
  metrics?: PAModelMetrics;
  /** Training configuration */
  trainingConfig?: {
    testSplitRatio: number;
    validationSplitRatio: number;
    crossValidationFolds?: number;
    maxTrainingTimeMinutes?: number;
    earlyStopping?: boolean;
    earlyStoppingPatience?: number;
  };
  /** Model artifacts location */
  artifactsPath?: string;
  /** Trained timestamp */
  trainedAt?: TimestampString;
  /** Training duration in seconds */
  trainingDurationSeconds?: number;
  /** Last prediction timestamp */
  lastPredictionAt?: TimestampString;
  /** Prediction count */
  predictionCount: number;
  /** Schedule for retraining */
  retrainingSchedule?: {
    frequency: "weekly" | "monthly" | "quarterly";
    dayOfWeek?: number;
    dayOfMonth?: number;
  };
  /** Created by user ID */
  createdBy: UUID;
  /** Tags */
  tags?: string[];
  /** Explainability enabled */
  explainabilityEnabled: boolean;
  /** Fairness constraints */
  fairnessConstraints?: Array<{
    protectedAttribute: string;
    metric: "demographic_parity" | "equalized_odds" | "calibration";
    threshold: number;
  }>;
}

/**
 * Model performance metrics.
 */
export interface PAModelMetrics {
  /** Accuracy (classification) */
  accuracy?: number;
  /** Precision (classification) */
  precision?: number;
  /** Recall (classification) */
  recall?: number;
  /** F1 score (classification) */
  f1Score?: number;
  /** AUC-ROC (classification) */
  aucRoc?: number;
  /** AUC-PR (classification) */
  aucPr?: number;
  /** Mean squared error (regression) */
  mse?: number;
  /** Root mean squared error (regression) */
  rmse?: number;
  /** Mean absolute error (regression) */
  mae?: number;
  /** R-squared (regression) */
  r2?: number;
  /** Confusion matrix */
  confusionMatrix?: number[][];
  /** Feature importance */
  featureImportance?: Record<string, number>;
  /** Cross-validation scores */
  cvScores?: number[];
  /** Calibration error */
  calibrationError?: number;
}

// =============================================================================
// Feature Definition Types
// =============================================================================

/** Feature type */
export type PAFeatureType =
  | "numeric"
  | "categorical"
  | "boolean"
  | "date"
  | "text"
  | "embedding";

/** Feature source */
export type PAFeatureSource =
  | "employee"
  | "performance"
  | "attendance"
  | "engagement"
  | "compensation"
  | "tenure"
  | "demographics"
  | "manager"
  | "team"
  | "external"
  | "derived";

/**
 * Feature definition for predictive models.
 */
export interface PAFeatureDefinition {
  /** Feature ID */
  id: string;
  /** Feature name */
  name: string;
  /** Description */
  description?: string;
  /** Feature type */
  type: PAFeatureType;
  /** Feature source */
  source: PAFeatureSource;
  /** Source field/path */
  sourceField: string;
  /** Transformation */
  transformation?: {
    type:
      | "none"
      | "standardize"
      | "normalize"
      | "log"
      | "one_hot"
      | "label_encode"
      | "bin"
      | "custom";
    params?: Record<string, unknown>;
  };
  /** Missing value handling */
  missingValueStrategy: "drop" | "mean" | "median" | "mode" | "constant" | "predict";
  /** Missing value fill */
  missingValueFill?: unknown;
  /** Is required */
  isRequired: boolean;
  /** Importance weight (if known) */
  importanceWeight?: number;
  /** Validation rules */
  validationRules?: Array<{
    type: "range" | "values" | "pattern";
    params: Record<string, unknown>;
  }>;
  /** Categorical values (if categorical) */
  categoricalValues?: string[];
  /** Numeric bounds */
  numericBounds?: {
    min?: number;
    max?: number;
  };
  /** Is sensitive attribute */
  isSensitive: boolean;
}

// =============================================================================
// Dataset Types
// =============================================================================

/** Dataset status */
export type PADatasetStatus =
  | "pending"
  | "processing"
  | "ready"
  | "failed"
  | "archived";

/**
 * Dataset for model training/prediction.
 */
export interface PADataset extends TenantScopedEntity {
  /** Dataset name */
  name: string;
  /** Description */
  description?: string;
  /** Dataset status */
  status: PADatasetStatus;
  /** Dataset type */
  type: "training" | "validation" | "prediction" | "historical";
  /** Source query/configuration */
  sourceConfig: {
    type: "query" | "upload" | "snapshot";
    query?: string;
    filePath?: string;
    snapshotDate?: DateString;
  };
  /** Row count */
  rowCount?: number;
  /** Feature columns */
  featureColumns: string[];
  /** Target column */
  targetColumn?: string;
  /** Date range */
  dateRange?: {
    start: DateString;
    end: DateString;
  };
  /** Data statistics */
  statistics?: PADatasetStatistics;
  /** Storage path */
  storagePath?: string;
  /** File size in bytes */
  fileSizeBytes?: number;
  /** Processing started */
  processingStartedAt?: TimestampString;
  /** Processing completed */
  processingCompletedAt?: TimestampString;
  /** Error message */
  errorMessage?: string;
  /** Created by user ID */
  createdBy: UUID;
  /** Expires at */
  expiresAt?: TimestampString;
}

/**
 * Dataset statistics.
 */
export interface PADatasetStatistics {
  /** Column statistics */
  columns: Record<
    string,
    {
      type: PAFeatureType;
      count: number;
      nullCount: number;
      uniqueCount?: number;
      mean?: number;
      std?: number;
      min?: number;
      max?: number;
      median?: number;
      mode?: string | number;
      distribution?: Record<string, number>;
    }
  >;
  /** Correlations */
  correlations?: Record<string, Record<string, number>>;
  /** Target distribution */
  targetDistribution?: Record<string, number>;
}

/**
 * Dataset version for tracking changes.
 */
export interface PADatasetVersion extends TenantScopedEntity {
  /** Dataset ID */
  datasetId: UUID;
  /** Version number */
  version: number;
  /** Row count */
  rowCount: number;
  /** Created timestamp */
  createdAt: TimestampString;
  /** Storage path */
  storagePath: string;
  /** Checksum */
  checksum: string;
  /** Notes */
  notes?: string;
}

// =============================================================================
// Refresh Job Types
// =============================================================================

/** Job status */
export type PARefreshJobStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

/** Job type */
export type PARefreshJobType =
  | "dataset_refresh"
  | "model_training"
  | "model_prediction"
  | "feature_computation"
  | "insight_generation";

/**
 * Analytics refresh job.
 */
export interface PARefreshJob extends TenantScopedEntity {
  /** Job type */
  type: PARefreshJobType;
  /** Job status */
  status: PARefreshJobStatus;
  /** Related model ID */
  modelId?: UUID;
  /** Related dataset ID */
  datasetId?: UUID;
  /** Job configuration */
  config?: Record<string, unknown>;
  /** Progress percentage */
  progressPercent: number;
  /** Progress message */
  progressMessage?: string;
  /** Started timestamp */
  startedAt?: TimestampString;
  /** Completed timestamp */
  completedAt?: TimestampString;
  /** Duration in seconds */
  durationSeconds?: number;
  /** Error message */
  errorMessage?: string;
  /** Error details */
  errorDetails?: Record<string, unknown>;
  /** Output/results */
  output?: Record<string, unknown>;
  /** Triggered by */
  triggeredBy: "schedule" | "manual" | "system";
  /** Triggered by user ID */
  triggeredByUserId?: UUID;
  /** Retry count */
  retryCount: number;
  /** Max retries */
  maxRetries: number;
  /** Priority */
  priority: "low" | "normal" | "high";
}

// =============================================================================
// Insight Types
// =============================================================================

/** Insight category */
export type PAInsightCategory =
  | "trend"
  | "anomaly"
  | "correlation"
  | "prediction"
  | "recommendation"
  | "alert";

/** Insight severity */
export type PAInsightSeverity = "info" | "warning" | "critical";

/**
 * Analytics insight/recommendation.
 */
export interface PAInsight extends TenantScopedEntity {
  /** Model ID (if model-generated) */
  modelId?: UUID;
  /** Insight category */
  category: PAInsightCategory;
  /** Severity */
  severity: PAInsightSeverity;
  /** Title */
  title: string;
  /** Description */
  description: string;
  /** Detailed explanation */
  explanation?: string;
  /** Affected entities */
  affectedEntities?: Array<{
    type: string;
    id: UUID;
    name?: string;
  }>;
  /** Metric/KPI affected */
  metricCode?: string;
  /** Current value */
  currentValue?: number;
  /** Expected/baseline value */
  expectedValue?: number;
  /** Change percentage */
  changePercent?: number;
  /** Confidence score */
  confidence?: number;
  /** Recommendations */
  recommendations?: string[];
  /** Supporting data */
  supportingData?: Record<string, unknown>;
  /** Visualization configuration */
  visualizationConfig?: Record<string, unknown>;
  /** Time period */
  timePeriod?: {
    start: DateString;
    end: DateString;
  };
  /** Is actionable */
  isActionable: boolean;
  /** Action URL */
  actionUrl?: string;
  /** Dismissed */
  isDismissed: boolean;
  /** Dismissed by user ID */
  dismissedBy?: UUID;
  /** Dismissed timestamp */
  dismissedAt?: TimestampString;
  /** Expires at */
  expiresAt?: TimestampString;
  /** Tags */
  tags?: string[];
}

// =============================================================================
// Cohort Analysis Types
// =============================================================================

/** Cohort type */
export type CohortType =
  | "hire_date"
  | "department"
  | "job_level"
  | "location"
  | "tenure_band"
  | "performance_rating"
  | "age_band"
  | "custom";

/**
 * Cohort query parameters.
 */
export interface CohortQueryParams {
  /** Cohort type */
  cohortType: CohortType;
  /** Custom cohort field (if custom) */
  customCohortField?: string;
  /** Analysis metric */
  metric: string;
  /** Time granularity */
  timeGranularity: "month" | "quarter" | "year";
  /** Start date */
  startDate: DateString;
  /** End date */
  endDate: DateString;
  /** Cohort values to include */
  cohortValues?: string[];
  /** Additional filters */
  filters?: Array<{
    field: string;
    operator: string;
    value: unknown;
  }>;
  /** Aggregation function */
  aggregation: "count" | "sum" | "avg" | "median" | "retention_rate";
  /** Include trends */
  includeTrends: boolean;
  /** Include benchmarks */
  includeBenchmarks: boolean;
}

/**
 * Cohort query result.
 */
export interface CohortQueryResult {
  /** Query parameters used */
  params: CohortQueryParams;
  /** Cohort data */
  cohorts: Array<{
    /** Cohort identifier */
    cohortValue: string;
    /** Cohort label */
    cohortLabel: string;
    /** Member count */
    memberCount: number;
    /** Time series data */
    timeSeries: Array<{
      period: string;
      value: number;
      count?: number;
    }>;
    /** Summary statistics */
    summary: {
      current: number;
      previous?: number;
      change?: number;
      changePercent?: number;
      trend?: "up" | "down" | "stable";
    };
  }>;
  /** Benchmark data */
  benchmarks?: {
    industry?: number;
    overall?: number;
  };
  /** Generated timestamp */
  generatedAt: TimestampString;
  /** Cache key */
  cacheKey?: string;
}

// =============================================================================
// Prediction Types
// =============================================================================

/**
 * Individual prediction result.
 */
export interface PAPrediction extends TenantScopedEntity {
  /** Model ID */
  modelId: UUID;
  /** Model version */
  modelVersion: number;
  /** Entity type */
  entityType: string;
  /** Entity ID */
  entityId: UUID;
  /** Prediction value */
  prediction: unknown;
  /** Probability (for classification) */
  probability?: number;
  /** Confidence score */
  confidence?: number;
  /** Risk level */
  riskLevel?: "low" | "medium" | "high" | "critical";
  /** Feature values used */
  featureValues?: Record<string, unknown>;
  /** Feature contributions (SHAP values) */
  featureContributions?: Record<string, number>;
  /** Top contributing features */
  topFeatures?: Array<{
    feature: string;
    value: unknown;
    contribution: number;
  }>;
  /** Explanation text */
  explanation?: string;
  /** Recommended actions */
  recommendedActions?: string[];
  /** Predicted timestamp */
  predictedAt: TimestampString;
  /** Valid until */
  validUntil?: TimestampString;
  /** Actual outcome (for tracking) */
  actualOutcome?: unknown;
  /** Outcome recorded timestamp */
  outcomeRecordedAt?: TimestampString;
}
