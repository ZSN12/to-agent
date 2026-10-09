/**
 * Pure translation between the harness lifecycle and the automation-only ACP wire.
 * @module @z/dsh-acp/codec
 */
import type { StopReason } from '@agentclientprotocol/sdk';
import type { TurnEndReason } from '@z/dsh-session';
/**
 * Map a harness turn ending to ACP's terminal reason vocabulary.
 * @param reason - harness turn outcome.
 * @returns the closest legal ACP stop reason.
 */
export declare function turnEndToStopReason(reason: TurnEndReason): StopReason;
//# sourceMappingURL=codec.d.ts.map