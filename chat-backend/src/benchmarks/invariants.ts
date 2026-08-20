import type {
    AckEvent,
    DeliveryObservation,
    PersistedMessage,
    PlannedMessage,
    ServerAckObservation,
} from './types.js';

export interface InvariantViolation {
    code: string;
    message: string;
    key?: string;
}

export interface DeliveryIssue {
    key: string;
    userId: string;
    count?: number;
}

export interface InvariantInput {
    plan: readonly PlannedMessage[];
    /** Exact keys of every actual sendOne/emit attempt, in call order. */
    attemptedKeys: readonly string[];
    /** Client-side ack observations (what the sender socket observed). */
    clientAckEvents: readonly AckEvent[];
    /** Server-side ack invocations observed by benchmark instrumentation. */
    serverAckObservations: readonly ServerAckObservation[];
    deliveries: readonly DeliveryObservation[];
    persisted: readonly PersistedMessage[];
    profileMessages: number;
}

export interface InvariantDiagnostics {
    attempted: number;
    successfulSends: number;
    ackErrors: number;
    ackTimeouts: number;
    ackEventsTotal: number;
    unexpectedAckKeys: number;
    ackMetadataMismatches: string[];
    ackMessageIdMismatches: string[];
    serverAckInvocations: number;
    duplicateServerAckKeys: string[];
    serverAckErrors: number;
    unexpectedServerAckKeys: number;
    serverAckMetadataMismatches: string[];
    serverClientAckMismatches: string[];
    persisted: number;
    duplicatePersistedKeys: string[];
    persistedWithoutSuccessfulAck: string[];
    persistedMismatches: string[];
    expectedDeliveries: number;
    observedDeliveries: number;
    droppedDeliveries: DeliveryIssue[];
    duplicateDeliveries: DeliveryIssue[];
    misdeliveries: DeliveryIssue[];
    unexpectedDeliveries: DeliveryIssue[];
    deliveriesWithoutSuccessfulAck: DeliveryIssue[];
    deliveryMetadataMismatches: DeliveryIssue[];
    deliveryMessageIdMismatches: DeliveryIssue[];
}

export interface InvariantEvaluation {
    pass: boolean;
    violations: InvariantViolation[];
    diagnostics: InvariantDiagnostics;
}

const pairId = (key: string, userId: string): string => `${key}\u0000${userId}`;

/**
 * Fail-closed invariant evaluator. Every invariant violation is surfaced as a
 * distinct diagnostic so a failed run explains exactly what went wrong.
 */
export const evaluateInvariants = (input: InvariantInput): InvariantEvaluation => {
    const violations: InvariantViolation[] = [];
    const planByKey = new Map<string, PlannedMessage>();
    for (const message of input.plan) {
        planByKey.set(message.key, message);
    }

    const attemptCounts = new Map<string, number>();
    for (const key of input.attemptedKeys) {
        attemptCounts.set(key, (attemptCounts.get(key) ?? 0) + 1);
    }

    const clientAcksByKey = new Map<string, AckEvent[]>();
    for (const event of input.clientAckEvents) {
        const events = clientAcksByKey.get(event.key);
        if (events) {
            events.push(event);
        } else {
            clientAcksByKey.set(event.key, [event]);
        }
    }
    const serverAcksByKey = new Map<string, ServerAckObservation[]>();
    for (const observation of input.serverAckObservations) {
        const observations = serverAcksByKey.get(observation.key);
        if (observations) {
            observations.push(observation);
        } else {
            serverAcksByKey.set(observation.key, [observation]);
        }
    }

    const diagnostics: InvariantDiagnostics = {
        attempted: input.attemptedKeys.length,
        successfulSends: 0,
        ackErrors: 0,
        ackTimeouts: 0,
        ackEventsTotal: input.clientAckEvents.length,
        unexpectedAckKeys: 0,
        ackMetadataMismatches: [],
        ackMessageIdMismatches: [],
        serverAckInvocations: input.serverAckObservations.length,
        duplicateServerAckKeys: [],
        serverAckErrors: 0,
        unexpectedServerAckKeys: 0,
        serverAckMetadataMismatches: [],
        serverClientAckMismatches: [],
        persisted: input.persisted.length,
        duplicatePersistedKeys: [],
        persistedWithoutSuccessfulAck: [],
        persistedMismatches: [],
        expectedDeliveries: 0,
        observedDeliveries: 0,
        droppedDeliveries: [],
        duplicateDeliveries: [],
        misdeliveries: [],
        unexpectedDeliveries: [],
        deliveriesWithoutSuccessfulAck: [],
        deliveryMetadataMismatches: [],
        deliveryMessageIdMismatches: [],
    };

    // ---- Attempted-send accounting ---------------------------------------
    // The reported attempted count reflects actual sendOne/emit calls, so it
    // must equal the fixed profile count and exactly cover the plan keys.
    if (input.attemptedKeys.length !== input.profileMessages) {
        violations.push({
            code: 'attempted-count',
            message: `attempted ${input.attemptedKeys.length} sends, expected ${input.profileMessages}`,
        });
    }
    if (input.attemptedKeys.length !== input.plan.length) {
        violations.push({
            code: 'attempted-vs-plan',
            message: `attempted ${input.attemptedKeys.length} sends for ${input.plan.length} planned messages`,
        });
    }
    for (const message of input.plan) {
        if (!attemptCounts.has(message.key)) {
            violations.push({
                code: 'missing-attempt',
                key: message.key,
                message: 'planned message was never attempted',
            });
        }
    }
    for (const [key, count] of attemptCounts) {
        if (count > 1) {
            violations.push({
                code: 'duplicate-attempt',
                key,
                message: `key attempted ${count} times`,
            });
        }
        if (!planByKey.has(key)) {
            violations.push({
                code: 'unexpected-attempt',
                key,
                message: 'send attempted for a key outside the plan',
            });
        }
    }

    // ---- Per-attempted-key ack observation counts ------------------------
    for (const key of attemptCounts.keys()) {
        const planned = planByKey.get(key);
        if (!planned) continue;
        const clientEvents = clientAcksByKey.get(key) ?? [];
        if (clientEvents.length === 0) {
            violations.push({
                code: 'missing-ack',
                key,
                message: 'no client ack event recorded for an attempted send',
            });
        } else if (clientEvents.length > 1) {
            violations.push({
                code: 'duplicate-ack',
                key,
                message: `${clientEvents.length} client ack events, expected exactly 1`,
            });
        }
        const serverObservations = serverAcksByKey.get(key) ?? [];
        if (serverObservations.length === 0) {
            violations.push({
                code: 'missing-server-ack',
                key,
                message: 'server never invoked the sendMessage acknowledgement',
            });
        } else if (serverObservations.length > 1) {
            diagnostics.duplicateServerAckKeys.push(key);
            violations.push({
                code: 'duplicate-server-ack',
                key,
                message: `${serverObservations.length} server ack invocations, expected exactly 1`,
            });
        }
    }

    for (const key of clientAcksByKey.keys()) {
        if (attemptCounts.has(key)) continue;
        if (!planByKey.has(key)) {
            diagnostics.unexpectedAckKeys += 1;
            violations.push({
                code: 'unexpected-ack',
                key,
                message: 'client ack for a key outside the plan',
            });
        } else {
            violations.push({
                code: 'ack-without-attempt',
                key,
                message: 'client ack observed for a planned message that was never attempted',
            });
        }
    }
    for (const key of serverAcksByKey.keys()) {
        if (attemptCounts.has(key)) continue;
        if (!planByKey.has(key)) {
            diagnostics.unexpectedServerAckKeys += 1;
            violations.push({
                code: 'unexpected-server-ack',
                key,
                message: 'server ack invocation for a key outside the plan',
            });
        } else {
            violations.push({
                code: 'server-ack-without-attempt',
                key,
                message: 'server ack observed for a planned message that was never attempted',
            });
        }
    }

    // ---- Ack outcome semantics and result consistency --------------------
    for (const key of attemptCounts.keys()) {
        const planned = planByKey.get(key);
        if (!planned) continue;
        const clientEvent = clientAcksByKey.get(key)?.[0];
        const serverObservation = serverAcksByKey.get(key)?.[0];

        if (clientEvent) {
            const outcome = clientEvent.outcome;
            if (outcome.kind === 'success') {
                diagnostics.successfulSends += 1;
                if (
                    outcome.content !== planned.content ||
                    outcome.senderId !== planned.senderUserId ||
                    outcome.recipientId !== planned.recipientUserId ||
                    outcome.messageId === ''
                ) {
                    diagnostics.ackMetadataMismatches.push(key);
                    violations.push({
                        code: 'ack-metadata-mismatch',
                        key,
                        message:
                            `client ack id=${outcome.messageId} content=${outcome.content} ` +
                            `sender=${outcome.senderId} recipient=${outcome.recipientId} does not match plan`,
                    });
                }
            } else if (outcome.kind === 'error') {
                diagnostics.ackErrors += 1;
                violations.push({
                    code: 'ack-error',
                    key,
                    message: `error ack: ${outcome.error}`,
                });
            } else {
                diagnostics.ackTimeouts += 1;
                violations.push({ code: 'ack-timeout', key, message: 'client ack timed out' });
            }
        }

        if (serverObservation) {
            const result = serverObservation.result;
            if (result.kind === 'success') {
                if (
                    serverObservation.socketUserId !== planned.senderUserId ||
                    result.content !== planned.content ||
                    result.senderId !== planned.senderUserId ||
                    result.recipientId !== planned.recipientUserId ||
                    !result.messageId
                ) {
                    diagnostics.serverAckMetadataMismatches.push(key);
                    violations.push({
                        code: 'server-ack-metadata-mismatch',
                        key,
                        message:
                            `server socket=${serverObservation.socketUserId} ack id=${result.messageId ?? 'null'} ` +
                            `content=${result.content ?? 'null'} ` +
                            `sender=${result.senderId ?? 'null'} recipient=${result.recipientId ?? 'null'} does not match plan`,
                    });
                }
            } else {
                diagnostics.serverAckErrors += 1;
                violations.push({
                    code: 'server-ack-error',
                    key,
                    message: `server invoked the ack with error: ${result.error ?? 'unknown error'}`,
                });
            }
        }

        if (clientEvent && serverObservation) {
            const outcome = clientEvent.outcome;
            const result = serverObservation.result;
            let inconsistent = false;
            let detail = '';
            if (outcome.kind === 'success' && result.kind !== 'success') {
                inconsistent = true;
                detail = `client observed success but server ${result.kind === 'error' ? `acked error: ${result.error ?? ''}` : 'did not ack success'}`;
            } else if (outcome.kind === 'error' && result.kind !== 'error') {
                inconsistent = true;
                detail = `client observed error but server acked ${result.kind}`;
            } else if (outcome.kind === 'timeout' && result.kind === 'success') {
                inconsistent = true;
                detail = 'client timed out despite a successful server ack invocation';
            } else if (outcome.kind === 'success' && result.kind === 'success') {
                if (
                    outcome.messageId !== result.messageId ||
                    outcome.content !== result.content ||
                    outcome.senderId !== result.senderId ||
                    outcome.recipientId !== result.recipientId
                ) {
                    inconsistent = true;
                    detail = 'client and server ack metadata disagree';
                }
            }
            if (inconsistent) {
                diagnostics.serverClientAckMismatches.push(key);
                violations.push({
                    code: 'server-client-ack-mismatch',
                    key,
                    message: detail,
                });
            }
        }
    }

    const successfulKeys = new Set<string>();
    for (const [key, events] of clientAcksByKey) {
        if (attemptCounts.has(key) && events[0]?.outcome.kind === 'success') {
            successfulKeys.add(key);
        }
    }

    // ---- Persistence: exactly one matching document per successful send ----
    const persistedByKey = new Map<string, PersistedMessage[]>();
    for (const doc of input.persisted) {
        const docs = persistedByKey.get(doc.key);
        if (docs) {
            docs.push(doc);
        } else {
            persistedByKey.set(doc.key, [doc]);
        }
    }
    for (const [key, docs] of persistedByKey) {
        const expected = planByKey.get(key);
        if (!expected) {
            violations.push({
                code: 'unexpected-persisted-key',
                key,
                message: 'persisted message key is not in the plan',
            });
            continue;
        }
        if (!attemptCounts.has(key)) {
            violations.push({
                code: 'persisted-without-attempt',
                key,
                message: 'document persisted for a message that was never attempted',
            });
        }
        if (docs.length > 1) {
            diagnostics.duplicatePersistedKeys.push(key);
            violations.push({
                code: 'duplicate-persistence',
                key,
                message: `${docs.length} documents persisted for one key`,
            });
        }
        for (const doc of docs) {
            if (
                doc.senderId !== expected.senderUserId ||
                doc.recipientId !== expected.recipientUserId ||
                doc.content !== expected.content ||
                doc.key !== expected.key ||
                doc.messageId === ''
            ) {
                diagnostics.persistedMismatches.push(key);
                violations.push({
                    code: 'persistence-mismatch',
                    key,
                    message:
                        `sender=${doc.senderId} recipient=${doc.recipientId} ` +
                        `content=${doc.content} id=${doc.messageId} does not match plan`,
                });
            }
        }
        if (!successfulKeys.has(key)) {
            diagnostics.persistedWithoutSuccessfulAck.push(key);
            violations.push({
                code: 'persisted-without-successful-ack',
                key,
                message: 'document persisted for a send without a successful client ack',
            });
        }
    }
    for (const key of successfulKeys) {
        const docs = persistedByKey.get(key) ?? [];
        if (docs.length === 0) {
            violations.push({
                code: 'missing-persistence',
                key,
                message: 'no document persisted for a successful send',
            });
        } else if (docs.length === 1) {
            const doc = docs[0] as PersistedMessage;
            const clientEvent = clientAcksByKey.get(key)?.[0];
            const serverObservation = serverAcksByKey.get(key)?.[0];
            const parts: string[] = [];
            if (clientEvent?.outcome.kind === 'success' && doc.messageId !== clientEvent.outcome.messageId) {
                parts.push(`client ack id ${clientEvent.outcome.messageId} != persisted id ${doc.messageId}`);
            }
            if (serverObservation?.result.kind === 'success' && doc.messageId !== serverObservation.result.messageId) {
                parts.push(`server ack id ${serverObservation.result.messageId} != persisted id ${doc.messageId}`);
            }
            if (parts.length > 0) {
                diagnostics.ackMessageIdMismatches.push(key);
                violations.push({ code: 'ack-message-id-mismatch', key, message: parts.join('; ') });
            }
        }
    }
    if (input.persisted.length !== input.plan.length) {
        violations.push({
            code: 'persisted-total',
            message: `persisted ${input.persisted.length} documents, expected ${input.plan.length}`,
        });
    }

    // ---- Deliveries: exact metadata, no drops/dups/misdeliveries/unknowns ---
    const expectedPairs = new Set<string>();
    for (const key of successfulKeys) {
        const message = planByKey.get(key);
        if (!message) continue;
        expectedPairs.add(pairId(key, message.senderUserId));
        expectedPairs.add(pairId(key, message.recipientUserId));
    }
    diagnostics.expectedDeliveries = expectedPairs.size;

    const deliveriesByPair = new Map<string, DeliveryObservation[]>();
    for (const delivery of input.deliveries) {
        const id = pairId(delivery.key, delivery.userId);
        const list = deliveriesByPair.get(id);
        if (list) {
            list.push(delivery);
        } else {
            deliveriesByPair.set(id, [delivery]);
        }
    }
    for (const [id, observations] of deliveriesByPair) {
        const [key, userId] = id.split('\u0000') as [string, string];
        const planned = planByKey.get(key);
        diagnostics.observedDeliveries += observations.length;
        if (!planned) {
            diagnostics.unexpectedDeliveries.push({ key, userId });
            continue;
        }
        if (!attemptCounts.has(key)) {
            violations.push({
                code: 'delivery-without-attempt',
                key,
                message: `socket ${userId} received a message that was never attempted`,
            });
            continue;
        }
        if (expectedPairs.has(id)) {
            if (observations.length > 1) {
                diagnostics.duplicateDeliveries.push({ key, userId, count: observations.length });
            }
            for (const observation of observations) {
                if (
                    observation.key !== planned.content ||
                    observation.senderId !== planned.senderUserId ||
                    observation.recipientId !== planned.recipientUserId ||
                    !observation.messageId
                ) {
                    diagnostics.deliveryMetadataMismatches.push({ key, userId });
                    violations.push({
                        code: 'delivery-metadata-mismatch',
                        key,
                        message:
                            `socket ${userId} received content=${observation.key} ` +
                            `sender=${observation.senderId} recipient=${observation.recipientId} ` +
                            `id=${observation.messageId} not matching plan`,
                    });
                }
                const docs = persistedByKey.get(key) ?? [];
                const doc = docs.length === 1 ? (docs[0] as PersistedMessage) : null;
                if (doc && observation.messageId !== doc.messageId) {
                    diagnostics.deliveryMessageIdMismatches.push({ key, userId });
                    violations.push({
                        code: 'delivery-message-id-mismatch',
                        key,
                        message: `socket ${userId} received message id ${observation.messageId}, expected persisted id ${doc.messageId}`,
                    });
                }
            }
            continue;
        }
        if (userId === planned.senderUserId || userId === planned.recipientUserId) {
            diagnostics.deliveriesWithoutSuccessfulAck.push({ key, userId });
        } else {
            diagnostics.misdeliveries.push({ key, userId });
        }
    }

    for (const id of expectedPairs) {
        const [key, userId] = id.split('\u0000') as [string, string];
        const count = deliveriesByPair.get(id)?.length ?? 0;
        if (count === 0) {
            diagnostics.droppedDeliveries.push({ key, userId });
        }
    }
    for (const issue of diagnostics.droppedDeliveries) {
        violations.push({
            code: 'dropped-delivery',
            key: issue.key,
            message: `expected delivery to socket ${issue.userId} was never observed`,
        });
    }
    for (const issue of diagnostics.duplicateDeliveries) {
        violations.push({
            code: 'duplicate-delivery',
            key: issue.key,
            message: `socket ${issue.userId} received this message ${issue.count as number} times`,
        });
    }
    for (const issue of diagnostics.misdeliveries) {
        violations.push({
            code: 'misdelivery',
            key: issue.key,
            message: `message delivered to unexpected socket ${issue.userId}`,
        });
    }
    for (const issue of diagnostics.unexpectedDeliveries) {
        violations.push({
            code: 'unexpected-delivery',
            key: issue.key,
            message: `delivery observed for a message key outside the plan on socket ${issue.userId}`,
        });
    }
    for (const issue of diagnostics.deliveriesWithoutSuccessfulAck) {
        violations.push({
            code: 'delivery-without-successful-ack',
            key: issue.key,
            message: `delivered to socket ${issue.userId} although no successful client ack was recorded`,
        });
    }

    return { pass: violations.length === 0, violations, diagnostics };
};
