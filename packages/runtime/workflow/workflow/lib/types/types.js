"use strict";
/**
 * Workflow seam vocabulary: the request/run/result types a workflow engine
 * consumes and produces, plus the fields in the `workflow/*` event payloads.
 * Types only (plus the id-brand factory), per the package convention.
 *
 * @module @z/dsh-workflow/types
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.WorkflowRunId = WorkflowRunId;
/**
 * Brand a string as a {@link WorkflowRunId}.
 * @param id - the raw id string (the engine mints UUIDs; tests may pass fixtures).
 * @returns the same string, branded.
 */
function WorkflowRunId(id) {
    return id;
}
