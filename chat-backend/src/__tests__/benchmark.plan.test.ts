import {
    buildPlan,
    groupPlanByClient,
    makeMessageKey,
    parseMessageKey,
} from '../benchmarks/plan.js';

describe('benchmark message keys', () => {
    it('round-trips every key component', () => {
        const key = makeMessageKey({ runIndex: 2, profileName: '25-clients-1000-messages', clientIndex: 7, seq: 13 });

        expect(parseMessageKey(key)).toEqual({
            runIndex: 2,
            profileName: '25-clients-1000-messages',
            clientIndex: 7,
            seq: 13,
        });
    });

    it.each([
        'not-a-benchmark-key',
        'bmk:0:profile:0',
        'bmk:0:profile:0:1:extra',
        'bmk:0::0:1',
        'bmk:x:profile:0:1',
        'bmk:0:profile:-1:1',
        'bmk:0:profile:0:1.5',
    ])('rejects malformed content (%s)', (content) => {
        expect(parseMessageKey(content)).toBeNull();
    });
});

describe('buildPlan', () => {
    const profile = { name: 'test-profile', clients: 3, messages: 10 };
    const userIds = ['u0', 'u1', 'u2'];

    it('builds a deterministic ring plan with the configured message total', () => {
        const plan = buildPlan(profile, 0, userIds);

        expect(plan).toHaveLength(10);
        expect(plan.map((message) => message.clientIndex)).toEqual([
            0, 0, 0, 0,
            1, 1, 1,
            2, 2, 2,
        ]);
        for (let i = 0; i < plan.length; i++) {
            const message = plan[i]!;
            expect(message.senderUserId).toBe(`u${message.clientIndex}`);
            expect(message.recipientUserId).toBe(`u${(message.clientIndex + 1) % profile.clients}`);
            expect(message.content).toBe(message.key);
            expect(parseMessageKey(message.content)).not.toBeNull();
        }
        expect(new Set(plan.map((message) => message.key)).size).toBe(10);
    });

    it('divides messages evenly when the total is divisible by client count', () => {
        const plan = buildPlan({ name: 'even', clients: 2, messages: 4 }, 1, ['a', 'b']);

        expect(plan).toHaveLength(4);
        expect(plan.filter((message) => message.clientIndex === 0)).toHaveLength(2);
        expect(plan.filter((message) => message.clientIndex === 1)).toHaveLength(2);
    });

    it('rejects profiles with fewer than two clients', () => {
        expect(() => buildPlan({ name: 'single', clients: 1, messages: 5 }, 0, ['u0'])).toThrow(
            'at least 2 clients',
        );
    });

    it('rejects plans whose user count does not match the profile', () => {
        expect(() => buildPlan(profile, 0, ['u0', 'u1'])).toThrow('expects 3 users');
    });

    it('keeps run index and profile name in every key', () => {
        const plan = buildPlan({ name: 'run-key-profile', clients: 2, messages: 2 }, 2, ['a', 'b']);

        for (const message of plan) {
            const parsed = parseMessageKey(message.key);
            expect(parsed).not.toBeNull();
            expect(parsed!.runIndex).toBe(2);
            expect(parsed!.profileName).toBe('run-key-profile');
        }
    });
});

describe('groupPlanByClient', () => {
    it('groups messages by client while preserving serial order', () => {
        const plan = buildPlan({ name: 'grouped', clients: 2, messages: 5 }, 0, ['a', 'b']);
        const grouped = groupPlanByClient(plan);

        expect(grouped.size).toBe(2);
        expect(grouped.get(0)!.map((message) => message.seq)).toEqual([0, 1, 2]);
        expect(grouped.get(1)!.map((message) => message.seq)).toEqual([0, 1]);
    });
});
