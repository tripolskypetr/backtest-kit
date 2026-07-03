interface IWordForm {
  one: string;
  two?: string;
  many: string;
}

export const wordForm = (value: number, {
  one,
  many,
  two = many,
}: IWordForm) => {

  const getWord = () => {
    const abs = Math.abs(Math.trunc(value))
    // 11–14 в любой сотне (11, 111, 211…) — форма "many"
    if (abs % 100 >= 11 && abs % 100 <= 14) return many
    const lastDigit = abs % 10
    if (lastDigit === 1) return one
    if (lastDigit >= 2 && lastDigit <= 4) return two
    return many
  };

  return `${getWord()}`;
};

export default wordForm;
