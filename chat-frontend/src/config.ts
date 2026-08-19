const FALLBACK_API_URL = 'http://localhost:8747';

function resolveApiBaseUrl(): string {
  const configured = (import.meta.env.VITE_API_URL as string | undefined)?.trim();
  if (configured) return configured.replace(/\/+$/, '');
  if (import.meta.env.DEV) return FALLBACK_API_URL;
  return window.location.origin;
}

/**
 * Single module that owns the backend origin, shared by all HTTP calls and
 * the Socket.IO connection.
 * - VITE_API_URL, when set, wins in every environment.
 * - Otherwise the local backend default is used only in Vite development.
 * - Production builds fall back to the same origin that hosts the app.
 */
export const API_BASE_URL: string = resolveApiBaseUrl();
