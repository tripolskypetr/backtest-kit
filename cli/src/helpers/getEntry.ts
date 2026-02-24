export const getEntry = (metaUrl: string): boolean => {
  return process.argv[1] === new URL(metaUrl).pathname
}

export default getEntry;
