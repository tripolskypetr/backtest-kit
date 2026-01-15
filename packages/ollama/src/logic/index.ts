/**
 * Logic layer initialization module.
 *
 * Imports and registers all completion handlers and outline schemas.
 * This module ensures that agent-swarm-kit is aware of all available
 * completion types and outline schemas for structured AI operations.
 *
 * Registered components:
 * - Completion handlers: runner, runner_stream, runner_outline
 * - Outline schemas: signal
 *
 * Import order matters: completions must be registered before outlines
 * that depend on them.
 */

import "./completion/runner_outline.completion";
import "./completion/runner_stream.completion";
import "./completion/runner.completion";

import "./outline/signal.outline";
