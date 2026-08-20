# Local Acceptance — Portfolio DM

End-to-end QA of the running app using two isolated Chromium browser contexts (Alice and Bob) so the two sessions share no cookies or local storage.

## Environment

- Backend: `chat-backend` on `http://localhost:8747` (`NODE_ENV=development`), connected to a MongoDB Atlas database via `MONGO_URL`, with the exact Vite origin allowed by `CLIENT_ORIGIN`.
- Frontend: `chat-frontend` Vite dev server (port `5174` for this run because `5173` was occupied), using backend origin `http://localhost:8747`.
- Browser contexts: two isolated Chromium contexts, one signed in as Alice, one as Bob.
- Viewports: desktop `1600×900` and mobile `390×844`.

## Flow

1. **Signup and validation** — Alice creates an account in one context, Bob in the other. Duplicate signup with Alice's email returns a visible error; invalid login credentials return a generic error without revealing whether the email exists.
2. **Profile setup** — Alice and Bob both complete their required first and last names before proceeding; the completed profiles are reflected in the UI.
3. **Search** — Alice finds Bob by email, while Alice herself is excluded from her own results.
4. **Open DM** — Alice opens Bob's conversation from search and sees the empty conversation state.
5. **Live messaging** — Alice sends "hello bob" and Bob receives it live; Bob replies "hello alice" and Alice receives it live. Each message renders exactly once in each context (no duplicate render).
6. **Persistence** — Both contexts refresh; the full chronological history remains in place.
7. **Resilience** — Simulating an offline connection surfaces the visible reconnecting state; restoring the network reconnects the live channel.
8. **Logout** — Alice logs out; `GET /api/auth/userinfo` now returns `401` and the app returns to the login screen.
9. **Responsive layout** — The app fits and remains usable at `1600×900` desktop and `390×844` mobile widths without overflow.
10. **Console** — No unexpected console errors occur during the flow.

## Evidence

- Screenshots captured during the run:
  - [Authentication and profile setup](screenshots/auth.png)
  - [User search](screenshots/search.png)
  - [Live conversation](screenshots/conversation.png)
  - [Mobile layout](screenshots/mobile.png)
- Backend suite: 8 Jest/Supertest suites, 120 tests passing with 97.37% statement, 92.94% branch, 98.07% function, and 97.23% line coverage.
- Build and lint: backend `pnpm build` passes; frontend `pnpm lint` and `pnpm build` pass.

## Result

All steps passed.
