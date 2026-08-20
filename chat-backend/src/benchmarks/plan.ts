import type { BenchmarkProfile, MessageKey, PlannedMessage } from './types.js';
export type { BenchmarkProfile, MessageKey, PlannedMessage } from './types.js';
const KEY_PREFIX = 'bmk';
export const makeMessageKey = (parts: MessageKey): string =>
    `${KEY_PREFIX}:${parts.runIndex}:${parts.profileName}:${parts.clientIndex}:${parts.seq}`;
/**
 * Parses a benchmark message key out of message content. Returns null for any
 * content that does not have exactly the benchmark key format, so unexpected
 * production messages are never mistaken for benchmark messages.
 */
export const parseMessageKey = (content: string): MessageKey | null => {
    const parts = content.split(':');
    if (parts.length !== 5 || parts[0] !== KEY_PREFIX) return null;
    const runIndex = Number(parts[1]);
    const clientIndex = Number(parts[3]);
    const seq = Number(parts[4]);
    if (parts[2] === '') return null;
    if (
        !Number.isInteger(runIndex) ||
        runIndex < 0 ||
        !Number.isInteger(clientIndex) ||
        clientIndex < 0 ||
        !Number.isInteger(seq) ||
        seq < 0
    ) {
        return null;
    }
    return { runIndex, profileName: parts[2] as string, clientIndex, seq };
};
/**
 * Builds the deterministic message plan for a profile:
 * - ring topology: sender i sends to recipient (i + 1) % clients
 * - messages are divided between clients deterministically: the first
 *   `messages % clients` clients get one extra message, every client sends
 *   its own sequence serially (client-major, seq-minor ordering)
 * - every message content is exactly its unique benchmark key
 */
export const buildPlan = (
    profile: BenchmarkProfile,
    runIndex: number,
    userIds: readonly string[],
): PlannedMessage[] => {
    if (profile.clients < 2) {
        throw new Error(`profile "${profile.name}" needs at least 2 clients`);
    }
    if (userIds.length !== profile.clients) {
        throw new Error(
            `profile "${profile.name}" expects ${profile.clients} users, got ${userIds.length}`,
        );
    }
    const base = Math.floor(profile.messages / profile.clients);
    const remainder = profile.messages % profile.clients;
    const plan: PlannedMessage[] = [];
    for (let clientIndex = 0; clientIndex < profile.clients; clientIndex++) {
        const count = base + (clientIndex < remainder ? 1 : 0);
        const senderUserId = userIds[clientIndex] as string;
        const recipientUserId = userIds[(clientIndex + 1) % profile.clients] as string;
        for (let seq = 0; seq < count; seq++) {
            const key = makeMessageKey({ runIndex, profileName: profile.name, clientIndex, seq });
            plan.push({
                key,
                content: key,
                clientIndex,
                seq,
                senderUserId,
                recipientUserId,
            });
        }
    }
    return plan;
};
/** Groups the plan by client index, preserving each client's serial order. */
export const groupPlanByClient = (plan: readonly PlannedMessage[]): Map<number, PlannedMessage[]> => {
    const byClient = new Map<number, PlannedMessage[]>();
    for (const message of plan) {
        const list = byClient.get(message.clientIndex);
        if (list) {
            list.push(message);
        } else {
            byClient.set(message.clientIndex, [message]);
        }
    }
    return byClient;
};
