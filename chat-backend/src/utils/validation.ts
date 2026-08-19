import { Types } from 'mongoose';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const normalizeEmail = (value: unknown): string =>
    typeof value === 'string' ? value.trim().toLowerCase() : '';

export const isValidEmail = (value: string): boolean => EMAIL_REGEX.test(value);

export const isValidObjectId = (value: unknown): value is string =>
    typeof value === 'string' && Types.ObjectId.isValid(value);

export const escapeRegex = (value: string): string =>
    value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
