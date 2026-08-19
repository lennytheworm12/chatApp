import { useState, type FormEvent } from 'react';
import { ApiError } from '../lib/api';
import type { User } from '../types';

interface ProfileSetupProps {
  user: User;
  onComplete: (profile: { firstName: string; lastName: string; color?: string }) => Promise<void>;
}

const COLOR_CHOICES = ['#2443c9', '#a65a2e', '#4f6b3a', '#6f4a7e', '#4e6170', '#8a7224'];

export function ProfileSetup({ user, onComplete }: ProfileSetupProps) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [color, setColor] = useState<string | undefined>(undefined);
  const [fieldErrors, setFieldErrors] = useState<{ firstName?: string; lastName?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const errors: { firstName?: string; lastName?: string } = {};
    if (!firstName.trim()) errors.firstName = 'First name is required.';
    if (!lastName.trim()) errors.lastName = 'Last name is required.';
    setFieldErrors(errors);
    setFormError(null);
    if (Object.keys(errors).length > 0) return;

    setSubmitting(true);
    try {
      await onComplete({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        ...(color ? { color } : {}),
      });
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
        <p className="auth-kicker">
          Signed in as {user.email}. Almost there — tell people what to call you.
        </p>

        <form onSubmit={handleSubmit} noValidate>
          <div className="field">
            <label className="field-label" htmlFor="profile-first">
              First name
            </label>
            <input
              id="profile-first"
              className="field-input"
              type="text"
              autoComplete="given-name"
              value={firstName}
              onChange={(event) => setFirstName(event.target.value)}
              aria-invalid={Boolean(fieldErrors.firstName)}
              aria-describedby={fieldErrors.firstName ? 'profile-first-error' : undefined}
              disabled={submitting}
            />
            {fieldErrors.firstName && (
              <span className="field-error" id="profile-first-error">
                {fieldErrors.firstName}
              </span>
            )}
          </div>

          <div className="field">
            <label className="field-label" htmlFor="profile-last">
              Last name
            </label>
            <input
              id="profile-last"
              className="field-input"
              type="text"
              autoComplete="family-name"
              value={lastName}
              onChange={(event) => setLastName(event.target.value)}
              aria-invalid={Boolean(fieldErrors.lastName)}
              aria-describedby={fieldErrors.lastName ? 'profile-last-error' : undefined}
              disabled={submitting}
            />
            {fieldErrors.lastName && (
              <span className="field-error" id="profile-last-error">
                {fieldErrors.lastName}
              </span>
            )}
          </div>

          <fieldset className="field swatch-field">
            <legend className="field-label">Accent color (optional)</legend>
            <div className="swatch-row">
              {COLOR_CHOICES.map((choice) => (
                <button
                  key={choice}
                  type="button"
                  className="swatch"
                  style={{ backgroundColor: choice }}
                  aria-label={`Use accent color ${choice}`}
                  aria-pressed={color === choice}
                  onClick={() => setColor(color === choice ? undefined : choice)}
                  disabled={submitting}
                />
              ))}
            </div>
          </fieldset>

          {formError && (
            <div className="notice notice--error" role="alert">
              {formError}
            </div>
          )}

          <button type="submit" className="btn btn--primary btn--block" disabled={submitting}>
            {submitting ? 'Saving…' : 'Continue to conversations'}
          </button>
        </form>
      </div>
    </main>
  );
}
