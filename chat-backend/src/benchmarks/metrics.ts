const sortedAscending = (values: readonly number[]): number[] => [...values].sort((a, b) => a - b);
/** Median of the input values, or null when there are none. */
export const median = (values: readonly number[]): number | null => {
    if (values.length === 0) return null;
    const sorted = sortedAscending(values);
    const middle = Math.floor(sorted.length / 2);
    if (sorted.length % 2 === 1) {
        return sorted[middle] as number;
    }
    return ((sorted[middle - 1] as number) + (sorted[middle] as number)) / 2;
};
/**
 * Nearest-rank percentile (0 < p <= 100) of the input values, or null when
 * there are none. Mirrors common performance-tooling conventions.
 */
export const percentile = (values: readonly number[], p: number): number | null => {
    if (values.length === 0 || p <= 0 || p > 100) return null;
    const sorted = sortedAscending(values);
    const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
    return sorted[index] as number;
};
export const toMiB = (bytes: number): number => bytes / (1024 * 1024);
