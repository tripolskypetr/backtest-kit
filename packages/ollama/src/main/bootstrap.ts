/**
 * Bootstrap module for agent-swarm-kit validation.
 *
 * Validates that all completion and outline names are properly registered
 * with agent-swarm-kit before the application starts. This ensures that
 * all referenced completions and outlines exist and are correctly configured.
 *
 * Validation checks:
 * - All CompletionName enum values have corresponding registered handlers
 * - All OutlineName enum values have corresponding registered schemas
 * - No duplicate registrations exist
 *
 * This file is imported by index.ts to run validation at startup.
 *
 * @throws Error if validation fails (missing or duplicate registrations)
 */

import { validate } from "agent-swarm-kit";
import CompletionName from "../enum/CompletionName";
import OutlineName from "../enum/OutlineName";

validate({
    CompletionName,
    OutlineName,
})
