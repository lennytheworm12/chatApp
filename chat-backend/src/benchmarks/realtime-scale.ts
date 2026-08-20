/**
 * Deterministic real-time messaging scale benchmark.
 *
 * Exercises the actual authenticated Socket.IO + MongoDB production message
 * path (createApp -> createSocketServer -> handleSendMessage) with real
 * socket.io-client connections authenticated by a real JWT in the production
 * cookie name/format, against an isolated in-memory MongoDB. The benchmark
 * adds per-socket Socket.IO incoming-event middleware that records every
 * server-side acknowledgement invocation (benchmark-only, not production
 * code), plus exact message id/sender/recipient correlation across ack,
 * delivery, and persistence. No external service, no benchmark-only branches
 * in production code, and no production schema changes.
 *
 * Usage: pnpm test:scale
 */
import { createServer } from 'node:http';
import type { Server as HttpServer } from 'node:http';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import os from 'node:os';
import { createRequire } from 'node:module';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { io as createClientSocket } from 'socket.io-client';
import type { Socket as ClientSocket } from 'socket.io-client';
import { createApp } from '../app.js';
import { createSocketServer } from '../socket/index.js';
import type { ChatServer, ChatSocket, FormattedMessage, SendMessageAck } from '../socket/index.js';
import { MessageModel } from '../models/message.model.js';
import { UserModel } from '../models/user.model.js';
import { buildPlan, groupPlanByClient } from './plan.js';
import type { BenchmarkProfile, PlannedMessage } from './plan.js';
import { evaluateInvariants } from './invariants.js';
import type { InvariantEvaluation, InvariantViolation } from './invariants.js';
import { median, percentile, toMiB } from './metrics.js';
import { serverAckKey, toServerAckResult } from './server-ack.js';
import type {
    AckEvent,
    AckOutcome,
    DeliveryObservation,
    PersistedMessage,
    ServerAckObservation,
} from './types.js';

const RUN_COUNT = 3;
const PROFILES: readonly BenchmarkProfile[] = [
    { name: '25-clients-1000-messages', clients: 25, messages: 1000 },
    { name: '50-clients-5000-messages', clients: 50, messages: 5000 },
    { name: '100-clients-10000-messages', clients: 100, messages: 10000 },
];

// Benchmark-only secret: the production entrypoint validates JWT_SECRET from
// the environment, and the benchmark signs cookies with this same secret so
// the socket authentication path is exercised end to end.
const JWT_SECRET = 'benchmark-jwt-secret-not-used-in-production';
const JWT_COOKIE_NAME = 'jwt';
const MONGO_BINARY_VERSION = '7.0.24';
const TRANSPORTS = ['websocket'] as const;
const ACK_TIMEOUT_MS = Number(process.env.BENCH_ACK_TIMEOUT_MS ?? 15_000);
const CONNECT_TIMEOUT_MS = 15_000;
const SETTLE_TIMEOUT_MS = 15_000;
const QUIET_PERIOD_MS = 500;
const HEAP_SAMPLE_INTERVAL_MS = 50;
const PROFILE_WATCHDOG_MS = 10 * 60_000;

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

interface ProfileRunMetrics {
    totalAttempted: number;
    totalPersisted: number;
    successfulSends: number;
    totalExpectedDeliveries: number;
    droppedDeliveries: number;
    duplicateDeliveries: number;
    runtimeMs: number;
    throughputPerSec: number;
    medianDeliveryLatencyMs: number | null;
    p95DeliveryLatencyMs: number | null;
    heapBaselineMb: number;
    heapPeakMb: number;
    heapDeltaMb: number;
}

interface ProfileRunDiagnostics {
    ackSuccess: number;
    ackErrors: number;
    ackTimeouts: number;
    ackEventsTotal: number;
    unexpectedAckKeys: number;
    ackMetadataMismatches: number;
    ackMessageIdMismatches: number;
    serverAckInvocations: number;
    duplicateServerAckKeys: number;
    serverAckErrors: number;
    unexpectedServerAckKeys: number;
    serverAckMetadataMismatches: number;
    serverClientAckMismatches: number;
    misdeliveries: number;
    unexpectedDeliveries: number;
    deliveriesWithoutSuccessfulAck: number;
    deliveryMetadataMismatches: number;
    deliveryMessageIdMismatches: number;
    duplicatePersistedKeys: number;
    persistedWithoutSuccessfulAck: number;
    persistedMismatches: number;
    sendSocketDisconnects: number;
    sendSocketConnectErrors: number;
}

interface ProfileRunResult {
    profile: BenchmarkProfile;
    pass: boolean;
    error: string | null;
    startedAt: string;
    wallClockMs: number;
    metrics: ProfileRunMetrics;
    diagnostics: ProfileRunDiagnostics;
    violations: InvariantViolation[];
}

interface RunGroup {
    runIndex: number;
    profiles: ProfileRunResult[];
}

interface EnvironmentInfo {
    timestamp: string;
    os: {
        platform: string;
        type: string;
        arch: string;
        release: string;
    };
    cpu: {
        model: string;
        count: number;
    };
    totalMemoryBytes: number;
    nodeVersion: string;
    versions: Record<string, string>;
}

interface BenchmarkSettings {
    runsPerProfile: number;
    profiles: readonly BenchmarkProfile[];
    jwtCookieName: string;
    transports: readonly string[];
    ackTimeoutMs: number;
    connectTimeoutMs: number;
    settleTimeoutMs: number;
    quietPeriodMs: number;
    heapSampleIntervalMs: number;
    profileWatchdogMs: number;
    mongoBinaryVersion: string;
}

interface BenchmarkArtifact {
    generatedAt: string;
    command: string;
    environment: EnvironmentInfo;
    settings: BenchmarkSettings;
    runs: RunGroup[];
    overallPass: boolean;
    largestPassingProfile: string | null;
    failures: string[];
}

const zeroMetrics = (): ProfileRunMetrics => ({
    totalAttempted: 0,
    totalPersisted: 0,
    successfulSends: 0,
    totalExpectedDeliveries: 0,
    droppedDeliveries: 0,
    duplicateDeliveries: 0,
    runtimeMs: 0,
    throughputPerSec: 0,
    medianDeliveryLatencyMs: null,
    p95DeliveryLatencyMs: null,
    heapBaselineMb: 0,
    heapPeakMb: 0,
    heapDeltaMb: 0,
});

const zeroDiagnostics = (): ProfileRunDiagnostics => ({
    ackSuccess: 0,
    ackErrors: 0,
    ackTimeouts: 0,
    ackEventsTotal: 0,
    unexpectedAckKeys: 0,
    ackMetadataMismatches: 0,
    ackMessageIdMismatches: 0,
    serverAckInvocations: 0,
    duplicateServerAckKeys: 0,
    serverAckErrors: 0,
    unexpectedServerAckKeys: 0,
    serverAckMetadataMismatches: 0,
    serverClientAckMismatches: 0,
    misdeliveries: 0,
    unexpectedDeliveries: 0,
    deliveriesWithoutSuccessfulAck: 0,
    deliveryMetadataMismatches: 0,
    deliveryMessageIdMismatches: 0,
    duplicatePersistedKeys: 0,
    persistedWithoutSuccessfulAck: 0,
    persistedMismatches: 0,
    sendSocketDisconnects: 0,
    sendSocketConnectErrors: 0,
});

const captureEnvironment = (): EnvironmentInfo => {
    const require = createRequire(import.meta.url);
    const packageVersion = (name: string): string => {
        try {
            return (require(`${name}/package.json`) as { version: string }).version;
        } catch {
            return 'unknown';
        }
    };
    const cpu = os.cpus()[0];
    return {
        timestamp: new Date().toISOString(),
        os: {
            platform: os.platform(),
            type: os.type(),
            arch: os.arch(),
            release: os.release(),
        },
        cpu: {
            model: cpu?.model ?? 'unknown',
            count: os.cpus().length,
        },
        totalMemoryBytes: os.totalmem(),
        nodeVersion: process.version,
        versions: {
            mongoose: packageVersion('mongoose'),
            'socket.io': packageVersion('socket.io'),
            'socket.io-client': packageVersion('socket.io-client'),
            'mongodb-memory-server': packageVersion('mongodb-memory-server'),
        },
    };
};

const listen = (server: HttpServer): Promise<number> =>
    new Promise<number>((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', () => {
            const address = server.address();
            if (address === null || typeof address === 'string') {
                reject(new Error('could not determine ephemeral listen port'));
                return;
            }
            resolve(address.port);
        });
    });

const connectClient = (url: string, cookieHeader: string, timeoutMs: number): Promise<ClientSocket> =>
    new Promise<ClientSocket>((resolve, reject) => {
        const socket = createClientSocket(url, {
            extraHeaders: { Cookie: cookieHeader },
            transports: [...TRANSPORTS],
            reconnection: false,
            forceNew: true,
            timeout: timeoutMs,
        });
        const timer = setTimeout(() => {
            socket.disconnect();
            reject(new Error(`socket connect timed out after ${timeoutMs}ms`));
        }, timeoutMs);
        socket.once('connect', () => {
            clearTimeout(timer);
            resolve(socket);
        });
        socket.once('connect_error', (err) => {
            clearTimeout(timer);
            socket.disconnect();
            reject(new Error(`socket connect_error: ${err.message}`));
        });
    });

const disconnectSockets = (sockets: readonly ClientSocket[]): void => {
    for (const socket of sockets) {
        try {
            socket.disconnect();
        } catch {
            // best-effort cleanup
        }
    }
};

interface RunProfileContext {
    port: number;
    runIndex: number;
    profile: BenchmarkProfile;
    heapSamples: number[];
    io: ChatServer;
}

/**
 * Benchmark-only instrumentation: wraps every incoming sendMessage
 * acknowledgement on a benchmark socket so every server-side invocation is
 * recorded keyed by the exact payload content, regardless of client-side
 * settled guards or one-shot ack semantics. The wrapper transparently calls
 * the original ack. Per-socket middleware dies with the socket, so it cannot
 * leak across profiles.
 */
const installServerAckInstrumentation = (
    socket: ChatSocket,
    observations: ServerAckObservation[],
): void => {
    socket.use((event: unknown[], next: (err?: Error) => void) => {
        const [eventName, payload, originalAck] = event as [string, unknown, unknown];
        if (eventName === 'sendMessage' && typeof originalAck === 'function') {
            event[2] = ((...ackArgs: unknown[]) => {
                observations.push({
                    key: serverAckKey(payload),
                    socketUserId: socket.data.userId,
                    result: toServerAckResult(ackArgs[0]),
                    at: performance.now(),
                });
                (originalAck as (...args: unknown[]) => void)(...ackArgs);
            }) as unknown;
        }
        next();
    });
};

const runProfile = async (context: RunProfileContext): Promise<ProfileRunResult> => {
    const { port, runIndex, profile } = context;
    const startedAt = new Date().toISOString();
    const wallClockStart = performance.now();
    const sockets: ClientSocket[] = [];
    let heapSampler: NodeJS.Timeout | null = null;
    let watchdogTimer: NodeJS.Timeout | null = null;
    let aborted = false;
    let connectErrors = 0;
    let disconnects = 0;
    let cleanupStarted = false;

    const watchdog = new Promise<never>((_resolve, reject) => {
        watchdogTimer = setTimeout(() => {
            aborted = true;
            reject(new Error(`profile watchdog fired after ${PROFILE_WATCHDOG_MS}ms`));
        }, PROFILE_WATCHDOG_MS);
    });

    const body = (async (): Promise<ProfileRunResult> => {
        // Isolated state per run: wipe both collections so every run starts
        // from the same empty database shape.
        await Promise.all([MessageModel.deleteMany({}), UserModel.deleteMany({})]);

        const userIds: string[] = [];
        for (let i = 0; i < profile.clients; i++) {
            const user = await UserModel.create({
                email: `benchmark.user.${i}@example.test`,
                password: 'benchmark-hashed-password',
                firstName: 'Benchmark',
                lastName: `User${i}`,
                color: '#1a1a2e',
                profileSetup: true,
            });
            userIds.push(user._id.toString());
        }

        const plan = buildPlan(profile, runIndex, userIds);
        const planByClient = groupPlanByClient(plan);
        const planByKey = new Map(plan.map((message) => [message.key, message]));

        const attemptedKeys: string[] = [];
        const startTimes = new Map<string, number>();
        const ackEvents: AckEvent[] = [];
        const serverAckObservations: ServerAckObservation[] = [];
        const deliveries: DeliveryObservation[] = [];

        // Install server-side ack instrumentation before any benchmark send.
        // Per-socket middleware dies with the sockets and the connection
        // listener is removed in the finally below, so nothing leaks across
        // profiles.
        const benchmarkUserIds = new Set(userIds);
        const onBenchmarkConnection = (serverSocket: ChatSocket): void => {
            if (benchmarkUserIds.has(serverSocket.data.userId)) {
                installServerAckInstrumentation(serverSocket, serverAckObservations);
            }
        };
        context.io.on('connection', onBenchmarkConnection);

        try {
            // Real JWT cookies, matching production token generation semantics.
            const cookies = userIds.map(
                (userId) =>
                    `${JWT_COOKIE_NAME}=${jwt.sign({ userId }, JWT_SECRET, { expiresIn: '7d' })}`,
            );
            const url = `http://127.0.0.1:${port}`;
            for (let i = 0; i < profile.clients; i++) {
                if (aborted) throw new Error('aborted');
                const socket = await connectClient(url, cookies[i] as string, CONNECT_TIMEOUT_MS);
                sockets.push(socket);
                socket.on('disconnect', () => {
                    if (!cleanupStarted) {
                        disconnects += 1;
                    }
                });
                socket.on('connect_error', () => {
                    connectErrors += 1;
                });
            }

            const heapBaseline = process.memoryUsage().heapUsed;
            heapSampler = setInterval(() => {
                context.heapSamples.push(process.memoryUsage().heapUsed);
            }, HEAP_SAMPLE_INTERVAL_MS);

            for (let i = 0; i < sockets.length; i++) {
                const socket = sockets[i] as ClientSocket;
                const socketUserId = userIds[i] as string;
                socket.on('receiveMessage', (message: FormattedMessage) => {
                    // The exact raw content is the key; modified content yields
                    // a key outside the plan and fails closed. Full id/sender/
                    // recipient metadata is recorded for exact correlation.
                    deliveries.push({
                        key:
                            typeof message.content === 'string'
                                ? message.content
                                : `invalid-content:${String(message.content)}`,
                        userId: socketUserId,
                        messageId: String(message?.id ?? ''),
                        senderId: String(message?.sender?.id ?? message?.sender?._id ?? ''),
                        recipientId: String(message?.recipient?.id ?? message?.recipient?._id ?? ''),
                        at: performance.now(),
                    });
                });
            }

            const sendOne = (socket: ClientSocket, message: PlannedMessage): Promise<void> => {
                attemptedKeys.push(message.key);
                startTimes.set(message.key, performance.now());
                return new Promise<void>((resolve) => {
                    let settled = false;
                    const finish = (outcome: AckOutcome): void => {
                        if (settled) return;
                        settled = true;
                        ackEvents.push({ key: message.key, outcome, at: performance.now() });
                        resolve();
                    };
                    const timer = setTimeout(() => {
                        finish({ kind: 'timeout' });
                    }, ACK_TIMEOUT_MS);
                    try {
                        socket.timeout(ACK_TIMEOUT_MS).emit(
                            'sendMessage',
                            {
                                recipient: message.recipientUserId,
                                content: message.content,
                                messageType: 'text',
                            },
                            (err: Error | null, ack: SendMessageAck | undefined) => {
                                clearTimeout(timer);
                                if (err) {
                                    finish({ kind: 'timeout' });
                                    return;
                                }
                                if (ack && 'message' in ack) {
                                    const ackMessage = ack.message;
                                    finish({
                                        kind: 'success',
                                        messageId: String(ackMessage.id),
                                        content: ackMessage.content,
                                        senderId: String(
                                            ackMessage.sender?.id ?? ackMessage.sender?._id ?? '',
                                        ),
                                        recipientId: String(
                                            ackMessage.recipient?.id ?? ackMessage.recipient?._id ?? '',
                                        ),
                                    });
                                    return;
                                }
                                if (ack && 'error' in ack) {
                                    finish({ kind: 'error', error: ack.error });
                                    return;
                                }
                                finish({ kind: 'timeout' });
                            },
                        );
                    } catch (error) {
                        clearTimeout(timer);
                        finish({
                            kind: 'error',
                            error: error instanceof Error ? error.message : String(error),
                        });
                    }
                });
            };

            const sendStart = performance.now();
            await Promise.all(
                Array.from({ length: profile.clients }, async (_, clientIndex) => {
                    const clientMessages = planByClient.get(clientIndex) ?? [];
                    const socket = sockets[clientIndex];
                    if (!socket) return;
                    for (const message of clientMessages) {
                        if (aborted) return;
                        await sendOne(socket, message);
                    }
                }),
            );

            // Settle: wait until every successful send has both expected
            // deliveries and a quiet period passes with no new delivery
            // observations (including late duplicates), or the deadline.
            const successfulKeys = new Set<string>();
            for (const event of ackEvents) {
                if (event.outcome.kind === 'success') successfulKeys.add(event.key);
            }
            const expectedPairs = new Set<string>();
            for (const key of successfulKeys) {
                const message = planByKey.get(key);
                if (!message) continue;
                expectedPairs.add(`${key}\u0000${message.senderUserId}`);
                expectedPairs.add(`${key}\u0000${message.recipientUserId}`);
            }
            const expectedDeliveryCount = expectedPairs.size;
            const settleDeadline = performance.now() + SETTLE_TIMEOUT_MS;
            let quietSince = performance.now();
            let observedDeliveryCount = 0;
            while (true) {
                if (aborted) break;
                const now = performance.now();
                if (now >= settleDeadline) break;
                // Reset the quiet window on every new delivery observation so
                // late duplicates arriving after the unique pairs are complete
                // are still observed before the profile stops settling.
                if (deliveries.length !== observedDeliveryCount) {
                    observedDeliveryCount = deliveries.length;
                    quietSince = now;
                }
                const receivedPairs = new Set<string>();
                for (const delivery of deliveries) {
                    if (successfulKeys.has(delivery.key)) {
                        receivedPairs.add(`${delivery.key}\u0000${delivery.userId}`);
                    }
                }
                if (receivedPairs.size >= expectedDeliveryCount && now - quietSince >= QUIET_PERIOD_MS) {
                    break;
                }
                await sleep(25);
            }
            const sendEnd = performance.now();

            if (heapSampler) {
                clearInterval(heapSampler);
                heapSampler = null;
            }
            cleanupStarted = true;
            disconnectSockets(sockets);

            const persistedDocs = await MessageModel.find({}).lean().exec();
            const persisted: PersistedMessage[] = persistedDocs.map((doc) => ({
                key: doc.content,
                content: doc.content,
                senderId: doc.sender.toString(),
                recipientId: doc.recipient.toString(),
                messageId: doc._id.toString(),
            }));

            // End-to-end delivery latency per observed expected delivery.
            const expectedPairSet = new Set<string>();
            for (const key of successfulKeys) {
                const message = planByKey.get(key);
                if (!message) continue;
                expectedPairSet.add(`${key}\u0000${message.senderUserId}`);
                expectedPairSet.add(`${key}\u0000${message.recipientUserId}`);
            }
            const latencies: number[] = [];
            for (const delivery of deliveries) {
                if (!expectedPairSet.has(`${delivery.key}\u0000${delivery.userId}`)) continue;
                const start = startTimes.get(delivery.key);
                if (start !== undefined) latencies.push(delivery.at - start);
            }

            const evaluation: InvariantEvaluation = evaluateInvariants({
                plan,
                attemptedKeys,
                clientAckEvents: ackEvents,
                serverAckObservations,
                deliveries,
                persisted,
                profileMessages: profile.messages,
            });
            const d = evaluation.diagnostics;
            const runtimeMs = sendEnd - sendStart;
            const peakHeap =
                context.heapSamples.length > 0 ? Math.max(...context.heapSamples) : heapBaseline;
            const metrics: ProfileRunMetrics = {
                totalAttempted: d.attempted,
                totalPersisted: d.persisted,
                successfulSends: d.successfulSends,
                totalExpectedDeliveries: d.expectedDeliveries,
                droppedDeliveries: d.droppedDeliveries.length,
                duplicateDeliveries: d.duplicateDeliveries.length,
                runtimeMs,
                throughputPerSec: runtimeMs > 0 ? (d.attempted / runtimeMs) * 1000 : 0,
                medianDeliveryLatencyMs: median(latencies),
                p95DeliveryLatencyMs: percentile(latencies, 95),
                heapBaselineMb: round2(toMiB(heapBaseline)),
                heapPeakMb: round2(toMiB(peakHeap)),
                heapDeltaMb: round2(toMiB(Math.max(0, peakHeap - heapBaseline))),
            };
            const diagnostics: ProfileRunDiagnostics = {
                ackSuccess: d.successfulSends,
                ackErrors: d.ackErrors,
                ackTimeouts: d.ackTimeouts,
                ackEventsTotal: d.ackEventsTotal,
                unexpectedAckKeys: d.unexpectedAckKeys,
                ackMetadataMismatches: d.ackMetadataMismatches.length,
                ackMessageIdMismatches: d.ackMessageIdMismatches.length,
                serverAckInvocations: d.serverAckInvocations,
                duplicateServerAckKeys: d.duplicateServerAckKeys.length,
                serverAckErrors: d.serverAckErrors,
                unexpectedServerAckKeys: d.unexpectedServerAckKeys,
                serverAckMetadataMismatches: d.serverAckMetadataMismatches.length,
                serverClientAckMismatches: d.serverClientAckMismatches.length,
                misdeliveries: d.misdeliveries.length,
                unexpectedDeliveries: d.unexpectedDeliveries.length,
                deliveriesWithoutSuccessfulAck: d.deliveriesWithoutSuccessfulAck.length,
                deliveryMetadataMismatches: d.deliveryMetadataMismatches.length,
                deliveryMessageIdMismatches: d.deliveryMessageIdMismatches.length,
                duplicatePersistedKeys: d.duplicatePersistedKeys.length,
                persistedWithoutSuccessfulAck: d.persistedWithoutSuccessfulAck.length,
                persistedMismatches: d.persistedMismatches.length,
                sendSocketDisconnects: disconnects,
                sendSocketConnectErrors: connectErrors,
            };

            return {
                profile,
                pass: evaluation.pass,
                error: null,
                startedAt,
                wallClockMs: performance.now() - wallClockStart,
                metrics,
                diagnostics,
                violations: evaluation.violations,
            };
        } finally {
            context.io.off('connection', onBenchmarkConnection);
        }
    })();

    try {
        const result = await Promise.race([body, watchdog]);
        if (watchdogTimer) clearTimeout(watchdogTimer);
        return result;
    } catch (error) {
        if (watchdogTimer) clearTimeout(watchdogTimer);
        if (heapSampler) {
            clearInterval(heapSampler);
            heapSampler = null;
        }
        cleanupStarted = true;
        disconnectSockets(sockets);
        return {
            profile,
            pass: false,
            error: error instanceof Error ? error.message : String(error),
            startedAt,
            wallClockMs: performance.now() - wallClockStart,
            metrics: zeroMetrics(),
            diagnostics: zeroDiagnostics(),
            violations: [],
        };
    }
};

const round2 = (value: number): number => Math.round(value * 100) / 100;

const buildFailures = (runs: readonly RunGroup[]): string[] => {
    const failures: string[] = [];
    for (const group of runs) {
        for (const result of group.profiles) {
            if (result.pass) continue;
            const reason = result.error ?? `${result.violations.length} invariant violation(s)`;
            failures.push(
                `run ${group.runIndex + 1}/${RUN_COUNT} ${result.profile.name}: FAILED (${reason})`,
            );
        }
    }
    return failures;
};

const largestPassingProfile = (runs: readonly RunGroup[]): string | null => {
    const passCounts = new Map<string, number>();
    for (const group of runs) {
        for (const result of group.profiles) {
            if (result.pass) {
                passCounts.set(result.profile.name, (passCounts.get(result.profile.name) ?? 0) + 1);
            }
        }
    }
    let largest: string | null = null;
    for (const profile of PROFILES) {
        if ((passCounts.get(profile.name) ?? 0) === RUN_COUNT) {
            largest = profile.name;
        }
    }
    return largest;
};

const printSummary = (artifact: BenchmarkArtifact): void => {
    console.log('\n=== realtime-scale benchmark summary ===');
    for (const group of artifact.runs) {
        console.log(`\nRun ${group.runIndex + 1}/${RUN_COUNT}`);
        for (const result of group.profiles) {
            const m = result.metrics;
            const line =
                `${result.profile.name}: ` +
                `${result.pass ? 'PASS' : 'FAIL'}` +
                ` attempted=${m.totalAttempted}` +
                ` persisted=${m.totalPersisted}` +
                ` ackOk=${result.diagnostics.ackSuccess}` +
                ` deliveries=${m.totalExpectedDeliveries}` +
                ` dropped=${m.droppedDeliveries}` +
                ` dup=${m.duplicateDeliveries}` +
                ` runtime=${Math.round(m.runtimeMs)}ms` +
                ` throughput=${round2(m.throughputPerSec)} msg/s` +
                ` median=${m.medianDeliveryLatencyMs === null ? 'n/a' : `${round2(m.medianDeliveryLatencyMs)}ms`}` +
                ` p95=${m.p95DeliveryLatencyMs === null ? 'n/a' : `${round2(m.p95DeliveryLatencyMs)}ms`}` +
                ` heapDelta=${m.heapDeltaMb}MiB`;
            console.log(line);
            if (result.error) {
                console.log(`  error: ${result.error}`);
            }
            for (const violation of result.violations.slice(0, 10)) {
                console.log(`  violation[${violation.code}]${violation.key ? ` ${violation.key}` : ''}: ${violation.message}`);
            }
            if (result.violations.length > 10) {
                console.log(`  ... ${result.violations.length - 10} more violation(s)`);
            }
        }
    }
    console.log(`\nOverall: ${artifact.overallPass ? 'PASS' : 'FAIL'}`);
    console.log(`Largest profile passing all 3 runs: ${artifact.largestPassingProfile ?? 'none'}`);
};

const writeArtifacts = async (artifact: BenchmarkArtifact): Promise<string[]> => {
    const moduleDir = dirname(fileURLToPath(import.meta.url));
    const resultsDir = resolve(moduleDir, '..', '..', 'benchmark-results');
    await mkdir(resultsDir, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const stablePath = join(resultsDir, 'realtime-scale-results.json');
    const timestampedPath = join(resultsDir, `realtime-scale-results-${timestamp}.json`);
    const payload = `${JSON.stringify(artifact, null, 2)}\n`;
    await Promise.all([writeFile(stablePath, payload), writeFile(timestampedPath, payload)]);
    return [stablePath, timestampedPath];
};

const main = async (): Promise<void> => {
    process.env.JWT_SECRET = JWT_SECRET;
    const environment = captureEnvironment();
    const settings: BenchmarkSettings = {
        runsPerProfile: RUN_COUNT,
        profiles: PROFILES,
        jwtCookieName: JWT_COOKIE_NAME,
        transports: [...TRANSPORTS],
        ackTimeoutMs: ACK_TIMEOUT_MS,
        connectTimeoutMs: CONNECT_TIMEOUT_MS,
        settleTimeoutMs: SETTLE_TIMEOUT_MS,
        quietPeriodMs: QUIET_PERIOD_MS,
        heapSampleIntervalMs: HEAP_SAMPLE_INTERVAL_MS,
        profileWatchdogMs: PROFILE_WATCHDOG_MS,
        mongoBinaryVersion: MONGO_BINARY_VERSION,
    };

    let mongoServer: MongoMemoryServer | null = null;
    const runs: RunGroup[] = [];
    try {
        mongoServer = await MongoMemoryServer.create({
            binary: { version: MONGO_BINARY_VERSION },
            instance: { dbName: 'benchmark' },
        });
        await mongoose.connect(mongoServer.getUri());

        const app = createApp();
        const httpServer: HttpServer = createServer(app);
        const io = createSocketServer(httpServer);
        const port = await listen(httpServer);
        console.log(`benchmark server listening on 127.0.0.1:${port}`);

        try {
            for (let runIndex = 0; runIndex < RUN_COUNT; runIndex++) {
                const profiles: ProfileRunResult[] = [];
                for (const profile of PROFILES) {
                    const heapSamples: number[] = [];
                    console.log(
                        `\n[run ${runIndex + 1}/${RUN_COUNT}] ${profile.name} (${profile.clients} clients, ${profile.messages} messages)`,
                    );
                    const result = await runProfile({
                        port,
                        runIndex,
                        profile,
                        heapSamples,
                        io,
                    });
                    profiles.push(result);
                    if (result.pass) {
                        console.log(
                            `  PASS attempted=${result.metrics.totalAttempted} persisted=${result.metrics.totalPersisted} ` +
                            `deliveries=${result.metrics.totalExpectedDeliveries} dropped=${result.metrics.droppedDeliveries} ` +
                            `runtime=${Math.round(result.metrics.runtimeMs)}ms ` +
                            `throughput=${round2(result.metrics.throughputPerSec)} msg/s`,
                        );
                    } else {
                        console.log(`  FAIL: ${result.error ?? `${result.violations.length} invariant violation(s)`}`);
                    }
                }
                runs.push({ runIndex, profiles });
            }
        } finally {
            await new Promise<void>((resolve) => {
                io.close(() => resolve());
            });
            await new Promise<void>((resolve) => {
                httpServer.close(() => resolve());
            });
        }
    } finally {
        if (mongoose.connection.readyState !== 0) {
            await mongoose.disconnect();
        }
        await mongoServer?.stop();
    }

    const overallPass = runs.every((group) => group.profiles.every((result) => result.pass));
    const artifact: BenchmarkArtifact = {
        generatedAt: new Date().toISOString(),
        command: 'pnpm test:scale',
        environment,
        settings,
        runs,
        overallPass,
        largestPassingProfile: largestPassingProfile(runs),
        failures: buildFailures(runs),
    };
    const artifactPaths = await writeArtifacts(artifact);
    printSummary(artifact);
    console.log(`\nresults written to:\n  ${artifactPaths.join('\n  ')}`);
    if (!overallPass) {
        process.exitCode = 1;
    }
};

main().catch((error: unknown) => {
    console.error('benchmark aborted:', error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
});
