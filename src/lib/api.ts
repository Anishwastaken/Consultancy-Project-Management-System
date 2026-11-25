export const TOKEN_KEY = 'cpts.token'

/** Thrown when the server can't be reached or answers with something that isn't the API. */
export class NetworkError extends Error {}

export interface ApiResponse<T> {
  status: number
  data: T
}

export async function api<T = Record<string, unknown>>(path: string, opts: { method?: 'GET' | 'POST'; body?: unknown; token?: string | null } = {}): Promise<ApiResponse<T>> {
  let res: Response
  try {
    res = await fetch(path, {
      method: opts.method ?? 'GET',
      headers: {
        ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: AbortSignal.timeout(5000),
    })
  } catch {
    throw new NetworkError('Server unreachable')
  }
  // A dev proxy with no API behind it answers 5xx with a non-JSON body; the API
  // itself always answers JSON, even for errors such as a failed e-mail send.
  try {
    return { status: res.status, data: (await res.json()) as T }
  } catch {
    throw new NetworkError(res.status >= 500 ? 'Server error' : 'Unexpected response')
  }
}
