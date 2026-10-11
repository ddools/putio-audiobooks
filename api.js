// Thin put.io API v2 client. The API is CORS-enabled, so this runs
// straight from the browser with no backend.
const API = 'https://api.put.io/v2';

let token = null;
export const setToken = (t) => { token = t || null; };
export const hasToken = () => !!token;

export class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

async function call(path, { params = {}, method = 'GET', json, form } = {}) {
  const url = new URL(API + path);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set('oauth_token', token);
  const init = { method };
  if (json) {
    init.headers = { 'Content-Type': 'application/json' };
    init.body = JSON.stringify(json);
  } else if (form) {
    init.body = new URLSearchParams(form);
  }
  let res;
  try { res = await fetch(url, init); }
  catch { throw new ApiError(0, 'Can’t reach put.io. Check your connection.'); }
  if (!res.ok) {
    let msg = `put.io returned ${res.status}`;
    try { msg = (await res.json()).error_message || msg; } catch {}
    throw new ApiError(res.status, msg);
  }
  return res.json();
}

export function authUrl(clientId, redirectUri) {
  const u = new URL(API + '/oauth2/authenticate');
  u.searchParams.set('client_id', clientId);
  u.searchParams.set('response_type', 'token');
  u.searchParams.set('redirect_uri', redirectUri);
  return u.toString();
}

export const accountInfo = () => call('/account/info');

// Every file in a folder, following the cursor past 1000 items.
export async function listFiles(parentId) {
  const first = await call('/files/list', { params: { parent_id: parentId, per_page: 1000 } });
  const files = first.files || [];
  let cursor = first.cursor;
  while (cursor) {
    const next = await call('/files/list/continue', { method: 'POST', form: { cursor, per_page: 1000 } });
    files.push(...(next.files || []));
    cursor = next.cursor;
  }
  return { files, parent: first.parent };
}

// A direct, streamable URL for a file. Tied to the caller's IP address.
export const fileUrl = async (id) => (await call(`/files/${id}/url`)).url;

// Per-app key/value storage on put.io. Used to sync listening positions.
export const getConfig = async () => (await call('/config')).config || {};
export const setConfig = (key, value) =>
  call(`/config/${encodeURIComponent(key)}`, { method: 'PUT', json: { value } });
