import type { ServerAckResult } from './types.js';

interface MessageLike {
    id?: unknown;
    content?: unknown;
    sender?: { id?: unknown; _id?: unknown } | null;
    recipient?: { id?: unknown; _id?: unknown } | null;
}

const asStringOrNull = (value: unknown): string | null =>
    typeof value === 'string' ? value : null;

const asIdString = (value: unknown): string | null => {
    if (typeof value === 'string') return value;
    if (value === null || value === undefined) return null;
    // Server-side ack observations happen before Socket.IO serializes the
    // payload, so ids can still be mongoose ObjectIds rather than strings.
    return String(value);
};

const refId = (ref: { id?: unknown; _id?: unknown } | null | undefined): string | null => {
    if (ref === null || ref === undefined) return null;
    return asIdString(ref.id) ?? asIdString(ref._id);
};

/**
 * Exact key for a sendMessage payload as observed by server-side
 * instrumentation. The key is the raw payload content when it is a string;
 * anything else produces an explicitly invalid sentinel so the invariant
 * evaluator treats it as an unknown key and fails closed.
 */
export const serverAckKey = (payload: unknown): string => {
    if (payload !== null && typeof payload === 'object' && 'content' in payload) {
        const content = (payload as { content?: unknown }).content;
        if (typeof content === 'string') return content;
        return `invalid-content:${String(content)}`;
    }
    return 'invalid-payload';
};

/**
 * Normalizes whatever the production sendMessage handler passed to the ack
 * callback into the benchmark's observable result shape. Success carries the
 * exact message id/content/sender/recipient metadata; anything else becomes an
 * error so mismatches and malformed responses fail closed.
 */
export const toServerAckResult = (value: unknown): ServerAckResult => {
    if (value === null || typeof value !== 'object') {
        return { kind: 'error', error: `unrecognized ack payload: ${String(value)}` };
    }
    const record = value as Record<string, unknown>;
    if (typeof record.error === 'string') {
        return { kind: 'error', error: record.error };
    }
    const message = record.message;
    if (message !== null && typeof message === 'object') {
        const msg = message as MessageLike;
        const messageId = asIdString(msg.id);
        return {
            kind: 'success',
            messageId,
            content: asStringOrNull(msg.content),
            senderId: refId(msg.sender),
            recipientId: refId(msg.recipient),
        };
    }
    return { kind: 'error', error: 'unrecognized ack payload: missing message or error' };
};
