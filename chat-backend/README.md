# chatApp — Instant Messaging Backend

A real-time chat application backend built with Node.js, Express, TypeScript, MongoDB, Socket.IO, and JWT authentication. Built as an individual backend project for CS 314 (Elements of Software Engineering) at Portland State University, Winter 2026.

---

## Tech Stack

- **Runtime:** Node.js + TypeScript (ESM, `verbatimModuleSyntax`)
- **Framework:** Express
- **Database:** MongoDB + Mongoose
- **Real-time:** Socket.IO
- **Auth:** JWT (HTTP-only cookies) + bcrypt
- **Testing:** Jest + Supertest + @shelf/jest-mongodb
- **Package manager:** pnpm

---

## Getting Started

### Prerequisites
- Node.js 18+
- MongoDB instance (local or Atlas)
- pnpm

### Installation

```bash
git clone https://github.com/lennytheworm12/chatApp.git
cd chatApp/chat-backend
pnpm install
```

### Environment Variables

Create a `.env` file in `chat-backend/`:

```env
PORT=8747
MONGO_URL=your_mongodb_connection_string
JWT_SECRET=your_jwt_secret
CLIENT_ORIGIN=http://localhost:3000
```

### Running the Server

```bash
pnpm dev
```

### Running Tests

```bash
pnpm test

# With coverage
pnpm test --coverage
```

---

## API Endpoints

### Auth (`/api/auth`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/signup` | Register a new user |
| POST | `/login` | Login with email + password |
| POST | `/logout` | Clear JWT cookie |
| GET | `/userinfo` | Get current user info |
| POST | `/update-profile` | Update name and color |

### Contacts (`/api/contacts`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/search` | Search users by name or email |
| GET | `/all-contacts` | Get all users except self |
| GET | `/get-contacts-for-list` | Get contacts sorted by last message time |
| DELETE | `/delete-dm/:dmId` | Delete DM history with a user |

### Messages (`/api/messages`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/get-messages` | Get message history between two users |

### Socket.IO Events

| Event | Direction | Description |
|-------|-----------|-------------|
| `sendMessage` | Client → Server | Send a DM; server saves to DB and emits `receiveMessage` to both users |
| `receiveMessage` | Server → Client | Delivers populated message object to sender and recipient |

All protected routes require a valid JWT stored in an HTTP-only cookie, verified by the `verifyUser` middleware.

---

## Project Structure

```
src/
├── index.ts               # Server entry point, Socket.IO setup
├── routes/                # Route definitions per resource
├── controllers/           # One controller file per endpoint
├── models/                # Mongoose schemas (User, Message)
├── middleware/            # JWT auth middleware
├── utils/                 # Token generation helper
├── types/                 # TypeScript interfaces
└── __tests__/             # Jest integration tests
```

---

## Testing

Tests use an in-memory MongoDB instance (no external DB needed) and cover both happy paths and error cases including mocked database failures.

Coverage thresholds enforced in `jest.config.cjs`:

| Metric | Threshold |
|--------|-----------|
| Branches | 75% |
| Functions | 93% |
| Lines | 85% |
| Statements | 85% |

---

## Frontend

This backend is designed to integrate with the TA-provided pre-built frontend for CS 314. To test locally:

1. Clone the frontend: `https://github.com/dreamqin68/frontend-project`
2. Run `npm start` in the frontend directory (serves on port 3000)
3. Start this backend with `pnpm dev`
4. Set `CLIENT_ORIGIN=http://localhost:3000` in your `.env`
