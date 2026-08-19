import {
    createCorsOriginCallback,
    getClientOrigins,
    getMissingRequiredEnvVars,
    isAllowedOrigin,
    parseClientOrigins,
    validateRequiredConfig,
} from '../config.js';

describe('client origin parsing', () => {
    it('parses comma-separated exact origins and trims whitespace', () => {
        expect(parseClientOrigins('http://a.example, https://b.example,http://c.example ,'))
            .toEqual(['http://a.example', 'https://b.example', 'http://c.example']);
    });

    it('returns an empty list for missing or blank values', () => {
        expect(parseClientOrigins(undefined)).toEqual([]);
        expect(parseClientOrigins('')).toEqual([]);
        expect(parseClientOrigins(' ,  ')).toEqual([]);
    });

    it('reads CLIENT_ORIGIN from the environment', () => {
        expect(getClientOrigins({ CLIENT_ORIGIN: 'http://x.example, http://y.example' } as NodeJS.ProcessEnv))
            .toEqual(['http://x.example', 'http://y.example']);
    });
});

describe('required config validation', () => {
    it('reports every missing required variable', () => {
        expect(getMissingRequiredEnvVars({ MONGO_URL: 'mongodb://localhost' } as NodeJS.ProcessEnv))
            .toEqual(['JWT_SECRET', 'CLIENT_ORIGIN']);
    });

    it('passes when all required variables are set', () => {
        expect(() =>
            validateRequiredConfig({
                MONGO_URL: 'mongodb://localhost',
                JWT_SECRET: 'secret',
                CLIENT_ORIGIN: 'http://localhost:3000',
            } as NodeJS.ProcessEnv),
        ).not.toThrow();
    });

    it('treats blank values as missing and throws a clear error', () => {
        expect(() =>
            validateRequiredConfig({
                MONGO_URL: ' ',
                JWT_SECRET: '',
                CLIENT_ORIGIN: 'http://localhost:3000',
            } as NodeJS.ProcessEnv),
        ).toThrow('Missing required environment variables: MONGO_URL, JWT_SECRET');
    });
});

describe('CORS origin policy', () => {
    const decide = (origin: string | undefined, allowedOrigins: string[]): Promise<boolean> =>
        new Promise((resolve) => {
            createCorsOriginCallback(allowedOrigins)(origin, (error, allow) => {
                resolve(!error && allow === true);
            });
        });

    it('allows no-Origin clients even when the allowlist is empty', async () => {
        expect(isAllowedOrigin(undefined, [])).toBe(true);
        expect(await decide(undefined, [])).toBe(true);
    });

    it('allows exact listed origins and rejects unlisted browser origins', async () => {
        const allowedOrigins = ['http://localhost:3000', 'https://app.example.com'];

        expect(await decide('http://localhost:3000', allowedOrigins)).toBe(true);
        expect(await decide('https://app.example.com', allowedOrigins)).toBe(true);
        expect(await decide('http://evil.example', allowedOrigins)).toBe(false);
        // substring/prefix matches must not pass an exact-origin allowlist
        expect(await decide('http://localhost:3000.evil.example', allowedOrigins)).toBe(false);
    });
});
