# MVP implementation plan

## Already working

- Express and TypeScript backend with MongoDB/Mongoose models for users and direct messages.
- JWT authentication stored in an HTTP-only cookie, with signup, login, logout, current-user lookup, and profile updates.
- Protected contact search, message-derived recent contacts, and two-user message-history endpoints.
- Socket.IO message persistence and sender/recipient delivery behavior.
- Jest/Supertest coverage for the existing HTTP controllers and established coverage thresholds.

## Missing

- A repository-owned browser client; `chat-frontend` was only the default Vite template.
- Authentication bootstrap, profile completion, user search, recent conversations, DM history, composer, and Socket.IO lifecycle in React.
- Frontend and backend environment examples, root portfolio documentation, screenshots, and deployment configuration.
- Public frontend/backend deployments and a production two-account acceptance run.

## Broken integration

- The original Socket.IO connection trusted `handshake.query.userId`, and `sendMessage` trusted a client-supplied sender ID.
- The backend was coupled to one `CLIENT_ORIGIN` value without a reusable production origin policy.
- Authentication, REST requests, and Socket.IO had not been integrated into the repository-owned frontend.
- The legacy `frontend-project` gitlink points at the old TA-facing frontend and cannot be part of the final workflow.

## Deployment blockers

- No hosting configuration, public URLs, production MongoDB configuration, or deployment credentials are present.
- No root README or environment-variable documentation exists.
- Generated coverage reports are tracked, while production and local artifacts are not consistently ignored at the repository root.
- Production cookie, CORS, reconnect, and cross-origin behavior have not yet been exercised against HTTPS origins.

## Security blockers

- Socket identity and sender identity were spoofable in the original implementation.
- Socket connections were not rejected when unauthenticated.
- Several public inputs lacked bounded validation, and API responses needed a consistent password-sanitization boundary.
- Required production environment variables were not validated before starting the server.

## Delivery sequence

1. Preserve the existing controller/route/model design while closing authentication, validation, CORS, and Socket.IO gaps and extending focused tests.
2. Replace the Vite starter with a cookie-authenticated React DM client using the existing REST and Socket.IO contracts.
3. Run backend tests/build, frontend lint/build, and a two-account local browser acceptance test.
4. Remove tracked generated artifacts, add deployment configuration and portfolio documentation, and capture repository-owned screenshots.
5. Deploy both layers with production MongoDB and HTTPS, then repeat the full two-account acceptance test against the public URLs.
