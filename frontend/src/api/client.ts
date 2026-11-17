// Set while a viewer is signed in. Mutations are refused here as well as on
// the server, so a click-to-edit field fails immediately instead of sending
// a change. Login and logout stay allowed.
let readOnlyClient = false;
const READ_ONLY_ALLOWED = new Set(['/auth/login', '/auth/logout']);

export function setApiReadOnly(value: boolean) {
  readOnlyClient = value;
}

export function isApiReadOnly(): boolean {
  return readOnlyClient;
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let message = res.statusText;
    try {
      const body = await res.json();
      if (typeof body.detail === 'string') {
        message = body.detail;
      } else if (Array.isArray(body.detail) && body.detail[0]?.msg) {
        // FastAPI/pydantic validation errors come back as a list of {msg, loc, type}
        message = body.detail[0].msg;
      }
    } catch {
      // no JSON body
    }
    throw new ApiError(res.status, message);
  }

  if (res.status === 204) return undefined as T;
  return res.json();
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const method = (options.method || 'GET').toUpperCase();
  const bare = path.split('?')[0];
  if (readOnlyClient && method !== 'GET' && method !== 'HEAD' && !READ_ONLY_ALLOWED.has(bare)) {
    throw new ApiError(403, 'This account is read-only.');
  }
  const res = await fetch(`/api${path}`, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    ...options,
  });
  return handleResponse<T>(res);
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: body !== undefined ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PATCH', body: body !== undefined ? JSON.stringify(body) : undefined }),
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PUT', body: body !== undefined ? JSON.stringify(body) : undefined }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
  // No Content-Type header here -- the browser sets the multipart boundary itself
  // when the body is a FormData instance; setting it manually would break the upload.
  postForm: <T>(path: string, formData: FormData) => {
    if (readOnlyClient) return Promise.reject(new ApiError(403, 'This account is read-only.'));
    return fetch(`/api${path}`, { method: 'POST', credentials: 'include', body: formData }).then((res) => handleResponse<T>(res));
  },
};
