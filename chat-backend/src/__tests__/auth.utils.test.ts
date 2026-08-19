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

        const { jwtCookieOptions, jwtCookieName, generateTokenAndSetCookie } =
            await import('../utils/auth.utils.js');

        expect(jwtCookieOptions.secure).toBe(true);
        expect(jwtCookieOptions.sameSite).toBe('none');

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

        const { jwtCookieOptions } = await import('../utils/auth.utils.js');

        expect(jwtCookieOptions.secure).toBe(false);
        expect(jwtCookieOptions.sameSite).toBe('lax');
    });
});
