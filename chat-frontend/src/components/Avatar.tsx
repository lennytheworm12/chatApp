import { initialsFor } from '../lib/format';

interface AvatarProps {
  person: {
    firstName?: string | null;
    lastName?: string | null;
    email?: string | null;
    color?: string | null;
  };
  size?: 'xs' | 'sm' | 'md' | 'lg';
}

export function Avatar({ person, size = 'md' }: AvatarProps) {
  return (
    <span
      className={`avatar avatar--${size}`}
      style={person.color ? { backgroundColor: person.color } : undefined}
      aria-hidden="true"
    >
      {initialsFor(person)}
    </span>
  );
}
