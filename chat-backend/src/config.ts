import type { CorsOptions } from 'cors';

export const REQUIRED_ENV_VARS = ['MONGO_URL', 'JWT_SECRET', 'CLIENT_ORIGIN'] as const;

export type RequiredEnvVar = (typeof REQUIRED_ENV_VARS)[number];

// CLIENT_ORIGIN is a comma-separated list of exact origins, e.g.
// "https://app.example.com,https://admin.example.com". Entries are trimmed so
// accidental whitespace does not silently widen or narrow the allowlist.
export const parseClientOrigins = (raw: string | undefined): string[] =>
    (raw ?? '')
        .split(',')
        .map((origin) => origin.trim())
        .filter((origin) => origin.length > 0);

export const getClientOrigins = (env: NodeJS.ProcessEnv = process.env): string[] =>
    parseClientOrigins(env.CLIENT_ORIGIN);

export const getMissingRequiredEnvVars = (
    env: NodeJS.ProcessEnv = process.env,
): RequiredEnvVar[] =>
    REQUIRED_ENV_VARS.filter((name) => {
        const value = env[name];
        return typeof value !== 'string' || value.trim().length === 0;
    });

export const validateRequiredConfig = (env: NodeJS.ProcessEnv = process.env): void => {
    const missing = getMissingRequiredEnvVars(env);
    if (missing.length > 0) {
        throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
    }
};

// Requests without an Origin header (server-to-server tools, curl, tests) are
// allowed; browser requests must match an exact configured origin.
export const isAllowedOrigin = (origin: string | undefined, allowedOrigins: string[]): boolean => {
    if (!origin) return true;
    return allowedOrigins.includes(origin);
};

export const createCorsOriginCallback =
    (allowedOrigins: string[]) =>
    (origin: string | undefined, callback: (error: Error | null, allow?: boolean) => void): void => {
        if (isAllowedOrigin(origin, allowedOrigins)) {
            callback(null, true);
            return;
        }
        callback(new Error('Not allowed by CORS'));
    };

export const getCorsOptions = (env: NodeJS.ProcessEnv = process.env): CorsOptions => ({
    credentials: true,
    origin: createCorsOriginCallback(getClientOrigins(env)),
});
