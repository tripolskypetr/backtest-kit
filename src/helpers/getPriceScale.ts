/**
 * Derives the number of decimal places to show for a price based on the
 * magnitude of its integer part. Larger prices need fewer decimals; sub-dollar
 * prices keep full precision.
 * @param value - The price to derive the decimal scale for
 * @returns The number of digits after the decimal point
 */
export const getPriceScale = (value: number): number => {
    const abs = Math.abs(value);
    if (abs >= 1) {
        // 1..9 -> 4, 10..99 -> 3, 100..999 -> 2, 1000+ -> 2 (floor), capped at 2
        const digits = Math.floor(Math.log10(abs)) + 1;
        return Math.max(2, 6 - digits);
    }
    // Sub-dollar prices need more precision.
    return 8;
};

export default getPriceScale;
