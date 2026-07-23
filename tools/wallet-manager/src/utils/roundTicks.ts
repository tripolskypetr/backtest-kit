export const roundTicks = (price: string | number, tickSize: number) => {
    const formatter = new Intl.NumberFormat('en-US', {
        style: 'decimal',
        minimumFractionDigits: 0,
        maximumFractionDigits: 8
    });
    // @ts-ignore
    const precision = formatter.format(tickSize).split('.')[1].length || 0;
    if (typeof price === 'string') price = parseFloat(price);
    return price.toFixed(precision);
};
