import { API_BASE_URL } from '../config';
import type { HistoryMessage, RecentContact, User } from '../types';

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

type UnauthorizedListener = () => void;

let unauthorizedListener: UnauthorizedListener | null = null;

/** The auth provider subscribes here so any 401 anywhere clears the session. */
export function setUnauthorizedListener(listener: UnauthorizedListener | null): void {
  unauthorizedListener = listener;
}

function notifyUnauthorized(): void {
  unauthorizedListener?.();
}

function extractMessage(data: unknown): string | null {
  if (data && typeof data === 'object' && 'message' in data) {
    const message = (data as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim()) return message;
  }
  return null;
}

async function apiRequest<T>(path: string, init: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
    });
  } catch {
    throw new ApiError(0, 'Unable to reach the server. Check your connection and try again.');
  }

  if (response.status === 401) notifyUnauthorized();

  let data: unknown = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    throw new ApiError(response.status, extractMessage(data) ?? `Request failed (${response.status})`);
  }
  return data as T;
}

const postJson = <T>(path: string, body: unknown): Promise<T> =>
  apiRequest<T>(path, { method: 'POST', body: JSON.stringify(body) });

const getJson = <T>(path: string): Promise<T> => apiRequest<T>(path, { method: 'GET' });

export interface AuthResponse {
  user: User;
}

interface ContactsListResponse {
  contacts: RecentContact[];
}

interface SearchResponse {
  contacts: User[];
}

interface MessagesResponse {
  messages: HistoryMessage[];
}

export const api = {
  signup: (email: string, password: string) =>
    postJson<AuthResponse>('/api/auth/signup', { email, password }),
  login: (email: string, password: string) =>
    postJson<AuthResponse>('/api/auth/login', { email, password }),
  userinfo: () => getJson<AuthResponse>('/api/auth/userinfo'),
  logout: () => postJson<{ message: string }>('/api/auth/logout', {}),
  updateProfile: (profile: { firstName: string; lastName: string; color?: string }) =>
    postJson<AuthResponse>('/api/auth/update-profile', profile),
  searchContacts: (searchTerm: string) =>
    postJson<SearchResponse>('/api/contacts/search', { searchTerm }),
  getContactsForList: () => getJson<ContactsListResponse>('/api/contacts/get-contacts-for-list'),
  getMessages: (id: string) => postJson<MessagesResponse>('/api/messages/get-messages', { id }),
};
