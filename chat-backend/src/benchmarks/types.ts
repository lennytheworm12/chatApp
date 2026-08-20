/**
 * Shared types for the deterministic real-time scale benchmark.
 *
 * These types describe the benchmark's own bookkeeping only; nothing here
 * touches the production message schema or message handling path.
 */
export interface BenchmarkProfile {
    /** Stable display name, also embedded in every benchmark message key. */
    name: string;
    /** Number of seeded users / connected socket clients. */
    clients: number;
    /** Total number of message sends for this profile. */
    messages: number;
}
export interface MessageKey {
    runIndex: number;
    profileName: string;
    clientIndex: number;
    seq: number;
}
export interface PlannedMessage {
    key: string;
    content: string;
    clientIndex: number;
    seq: number;
    senderUserId: string;
    recipientUserId: string;
}
export type AckOutcome =
    | {
          kind: 'success';
          messageId: string;
          content: string;
          senderId: string;
          recipientId: string;
      }
    | { kind: 'error'; error: string }
    | { kind: 'timeout' };
export interface AckEvent {
    key: string;
    outcome: AckOutcome;
    at: number;
}
/**
 * Result of a server-side ack invocation as observed by the benchmark's
 * Socket.IO incoming-event instrumentation. `kind: 'success'` carries the
 * exact message metadata the server acked; `kind: 'error'` carries the exact
 * error string. Unknown/unrecognized payloads are normalized to an error so
 * the invariant evaluator fails closed.
 */
export interface ServerAckResult {
    kind: 'success' | 'error';
    messageId?: string | null;
    content?: string | null;
    senderId?: string | null;
    recipientId?: string | null;
    error?: string;
}
export interface ServerAckObservation {
    /** Exact raw payload content the server-side sendMessage handler saw. */
    key: string;
    /** Verified socket identity that invoked the send. */
    socketUserId: string;
    result: ServerAckResult;
    at: number;
}
export interface DeliveryObservation {
    /** Exact raw content received by the client socket. */
    key: string;
    userId: string;
    messageId: string | null;
    senderId: string | null;
    recipientId: string | null;
    at: number;
}
export interface PersistedMessage {
    key: string;
    content: string;
    senderId: string;
    recipientId: string;
    messageId: string;
}
