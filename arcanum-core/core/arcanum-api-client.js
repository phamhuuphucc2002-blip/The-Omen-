/* Arcanum Core — authenticated API client.
 * Keeps credentials out of local data and makes the server authoritative.
 */

export class ArcanumApiClient {
  constructor({ baseUrl = '', storage = globalThis.localStorage } = {}) {
    this.baseUrl = String(baseUrl).replace(/\/$/, '');
    this.storage = storage;
    this.tokenKey = 'arcanum_auth_token';
  }

  get token() {
    try { return this.storage?.getItem(this.tokenKey) || ''; } catch { return ''; }
  }

  set token(value) {
    try {
      if (value) this.storage?.setItem(this.tokenKey, value);
      else this.storage?.removeItem(this.tokenKey);
    } catch {}
  }

  async request(path, options = {}) {
    const headers = new Headers(options.headers || {});
    if (!headers.has('Content-Type') && options.body && !(options.body instanceof FormData)) {
      headers.set('Content-Type', 'application/json');
    }
    if (this.token) headers.set('Authorization', `Bearer ${this.token}`);
    const response = await fetch(`${this.baseUrl}${path}`, { ...options, headers });
    let body = null;
    try { body = await response.json(); } catch {}
    if (!response.ok) {
      const error = new Error(body?.error || `Request failed (${response.status})`);
      error.status = response.status;
      error.body = body;
      throw error;
    }
    return body;
  }

  async login({ username, password, deviceName = 'Arcanum device' }) {
    const result = await this.request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password, deviceName })
    });
    this.token = result.token;
    return result.user;
  }

  async logout() {
    try { await this.request('/api/auth/logout', { method: 'POST' }); }
    finally { this.token = ''; }
  }

  async health() { return this.request('/api/health'); }
  async me() { return this.request('/api/me'); }
  async knowledge(search = '') { return this.request(`/api/knowledge?search=${encodeURIComponent(search)}`); }
  async createKnowledge(data) { return this.request('/api/knowledge', { method: 'POST', body: JSON.stringify(data) }); }
  async updateKnowledge(id, data) { return this.request(`/api/knowledge/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(data) }); }
  async versions(id) { return this.request(`/api/knowledge/${encodeURIComponent(id)}/versions`); }
  async categories() { return this.request('/api/categories'); }
  async books() { return this.request('/api/books'); }
  async createBook(data) { return this.request('/api/books', { method: 'POST', body: JSON.stringify(data) }); }
  async translations(bookId) { return this.request(`/api/books/${encodeURIComponent(bookId)}/translations`); }
  async addTranslation(bookId, data) { return this.request(`/api/books/${encodeURIComponent(bookId)}/translations`, { method: 'POST', body: JSON.stringify(data) }); }
  async history() { return this.request('/api/history'); }
  async devices() { return this.request('/api/devices'); }
}
