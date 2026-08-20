import { median, percentile, toMiB } from '../benchmarks/metrics.js';

describe('benchmark metrics', () => {
    it('computes the median for odd-length inputs', () => {
        expect(median([3, 1, 2])).toBe(2);
    });

    it('computes the median for even-length inputs', () => {
        expect(median([4, 1, 3, 2])).toBe(2.5);
    });

    it('returns null for an empty input', () => {
        expect(median([])).toBeNull();
    });

    it('computes nearest-rank percentiles', () => {
        const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
        expect(percentile(values, 50)).toBe(5);
        expect(percentile(values, 95)).toBe(10);
        expect(percentile(values, 100)).toBe(10);
    });

    it('returns null for empty or invalid percentile inputs', () => {
        expect(percentile([], 95)).toBeNull();
        expect(percentile([1, 2], 0)).toBeNull();
        expect(percentile([1, 2], 101)).toBeNull();
    });

    it('converts bytes to MiB', () => {
        expect(toMiB(1024 * 1024)).toBe(1);
        expect(toMiB(0)).toBe(0);
    });
});
