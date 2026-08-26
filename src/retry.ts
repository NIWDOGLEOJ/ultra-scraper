// Only transient network conditions are worth a second attempt. DNS and TLS failures are permanent,
// and retrying them just doubles the wait before the same error.
const TRANSIENT = /timeout|timed out|econnreset|etimedout|socket hang up|net::ERR_(?:CONNECTION_(?:RESET|CLOSED|ABORTED|REFUSED)|TIMED_OUT|EMPTY_RESPONSE|NETWORK_CHANGED)/i;
const PERMANENT = /ERR_NAME_NOT_RESOLVED|ENOTFOUND|ERR_CERT|ERR_SSL|ERR_BAD_SSL|ERR_ABORTED|ERR_BLOCKED/i;

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const isTransient = (error: unknown): boolean => {
  const message = messageOf(error);
  return !PERMANENT.test(message) && TRANSIENT.test(message);
};

export async function retryOnce<T>(operation: () => Promise<T>, backoffMs = 600): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (!isTransient(error)) throw error;
    await pause(backoffMs);
    return operation();
  }
}
