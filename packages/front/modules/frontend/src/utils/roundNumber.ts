export const roundNumber = (value: number, digits = 2) => {
  let multiplier = 1;
  for (let i = 0; i < digits; i++) {
    multiplier *= 10;
  }
  return Math.round(value * multiplier) / multiplier;
};

export default roundNumber;
