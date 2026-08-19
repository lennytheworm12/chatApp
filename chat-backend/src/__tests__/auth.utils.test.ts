import { jest } from '@jest/globals';

describe('auth utils cookie options', () => {
    const originalNodeEnv = process.env.NODE_ENV;

    afterEach(() => {
        if (originalNodeEnv === undefined) {
            delete process.env.NODE_ENV;
        } else {
            process.env.NODE_ENV = originalNodeEnv;
        }
        jest.resetModules();
    });

    it('uses secure, sameSite=none cookies in production', async () => {
        process.env.NODE_ENV = 'production';
        jest.resetModules();

        const { getJwtCookieOptions, jwtCookieName, generateTokenAndSetCookie } =
            await import('../utils/auth.utils.js');

        const options = getJwtCookieOptions();
        expect(options.secure).toBe(true);
        expect(options.sameSite).toBe('none');

        const res = { cookie: jest.fn() };
        generateTokenAndSetCookie('some-user-id', res as never);

        expect(res.cookie).toHaveBeenCalledWith(
            jwtCookieName,
            expect.any(String),
            expect.objectContaining({ secure: true, sameSite: 'none' }),
        );
    });

    it('uses non-secure, sameSite=lax cookies outside production', async () => {
        process.env.NODE_ENV = 'test';
        jest.resetModules();

        const { getJwtCookieOptions } = await import('../utils/auth.utils.js');
        const options = getJwtCookieOptions();

        expect(options.secure).toBe(false);
        expect(options.sameSite).toBe('lax');
    });

    it('reads JWT_SECRET at call time instead of capturing it at import', async () => {
        process.env.NODE_ENV = 'test';
        jest.resetModules();

        const { generateTokenAndSetCookie } = await import('../utils/auth.utils.js');
        const res = { cookie: jest.fn() };
        const savedSecret = process.env.JWT_SECRET;

        try {
            delete process.env.JWT_SECRET;
            expect(() => generateTokenAndSetCookie('some-user-id', res as never)).toThrow(
                'JWT_SECRET is not configured',
            );

            process.env.JWT_SECRET = 'call-time-secret';
            generateTokenAndSetCookie('some-user-id', res as never);
            expect(res.cookie).toHaveBeenCalledWith(
                'jwt',
                expect.any(String),
                expect.objectContaining({ httpOnly: true }),
            );
        } finally {
            if (savedSecret === undefined) {
                delete process.env.JWT_SECRET;
            } else {
                process.env.JWT_SECRET = savedSecret;
            }
        }
    });
});
