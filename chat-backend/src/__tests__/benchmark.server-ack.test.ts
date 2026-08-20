import { serverAckKey, toServerAckResult } from '../benchmarks/server-ack.js';

describe('serverAckKey', () => {
    it('uses the exact string content as the key', () => {
        expect(serverAckKey({ recipient: 'u1', content: 'bmk:0:p:0:1', messageType: 'text' })).toBe(
            'bmk:0:p:0:1',
        );
    });

    it('marks non-string content as invalid', () => {
        expect(serverAckKey({ recipient: 'u1', content: 42, messageType: 'text' })).toBe(
            'invalid-content:42',
        );
    });

    it('marks a payload without content as invalid', () => {
        expect(serverAckKey({ recipient: 'u1' })).toBe('invalid-payload');
        expect(serverAckKey(null)).toBe('invalid-payload');
        expect(serverAckKey('garbage')).toBe('invalid-payload');
    });
});

describe('toServerAckResult', () => {
    it('normalizes a success message with string ids', () => {
        const result = toServerAckResult({
            message: {
                id: 'msg-1',
                content: 'bmk:0:p:0:1',
                sender: { id: 'u0' },
                recipient: { id: 'u1' },
            },
        });

        expect(result).toEqual({
            kind: 'success',
            messageId: 'msg-1',
            content: 'bmk:0:p:0:1',
            senderId: 'u0',
            recipientId: 'u1',
        });
    });

    it('stringifies mongoose-style ObjectId ids observed server-side', () => {
        const objectId = { toString: () => '507f1f77bcf86cd799439011' };
        const result = toServerAckResult({
            message: {
                id: objectId,
                content: 'bmk:0:p:0:1',
                sender: { _id: objectId },
                recipient: { id: 'u1' },
            },
        });

        expect(result).toEqual({
            kind: 'success',
            messageId: '507f1f77bcf86cd799439011',
            content: 'bmk:0:p:0:1',
            senderId: '507f1f77bcf86cd799439011',
            recipientId: 'u1',
        });
    });

    it('keeps the exact error string', () => {
        expect(toServerAckResult({ error: 'Recipient does not exist' })).toEqual({
            kind: 'error',
            error: 'Recipient does not exist',
        });
    });

    it('fails closed on malformed ack payloads', () => {
        expect(toServerAckResult(undefined).kind).toBe('error');
        expect(toServerAckResult(null).kind).toBe('error');
        expect(toServerAckResult('nope').kind).toBe('error');
        expect(toServerAckResult({}).kind).toBe('error');
        expect(toServerAckResult({ message: { content: 'missing ids' } }).kind).toBe('success');
    });
});
