# Real-Time Messaging Scale Benchmark

## Purpose

`pnpm test:scale` (run inside `chat-backend/`) is a repeatable, deterministic
benchmark of the **actual authenticated production message path**:

1. A real Express HTTP server created with `createApp()`.
2. A real Socket.IO server created with `createSocketServer()` on an ephemeral
   localhost port.
3. A real isolated MongoDB instance started by `mongodb-memory-server`.
4. Real `socket.io-client` connections, each authenticated by a real JWT in an
   HTTP header using the production `jwt` cookie name and format, verified by
   the production `authenticateSocket` middleware.
5. Real production `handleSendMessage` behavior: sender derived from the
   verified socket identity, recipient existence check, `MessageModel.create`,
   `findById().populate()`, one `receiveMessage` emission to the sender room
   and one to the recipient room, then one acknowledgement.

No external service is used, no production code is modified for testability,
and no production schema or uniqueness constraints are added. The benchmark
only adds its own bookkeeping around the real path, including per-socket
Socket.IO incoming-event middleware that observes server-side acknowledgement
invocations without changing production behavior.

## Authentication truth

Authentication is **not** faked or bypassed. Each benchmark client connects
with `extraHeaders: { Cookie: 'jwt=<signed-token>' }`, where the token is
`jwt.sign({ userId }, JWT_SECRET, { expiresIn: '7d' })` exactly as production
signs session cookies. The benchmark handcrafts the request header rather than
issuing it through the login route, so it is not a literally browser-set
HttpOnly cookie, but it uses the production cookie name/format and is verified
by the production `authenticateSocket` middleware against the same `JWT_SECRET`,
which stores `socket.data.userId`; the benchmark's senders are derived from
those verified identities by production code. The benchmark never supplies a
`sender` field and never connects without authentication.

## Command

```bash
cd chat-backend
pnpm test:scale
```

One command runs every profile in **3 consecutive benchmark runs** (run-major
interleaving: run 1 covers all profiles, then run 2, then run 3) so machine
drift is spread evenly across profiles.

## Profiles

| Profile | Clients | Messages |
| --- | --- | --- |
| 25 clients / 1,000 messages | 25 | 1,000 |
| 50 clients / 5,000 messages | 50 | 5,000 |
| 100 clients / 10,000 messages | 100 | 10,000 |

These counts are fixed and are never silently lowered.

## Deterministic workload

- One seeded user and one socket per client (`N` sockets total).
- Ring topology: sender `i` sends to recipient `(i + 1) % N`.
- Messages are divided deterministically among clients; each client sends its
  own sequence **serially**, and all `N` client loops run concurrently, so all
  clients stay live without an uncontrolled burst of thousands of requests.
- Every message content is exactly a unique benchmark key
  (`bmk:<run>:<profile>:<client>:<seq>`), which correlates emission, ack,
  delivery, and DB persistence without modifying the production schema.
- The **exact raw content** is used as the correlation key everywhere; no
  canonicalization or normalization can hide modified content.
- A high-resolution start timestamp is recorded per key before each emit.
- Timeouts: ack `15s`, connect `15s`, settle `15s`, per-profile watchdog
  `10min`. `BENCH_ACK_TIMEOUT_MS` can override the ack timeout.

## Acknowledgement instrumentation

Client-side ack callbacks are one-shot and the benchmark's own send promise has
a settled guard, so client observations alone cannot prove exact-once
acknowledgement. The benchmark therefore also installs **server-side
instrumentation** on the real Socket.IO instance: for every connected benchmark
socket it registers Socket.IO incoming-event middleware that wraps the
`sendMessage` acknowledgement function. The wrapper records **every** server
invocation of the ack (keyed by the exact payload content), including repeated
invocations that Socket.IO's built-in ack guard would otherwise discard, and
transparently calls the original ack. The middleware is per-socket and the
registration listener is removed after each profile, so instrumentation cannot
leak across runs.

Every observed ack is correlated by exact content, message id, sender id, and
recipient id against the verified server socket identity, the client-observed
ack, the persisted Mongo document, and every delivered `receiveMessage`
payload.

## Settle window

After all sends complete, the profile settles until every expected
sender/recipient delivery pair is present **and** no new delivery observation
arrives for `QUIET_PERIOD_MS` (500ms), or the settle deadline expires. The quiet
clock resets on **every** new delivery observation — including duplicates that
arrive after the expected unique pairs are complete — so late deliveries are
observed rather than masked.

## Metrics per profile per run

- Total attempted, total persisted, successful sends
  - "Attempted" counts actual `sendOne`/`emit` calls recorded by the harness,
    not merely the plan size.
- Total expected deliveries, dropped deliveries, duplicate deliveries
- Total runtime (sends + settle), throughput (messages/sec)
- Median and p95 end-to-end delivery latency (per observed expected delivery,
  from send start to socket receive)
- Heap baseline/peak/delta (MiB), sampled every 50ms during the active profile
  with the interval cleaned up afterwards
- Acknowledgement diagnostics: client success/error/timeout, unexpected client
  ack keys, server ack invocation count, duplicate/unexpected server ack
  invocations, server ack errors, and client-vs-server ack result mismatches
- Misdelivery/persistence diagnostics: misdeliveries, unexpected deliveries,
  deliveries without a successful ack, duplicate persisted keys,
  persisted-without-ack, persisted mismatches, ack/persistence id mismatches,
  delivery metadata and id mismatches, socket disconnects/connect errors

## Fail-closed invariants

The run fails (command exits nonzero after printing diagnostics and writing the
artifact) when any of these hold:

- Attempted count does not equal the profile message count.
- Actual attempts differ from the fixed profile count or from the plan keys
  (missing, duplicate, or unexpected attempts are violations).
- Any attempted send does not have exactly one successful client ack and
  exactly one server-side ack invocation (missing/duplicate client ack,
  missing/duplicate server ack invocation, error ack, timeout, unknown ack key,
  or ack-without-attempt are all violations).
- The client and server ack results disagree, or a successful ack's
  content/sender/recipient/message id or verified socket identity does not
  match the plan.
- A successful send lacks exactly one DB document, has a duplicate document, or
  the persisted sender/recipient/content/id does not match the plan.
- A successful ack's message id does not match the id of the one persisted
  document for that key.
- An expected sender or recipient socket does not receive the message exactly
  once (dropped or duplicate delivery), or the received payload's exact
  content/sender/recipient metadata does not match the plan.
- A delivery's message id does not match the persisted document (and therefore
  the ack) for its key.
- A delivery reaches a socket that is not the message's sender or recipient
  (cross-user delivery), a delivery has a key outside the plan, or a delivery
  arrives for a message that was never attempted.
- A persisted document exists outside the plan or its total differs from the
  attempted/successful total.
- A delivery or persisted document exists for a send without a successful ack.

Every violation is recorded with a diagnostic code and, where applicable, the
exact key and socket so failed runs explain themselves.

## Environment interpretation data

The artifact records:

- Generation timestamp
- OS platform/type/arch/release
- CPU model and logical CPU count
- Total RAM (bytes)
- Node.js version
- Relevant dependency versions (mongoose, socket.io, socket.io-client,
  mongodb-memory-server)
- Benchmark settings and timeouts, transport (`websocket`), Mongo binary
  version, and JWT cookie name

## Artifacts

Results are written to:

- `chat-backend/benchmark-results/realtime-scale-results.json` (stable latest)
- `chat-backend/benchmark-results/realtime-scale-results-<timestamp>.json`

Each artifact contains all runs/profiles, per-run metrics and diagnostics,
overall pass/fail, and the largest profile that passed in all three runs.

## Limitations

- Runs locally on `mongodb-memory-server`; it measures the full authenticated
  message path (auth middleware, Mongoose persistence, population, dual
  emission, ack) but not network latency to a remote MongoDB or a deployed
  host.
- The client transport is forced to `websocket`, matching production's
  real-time path; the default polling-then-upgrade handshake is not exercised.
- Sends are serialized per client, so per-client in-flight concurrency is 1;
  concurrency comes from the number of live clients.
- Socket.IO delivery is in-process on one host; results describe this
  single-process topology, not distributed deployments.
- The benchmark signs JWT cookies directly (rather than issuing them through
  the login route, so the handcrafted request header is not a literally
  browser-set HttpOnly cookie) and inherits the repository's local `.env`
  values (`NODE_ENV=start` in the checked-out repo), so production cookie
  security flags and static serving are not exercised by the benchmark.

## Measured results

The final reviewed harness was run with `pnpm test:scale` on 2026-08-20. The
stable artifact is
`chat-backend/benchmark-results/realtime-scale-results.json`, with an identical
timestamped evidence copy beside it. The machine was an AMD Ryzen 7 5700 (16
logical CPUs), Linux WSL2, 12,541,161,472 bytes total RAM, and Node v24.12.0,
using mongoose 9.2.0, socket.io 4.8.3, socket.io-client 4.8.3,
mongodb-memory-server 11.0.1, and MongoDB 7.0.24.

| Run | Profile | Attempted | Persisted | Expected deliveries | Dropped | Duplicates | Runtime (ms) | Throughput (msg/s) | Median (ms) | p95 (ms) | Heap delta (MiB) | Result |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | 25/1,000 | 1,000 | 1,000 | 2,000 | 0 | 0 | 2,853 | 350.46 | 49.64 | 98.10 | 25.94 | PASS |
| 2 | 25/1,000 | 1,000 | 1,000 | 2,000 | 0 | 0 | 2,182 | 458.38 | 40.18 | 45.48 | 63.64 | PASS |
| 3 | 25/1,000 | 1,000 | 1,000 | 2,000 | 0 | 0 | 2,184 | 457.78 | 39.22 | 53.14 | 6.57 | PASS |
| 1 | 50/5,000 | 5,000 | 5,000 | 10,000 | 0 | 0 | 9,220 | 542.30 | 84.81 | 104.01 | 61.62 | PASS |
| 2 | 50/5,000 | 5,000 | 5,000 | 10,000 | 0 | 0 | 8,331 | 600.17 | 77.96 | 85.29 | 100.88 | PASS |
| 3 | 50/5,000 | 5,000 | 5,000 | 10,000 | 0 | 0 | 8,418 | 593.94 | 77.23 | 98.28 | 102.77 | PASS |
| 1 | 100/10,000 | 10,000 | 10,000 | 20,000 | 0 | 0 | 16,646 | 600.75 | 158.54 | 183.04 | 169.62 | PASS |
| 2 | 100/10,000 | 10,000 | 10,000 | 20,000 | 0 | 0 | 16,228 | 616.24 | 156.72 | 175.02 | 81.69 | PASS |
| 3 | 100/10,000 | 10,000 | 10,000 | 20,000 | 0 | 0 | 16,250 | 615.37 | 155.29 | 185.85 | 85.27 | PASS |

Across the three consecutive runs, 48,000 sends produced 48,000 exactly-once
persisted documents, 48,000 exactly-once server ack invocations, and 96,000
expected sender/recipient deliveries. Every profile reported zero drops,
duplicates, misdeliveries, acknowledgement errors/timeouts, metadata or
message-id mismatches, persistence mismatches, socket disconnects, and
invariant violations.

### Conservative resume-safe claim

On the recorded local single-process environment, the largest profile tested —
**100 concurrent authenticated clients sending 10,000 total messages** — passed
all three consecutive runs with zero detected correctness violations. At that
profile, measured throughput was 600.75–616.24 messages/second, median
end-to-end delivery latency was 155.29–158.54 ms, p95 latency was
175.02–185.85 ms, and heap delta was 81.69–169.62 MiB. This supports only the
tested local profile and topology; it does not establish capacity beyond 100
clients/10,000 messages or performance with remote MongoDB, multiple server
processes, polling transport, or production network conditions.
