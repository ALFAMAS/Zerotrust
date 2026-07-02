# UI HTTP client boundary

The canonical UI-to-API boundary for new code is `packages/ui/src/lib/apiClient.ts`.

Use these helpers instead of raw `fetch()` or ad-hoc Authorization header wiring:

| Operation | Helper |
| --- | --- |
| JSON GET | `apiGet<T>(path, options?)` |
| JSON POST | `apiPost<T>(path, body, options?)` |
| JSON PATCH | `apiPatch<T>(path, body, options?)` |
| JSON PUT | `apiPut<T>(path, body, options?)` |
| JSON DELETE | `apiDelete<T>(path, options?)` |
| FormData upload | `apiPostFormData<T>(path, formData, options?)` |
| Blob/export download | `apiGetBlob(path, options?)` |

`apiClient.ts` owns the shared browser HTTP behavior: configured API origin, Bearer-token attachment, optional `skipAuth`, timeout, transient 5xx/network retry, refresh-token replay, and consistent `{ message, code, status }` errors.

`packages/ui/src/lib/api.ts` remains as the legacy compatibility facade used by older dashboard/admin pages. Do not add new call sites to it. When touching an older page for feature work, prefer migrating the touched calls to the `apiClient.ts` helper that matches the HTTP method. The `useApi` / `usePaginatedApi` hooks now use `apiClient.ts` internally, so new data-loading pages can avoid hand-rolled `useEffect + api.get + loading` boilerplate.

Raw `fetch()` remains acceptable only for non-API browser primitives such as `EventSource`, external SDKs, or server components that cannot import client-side auth helpers.
