export const sanitize = {
  allowCustomElements: true,
  allowElements: ["text-underline", "blank-link"],
  allowAttributes: {
    href: ["blank-link"],
  },
};

export default sanitize;
