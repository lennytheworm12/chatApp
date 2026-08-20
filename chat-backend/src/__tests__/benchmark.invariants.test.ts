import { evaluateInvariants } from '../benchmarks/invariants.js';
import type { InvariantInput } from '../benchmarks/invariants.js';
import { buildPlan } from '../benchmarks/plan.js';
import type {
    AckEvent,
    DeliveryObservation,
    PersistedMessage,
    PlannedMessage,
    ServerAckObservation,
} from '../benchmarks/types.js';

const profile = { name: 'invariant-profile', clients: 2, messages: 2 };
const userIds = ['u0', 'u1'];
const plan: PlannedMessage[] = buildPlan(profile, 0, userIds);
const message0 = plan[0]!; // u0 -> u1
const message1 = plan[1]!; // u1 -> u0

const successAck = (message: PlannedMessage): AckEvent => ({
    key: message.key,
    outcome: {
        kind: 'success',
        messageId: `id-${message.key}`,
        content: message.content,
        senderId: message.senderUserId,
        recipientId: message.recipientUserId,
    },
    at: 1,
});

const serverAck = (
    message: PlannedMessage,
    overrides: Partial<ServerAckObservation> = {},
): ServerAckObservation => ({
    key: message.key,
    socketUserId: message.senderUserId,
    result: {
        kind: 'success',
        messageId: `id-${message.key}`,
        content: message.content,
        senderId: message.senderUserId,
        recipientId: message.recipientUserId,
    },
    at: 1,
    ...overrides,
});

const delivery = (
    message: PlannedMessage,
    userId: string,
    overrides: Partial<DeliveryObservation> = {},
    at = 10,
): DeliveryObservation => ({
    key: message.content,
    userId,
    messageId: `id-${message.key}`,
    senderId: message.senderUserId,
    recipientId: message.recipientUserId,
    at,
    ...overrides,
});

const persisted = (message: PlannedMessage, overrides: Partial<PersistedMessage> = {}): PersistedMessage => ({
    key: message.key,
    content: message.content,
    senderId: message.senderUserId,
    recipientId: message.recipientUserId,
    messageId: `id-${message.key}`,
    ...overrides,
});

const baseInput = (): InvariantInput => ({
    plan,
    attemptedKeys: plan.map((message) => message.key),
    clientAckEvents: [successAck(message0), successAck(message1)],
    serverAckObservations: [serverAck(message0), serverAck(message1)],
    deliveries: [
        delivery(message0, 'u0'),
        delivery(message0, 'u1'),
        delivery(message1, 'u1'),
        delivery(message1, 'u0'),
    ],
    persisted: [persisted(message0), persisted(message1)],
    profileMessages: 2,
});

const violationCodes = (input: InvariantInput): string[] =>
    evaluateInvariants(input).violations.map((violation) => violation.code).sort();

describe('evaluateInvariants', () => {
    it('passes a fully consistent run', () => {
        const evaluation = evaluateInvariants(baseInput());

        expect(evaluation.pass).toBe(true);
        expect(evaluation.violations).toEqual([]);
        expect(evaluation.diagnostics).toMatchObject({
            attempted: 2,
            successfulSends: 2,
            ackErrors: 0,
            ackTimeouts: 0,
            ackEventsTotal: 2,
            serverAckInvocations: 2,
            persisted: 2,
            expectedDeliveries: 4,
            observedDeliveries: 4,
            droppedDeliveries: [],
            duplicateDeliveries: [],
            misdeliveries: [],
            unexpectedDeliveries: [],
            ackMetadataMismatches: [],
            ackMessageIdMismatches: [],
            serverAckMetadataMismatches: [],
            serverClientAckMismatches: [],
            deliveryMetadataMismatches: [],
            deliveryMessageIdMismatches: [],
        });
    });

    // ---- Attempted-send accounting --------------------------------------

    it('fails when the actual attempt count differs from the profile message count', () => {
        const input = baseInput();
        input.profileMessages = 3;

        expect(violationCodes(input)).toContain('attempted-count');
    });

    it('fails when the actual attempt count differs from the plan size', () => {
        const input = baseInput();
        input.attemptedKeys = [...input.attemptedKeys, 'bmk:0:invariant-profile:0:2'];

        expect(violationCodes(input)).toContain('attempted-vs-plan');
    });

    it('fails when a planned message was never attempted', () => {
        const input = baseInput();
        input.attemptedKeys = [message0.key];

        const evaluation = evaluateInvariants(input);
        expect(evaluation.pass).toBe(false);
        expect(evaluation.violations).toContainEqual(
            expect.objectContaining({ code: 'missing-attempt', key: message1.key }),
        );
    });

    it('fails when a key is attempted more than once', () => {
        const input = baseInput();
        input.attemptedKeys = [message0.key, message0.key];

        expect(violationCodes(input)).toContain('duplicate-attempt');
    });

    it('fails when a send is attempted for a key outside the plan', () => {
        const input = baseInput();
        input.attemptedKeys = [...input.attemptedKeys, 'bmk:9:nope:0:0'];

        expect(violationCodes(input)).toContain('unexpected-attempt');
    });

    // ---- Client ack observations ----------------------------------------

    it('fails when an attempted send has no client ack event', () => {
        const input = baseInput();
        input.clientAckEvents = [successAck(message0)];

        const evaluation = evaluateInvariants(input);
        expect(evaluation.pass).toBe(false);
        expect(evaluation.violations).toContainEqual(
            expect.objectContaining({ code: 'missing-ack', key: message1.key }),
        );
    });

    it('fails when a key receives more than one client ack event', () => {
        const input = baseInput();
        input.clientAckEvents = [successAck(message0), successAck(message0), successAck(message1)];

        expect(violationCodes(input)).toContain('duplicate-ack');
    });

    it('fails on a client error ack', () => {
        const input = baseInput();
        input.clientAckEvents = [
            successAck(message0),
            { key: message1.key, outcome: { kind: 'error', error: 'Recipient does not exist' }, at: 1 },
        ];

        const evaluation = evaluateInvariants(input);
        expect(evaluation.pass).toBe(false);
        expect(evaluation.diagnostics.ackErrors).toBe(1);
        expect(violationCodes(input)).toContain('ack-error');
    });

    it('fails on a client ack timeout', () => {
        const input = baseInput();
        input.clientAckEvents = [
            successAck(message0),
            { key: message1.key, outcome: { kind: 'timeout' }, at: 1 },
        ];

        const evaluation = evaluateInvariants(input);
        expect(evaluation.pass).toBe(false);
        expect(evaluation.diagnostics.ackTimeouts).toBe(1);
        expect(violationCodes(input)).toContain('ack-timeout');
    });

    it('fails on a client ack for a key outside the plan', () => {
        const input = baseInput();
        input.clientAckEvents = [
            ...input.clientAckEvents,
            { key: 'bmk:9:nope:0:0', outcome: { kind: 'success', messageId: 'x', content: 'x', senderId: 'a', recipientId: 'b' }, at: 1 },
        ];

        expect(violationCodes(input)).toContain('unexpected-ack');
    });

    it('fails when a successful client ack metadata does not match the plan', () => {
        const input = baseInput();
        input.clientAckEvents = [
            {
                ...successAck(message0),
                outcome: {
                    kind: 'success',
                    messageId: `id-${message0.key}`,
                    content: 'modified-content',
                    senderId: message0.senderUserId,
                    recipientId: message0.recipientUserId,
                },
            },
            successAck(message1),
        ];

        const evaluation = evaluateInvariants(input);
        expect(evaluation.pass).toBe(false);
        expect(evaluation.diagnostics.ackMetadataMismatches).toEqual([message0.key]);
        expect(violationCodes(input)).toContain('ack-metadata-mismatch');
    });

    // ---- Server-side ack observations -----------------------------------

    it('fails when the server never invokes the ack for an attempted key', () => {
        const input = baseInput();
        input.serverAckObservations = [serverAck(message0)];

        expect(violationCodes(input)).toContain('missing-server-ack');
    });

    it('fails when the server invokes the ack more than once for one key', () => {
        const input = baseInput();
        input.serverAckObservations = [serverAck(message0), serverAck(message0), serverAck(message1)];

        const evaluation = evaluateInvariants(input);
        expect(evaluation.diagnostics.duplicateServerAckKeys).toEqual([message0.key]);
        expect(violationCodes(input)).toContain('duplicate-server-ack');
    });

    it('fails on a server ack invocation for a key outside the plan', () => {
        const input = baseInput();
        input.serverAckObservations = [
            ...input.serverAckObservations,
            {
                key: 'bmk:9:nope:0:0',
                socketUserId: 'u0',
                result: { kind: 'error', error: 'boom' },
                at: 1,
            },
        ];

        expect(violationCodes(input)).toContain('unexpected-server-ack');
    });

    it('fails when the server ack result is an error', () => {
        const input = baseInput();
        input.serverAckObservations = [
            serverAck(message0),
            { ...serverAck(message1), result: { kind: 'error', error: 'Failed to send message' } },
        ];

        const evaluation = evaluateInvariants(input);
        expect(evaluation.pass).toBe(false);
        expect(evaluation.diagnostics.serverAckErrors).toBe(1);
        expect(violationCodes(input)).toContain('server-ack-error');
    });

    it('fails when the server ack success metadata does not match the plan', () => {
        const input = baseInput();
        input.serverAckObservations = [
            serverAck(message0),
            { ...serverAck(message1), result: { ...serverAck(message1).result, recipientId: 'someone-else' } },
        ];

        const evaluation = evaluateInvariants(input);
        expect(evaluation.diagnostics.serverAckMetadataMismatches).toEqual([message1.key]);
        expect(violationCodes(input)).toContain('server-ack-metadata-mismatch');
    });

    it('fails when the ack is invoked from a socket other than the planned sender', () => {
        const input = baseInput();
        input.serverAckObservations = [
            { ...serverAck(message0), socketUserId: message0.recipientUserId },
            serverAck(message1),
        ];

        const evaluation = evaluateInvariants(input);
        expect(evaluation.diagnostics.serverAckMetadataMismatches).toEqual([message0.key]);
        expect(violationCodes(input)).toContain('server-ack-metadata-mismatch');
    });

    it('fails when client and server ack results disagree', () => {
        const input = baseInput();
        input.serverAckObservations = [
            serverAck(message0),
            { ...serverAck(message1), result: { kind: 'error', error: 'Failed to send message' } },
        ];

        const evaluation = evaluateInvariants(input);
        expect(evaluation.diagnostics.serverClientAckMismatches).toEqual([message1.key]);
        expect(violationCodes(input)).toContain('server-client-ack-mismatch');
    });

    it('fails when a successful ack message id does not match the persisted document id', () => {
        const input = baseInput();
        input.persisted = [
            { ...persisted(message0), messageId: 'different-persisted-id' },
            persisted(message1),
        ];

        const evaluation = evaluateInvariants(input);
        expect(evaluation.diagnostics.ackMessageIdMismatches).toEqual([message0.key]);
        expect(violationCodes(input)).toContain('ack-message-id-mismatch');
    });

    // ---- Persistence ----------------------------------------------------

    it('fails when a successful send has no persisted document', () => {
        const input = baseInput();
        input.persisted = [persisted(message0)];

        const evaluation = evaluateInvariants(input);
        expect(evaluation.pass).toBe(false);
        expect(violationCodes(input)).toEqual(
            expect.arrayContaining(['missing-persistence', 'persisted-total']),
        );
    });

    it('fails on duplicate persistence for one key', () => {
        const input = baseInput();
        input.persisted = [persisted(message0), persisted(message0), persisted(message1)];

        const evaluation = evaluateInvariants(input);
        expect(evaluation.pass).toBe(false);
        expect(evaluation.diagnostics.duplicatePersistedKeys).toEqual([message0.key]);
        expect(violationCodes(input)).toContain('duplicate-persistence');
    });

    it('fails when persisted sender, recipient, content, or id do not match the plan', () => {
        const input = baseInput();
        input.persisted = [
            { ...persisted(message0), senderId: 'wrong-sender' },
            persisted(message1),
        ];

        const evaluation = evaluateInvariants(input);
        expect(evaluation.pass).toBe(false);
        expect(evaluation.diagnostics.persistedMismatches).toEqual([message0.key]);
        expect(violationCodes(input)).toContain('persistence-mismatch');
    });

    it('fails when a document persists without a successful client ack', () => {
        const input = baseInput();
        input.clientAckEvents = [
            successAck(message0),
            { key: message1.key, outcome: { kind: 'error', error: 'boom' }, at: 1 },
        ];

        const evaluation = evaluateInvariants(input);
        expect(evaluation.pass).toBe(false);
        expect(evaluation.diagnostics.persistedWithoutSuccessfulAck).toEqual([message1.key]);
        expect(violationCodes(input)).toContain('persisted-without-successful-ack');
    });

    it('fails on a persisted document whose key is not in the plan', () => {
        const input = baseInput();
        input.persisted = [
            persisted(message0),
            persisted(message1),
            { key: 'bmk:9:nope:0:0', content: 'bmk:9:nope:0:0', senderId: 'u0', recipientId: 'u1', messageId: 'x' },
        ];

        expect(violationCodes(input)).toContain('unexpected-persisted-key');
    });

    it('fails on a persisted document for a message that was never attempted', () => {
        const input = baseInput();
        input.attemptedKeys = [message0.key];
        input.persisted = [persisted(message0), persisted(message1)];

        expect(violationCodes(input)).toContain('persisted-without-attempt');
    });

    it('fails when persisted total does not equal planned total', () => {
        const input = baseInput();
        input.persisted = [persisted(message0), persisted(message1), persisted(message0)];

        const evaluation = evaluateInvariants(input);
        expect(violationCodes(input)).toContain('persisted-total');
        expect(evaluation.pass).toBe(false);
    });

    // ---- Deliveries -----------------------------------------------------

    it('fails when an expected delivery is dropped', () => {
        const input = baseInput();
        input.deliveries = input.deliveries.filter(
            (item) => !(item.key === message0.key && item.userId === 'u0'),
        );

        const evaluation = evaluateInvariants(input);
        expect(evaluation.pass).toBe(false);
        expect(evaluation.diagnostics.droppedDeliveries).toContainEqual({
            key: message0.key,
            userId: 'u0',
        });
        expect(violationCodes(input)).toContain('dropped-delivery');
    });

    it('fails on a duplicate expected delivery', () => {
        const input = baseInput();
        input.deliveries = [...input.deliveries, delivery(message0, 'u1', {}, 11)];

        const evaluation = evaluateInvariants(input);
        expect(evaluation.pass).toBe(false);
        expect(evaluation.diagnostics.duplicateDeliveries).toContainEqual({
            key: message0.key,
            userId: 'u1',
            count: 2,
        });
        expect(violationCodes(input)).toContain('duplicate-delivery');
    });

    it('fails on a cross-user delivery', () => {
        const input = baseInput();
        input.deliveries = [...input.deliveries, delivery(message0, 'some-other-user')];

        const evaluation = evaluateInvariants(input);
        expect(evaluation.pass).toBe(false);
        expect(evaluation.diagnostics.misdeliveries).toContainEqual({
            key: message0.key,
            userId: 'some-other-user',
        });
        expect(violationCodes(input)).toContain('misdelivery');
    });

    it('fails on a delivery whose key is not in the plan (modified content)', () => {
        const input = baseInput();
        input.deliveries = [
            ...input.deliveries,
            {
                key: 'bmk:0:invariant-profile:0:1x',
                userId: 'u0',
                messageId: 'id-x',
                senderId: 'u0',
                recipientId: 'u1',
                at: 12,
            },
        ];

        const evaluation = evaluateInvariants(input);
        expect(evaluation.pass).toBe(false);
        expect(evaluation.diagnostics.unexpectedDeliveries).toContainEqual({
            key: 'bmk:0:invariant-profile:0:1x',
            userId: 'u0',
        });
        expect(violationCodes(input)).toContain('unexpected-delivery');
    });

    it('fails on a delivery for a message that was never attempted', () => {
        const input = baseInput();
        input.attemptedKeys = [message0.key];
        input.deliveries = [
            delivery(message0, 'u0'),
            delivery(message0, 'u1'),
            delivery(message1, 'u1'),
            delivery(message1, 'u0'),
        ];

        expect(violationCodes(input)).toContain('delivery-without-attempt');
    });

    it('fails when an expected delivery has modified content or metadata', () => {
        const input = baseInput();
        input.deliveries = [
            delivery(message0, 'u0', { senderId: 'wrong-sender' }),
            delivery(message0, 'u1'),
            delivery(message1, 'u1'),
            delivery(message1, 'u0'),
        ];

        const evaluation = evaluateInvariants(input);
        expect(evaluation.pass).toBe(false);
        expect(evaluation.diagnostics.deliveryMetadataMismatches).toContainEqual({
            key: message0.key,
            userId: 'u0',
        });
        expect(violationCodes(input)).toContain('delivery-metadata-mismatch');
    });

    it('fails when a delivery message id does not match the persisted document id', () => {
        const input = baseInput();
        input.deliveries = [
            delivery(message0, 'u0', { messageId: 'wrong-delivery-id' }),
            delivery(message0, 'u1'),
            delivery(message1, 'u1'),
            delivery(message1, 'u0'),
        ];

        const evaluation = evaluateInvariants(input);
        expect(evaluation.pass).toBe(false);
        expect(evaluation.diagnostics.deliveryMessageIdMismatches).toContainEqual({
            key: message0.key,
            userId: 'u0',
        });
        expect(violationCodes(input)).toContain('delivery-message-id-mismatch');
    });

    it('fails when a delivery arrives for a send without a successful client ack', () => {
        const input = baseInput();
        input.clientAckEvents = [
            successAck(message0),
            { key: message1.key, outcome: { kind: 'timeout' }, at: 1 },
        ];

        const evaluation = evaluateInvariants(input);
        expect(evaluation.diagnostics.deliveriesWithoutSuccessfulAck).toContainEqual({
            key: message1.key,
            userId: 'u1',
        });
        expect(violationCodes(input)).toContain('delivery-without-successful-ack');
    });
});
