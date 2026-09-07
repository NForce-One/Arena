export async function withMinDuration<T>(work: Promise<T>, ms: number): Promise<T> {
  const [value] = await Promise.all([work, new Promise((resolve) => setTimeout(resolve, ms))]);
  return value;
}
