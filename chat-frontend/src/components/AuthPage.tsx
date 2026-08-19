import { useState, type FormEvent } from 'react';
import { ApiError } from '../lib/api';

interface AuthPageProps {
  bootstrapError: string | null;
  onRetryBootstrap: () => void;
  onLogin: (email: string, password: string) => Promise<void>;
  onSignup: (email: string, password: string) => Promise<void>;
}

type Mode = 'login' | 'signup';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function AuthPage({ bootstrapError, onRetryBootstrap, onLogin, onSignup }: AuthPageProps) {
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const switchMode = (next: Mode) => {
    setMode(next);
    setFieldErrors({});
    setFormError(null);
    setPassword('');
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const errors: { email?: string; password?: string } = {};
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      errors.email = 'Email is required.';
    } else if (!EMAIL_PATTERN.test(trimmedEmail)) {
      errors.email = 'Enter a valid email address.';
    }
    if (!password) errors.password = 'Password is required.';

    setFieldErrors(errors);
    setFormError(null);
    if (Object.keys(errors).length > 0) return;

    setSubmitting(true);
    try {
      if (mode === 'login') {
        await onLogin(trimmedEmail, password);
      } else {
        await onSignup(trimmedEmail, password);
      }
    } catch (error) {
      setFormError(
        error instanceof ApiError ? error.message : 'Something went wrong. Please try again.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="auth-shell">
      <div className="auth-panel">
        <div className="brand">
          Portfolio DM<span className="brand-dot">.</span>
        </div>
        <p className="auth-kicker">A quiet workspace for direct messages.</p>

        {bootstrapError && (
          <div className="notice notice--error" role="alert">
            <span>{bootstrapError}</span>
            <button type="button" className="btn btn--link" onClick={onRetryBootstrap}>
              Try again
            </button>
          </div>
        )}

        <div className="auth-tabs" role="tablist" aria-label="Authentication mode">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'login'}
            className="auth-tab"
            onClick={() => switchMode('login')}
          >
            Sign in
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'signup'}
            className="auth-tab"
            onClick={() => switchMode('signup')}
          >
            Create account
          </button>
        </div>

        <form onSubmit={handleSubmit} noValidate>
          <div className="field">
            <label className="field-label" htmlFor="auth-email">
              Email
            </label>
            <input
              id="auth-email"
              className="field-input"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              aria-invalid={Boolean(fieldErrors.email)}
              aria-describedby={fieldErrors.email ? 'auth-email-error' : undefined}
              disabled={submitting}
            />
            {fieldErrors.email && (
              <span className="field-error" id="auth-email-error">
                {fieldErrors.email}
              </span>
            )}
          </div>

          <div className="field">
            <label className="field-label" htmlFor="auth-password">
              Password
            </label>
            <input
              id="auth-password"
              className="field-input"
              type="password"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              aria-invalid={Boolean(fieldErrors.password)}
              aria-describedby={fieldErrors.password ? 'auth-password-error' : undefined}
              disabled={submitting}
            />
            {fieldErrors.password && (
              <span className="field-error" id="auth-password-error">
                {fieldErrors.password}
              </span>
            )}
          </div>

          {formError && (
            <div className="notice notice--error" role="alert">
              {formError}
            </div>
          )}

          <button type="submit" className="btn btn--primary btn--block" disabled={submitting}>
            {submitting
              ? mode === 'login'
                ? 'Signing in…'
                : 'Creating account…'
              : mode === 'login'
                ? 'Sign in'
                : 'Create account'}
          </button>
        </form>
      </div>
    </main>
  );
}
