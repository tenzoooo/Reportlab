/**
 * Centralized feature flags for experimental flows.
 * Set via environment variables to toggle behavior without code changes.
 */
export const ENABLE_IMAGE_GROUPING_WITH_METHOD_CONTEXT =
  process.env.ENABLE_IMAGE_GROUPING_WITH_METHOD_CONTEXT === "true"

