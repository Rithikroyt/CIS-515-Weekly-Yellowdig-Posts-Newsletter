// Plain vocabulary arrays shared by the Zod contracts and the n8n bundles. No Zod here, so bundles that
// need only the vocabulary (e.g. the workflow profiler) stay small.
/** Presentation roles for issue chips (Phase 1 vocabulary). */
export const CATEGORIES = ["trigger", "ai", "judge", "code", "validator", "gate", "approval", "action", "storage", "tool", "errorPath", "other"] as const;
export const ASSET_KINDS = ["n8n_workflow_json", "workflow_screenshot"] as const;
export const ASSET_STATUSES = ["PROFILED", "VALIDATED", "REJECTED", "DUPLICATE", "UNMATCHED_ASSET"] as const;
export const ASSET_REASONS = [
  "INVALID_ASSET_METADATA", "UNSUPPORTED_FILE_TYPE", "MIME_MISMATCH", "CONTENT_MISMATCH", "EMPTY_FILE",
  "WORKFLOW_TOO_LARGE", "IMAGE_TOO_LARGE", "TOO_MANY_FILES_FOR_POST", "BATCH_LIMIT_EXCEEDED",
  "INVALID_JSON", "JSON_TOO_DEEP", "NOT_N8N_WORKFLOW", "TOO_MANY_NODES", "TOO_MANY_EDGES",
  "UNSUPPORTED_STRUCTURE", "SECRET_POLICY_FAILURE", "DUPLICATE_CONTENT", "NO_POST_REFERENCE", "UNKNOWN_POST_REFERENCE",
] as const;
export const NODE_CATEGORIES = [
  "trigger", "ai_model", "ai_agent", "ai_component", "code", "validation", "human_review", "email", "messaging",
  "http_api", "database", "data_store", "file", "spreadsheet", "calendar", "search_rss", "control_flow", "transform",
  "merge", "wait", "error_handling", "other",
] as const;
export const CAPABILITY_KEYS = [
  "usesAI", "usesMultipleAgents", "usesCode", "usesHumanApproval", "usesExternalAPI", "usesEmail", "usesDataStore",
  "usesRetry", "hasBoundedRetry", "hasExplicitFailureHandling", "hasValidationGate", "hasCodeValidation",
  "usesLLMJudge", "hasFallback", "usesRAG", "usesMemory",
] as const;
