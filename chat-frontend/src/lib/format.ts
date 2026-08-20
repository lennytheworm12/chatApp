export function displayName(person: {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
}): string {
  const name = [person.firstName, person.lastName]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(' ');
  if (name) return name;
  return person.email?.trim() || 'Unnamed user';
}

export function initialsFor(person: {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
}): string {
  const first = person.firstName?.trim().charAt(0);
  const last = person.lastName?.trim().charAt(0);
  if (first || last) return `${first ?? ''}${last ?? ''}`.toUpperCase();
  const email = person.email?.trim();
  return email ? email.charAt(0).toUpperCase() : '?';
}

function toDate(value: string | Date): Date {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? new Date(0) : date;
}

export function formatMessageTime(value: string | Date): string {
  return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(toDate(value));
}

export function formatRelativeDay(value: string | Date): string {
  const date = toDate(value);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) {
    return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(date);
  }
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  if (date.getFullYear() === now.getFullYear()) {
    return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(date);
  }
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(date);
}

export function dayGroupLabel(value: string | Date): string {
  const date = toDate(value);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) return 'Today';
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric' }).format(date);
}
