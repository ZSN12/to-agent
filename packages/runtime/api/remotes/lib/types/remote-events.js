"use strict";
/**
 * The one home of this application's forwarded-Host-event allowlist. Both
 * compiler faces list this file, so the Host forwarding loop and the consumer
 * `ctx.remote.$on` key face read one declaration instead of two copies that
 * could drift; `./types.ts` derives the type projection from it and stays
 * type-only.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.API_REMOTE_FORWARDED_EVENTS = void 0;
exports.API_REMOTE_FORWARDED_EVENTS = [
    'authorization/settled',
    'taskweaver/authorization-notice',
    'taskweaver/authorization-prompt',
    'agent-preset/selected',
    'commands/change',
    'credentials/reference-updated',
    'cordis/request-run',
    'cordis/request-run-resolved',
    'cordis/dynamic-package',
    'cordis/dynamic-retract',
    'cordis/inspect-query',
    'cordis/inspect-query-resolved',
    'llm/adapters-updated',
    'settings/document-updated',
];
