const SIGNAL_BASE_URL = process.env.SIGNAL_BASE_URL || 'https://signal.binaryworks.app';
const FETCH_TIMEOUT_MS = Number(process.env.SIGNAL_FETCH_TIMEOUT_MS || 5000);
const RETRY_COUNT = Math.min(5, Math.max(0, Number(process.env.SIGNAL_RETRY_COUNT || 2)));

interface SignalApiRequestOptions {
  searchParams?: Record<string, string | number | undefined>;
}

function getSignalApiKey() {
  const apiKey = process.env.SIGNAL_API_KEY;
  if (!apiKey) {
    throw new Error('SIGNAL_API_KEY is not configured');
  }
  return apiKey;
}

function wait(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function shouldRetryStatus(status: number) {
  return status === 429 || status >= 500;
}

export async function requestSignalApi<T>(
  path: string,
  options: SignalApiRequestOptions = {}
): Promise<T> {
  const apiKey = getSignalApiKey();
  const url = new URL(path, SIGNAL_BASE_URL);
  const { searchParams } = options;

  if (searchParams) {
    Object.entries(searchParams).forEach(([key, value]) => {
      if (value !== undefined && value !== '') {
        url.searchParams.set(key, String(value));
      }
    });
  }

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= RETRY_COUNT; attempt += 1) {
    try {
      const response = await fetch(url.toString(), {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        next: { revalidate: 300 },
      });

      if (response.ok) {
        return (await response.json()) as T;
      }

      const body = await response.text();
      const reason = body.slice(0, 160) || response.statusText || 'Unknown error';
      const error = new Error(`Signal API request failed: ${response.status} ${reason}`);

      if (attempt < RETRY_COUNT && shouldRetryStatus(response.status)) {
        await wait(250 * 2 ** attempt);
        continue;
      }

      lastError = error;
      break;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Signal API unknown error');
      if (attempt < RETRY_COUNT) {
        await wait(250 * 2 ** attempt);
        continue;
      }
      break;
    }
  }

  throw lastError || new Error('Signal API request failed');
}
