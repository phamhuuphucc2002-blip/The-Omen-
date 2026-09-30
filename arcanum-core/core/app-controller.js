/* Arcanum Core application controller.
 * Centralizes authentication, bootstrap, knowledge, books, translations,
 * history and device operations behind the API client.
 */
import { ArcanumApiClient } from './arcanum-api-client.js';
import { SyncEngine, makeDeviceId } from './sync-engine.js';
import { SyncService } from './sync-service.js';

export class ArcanumApp {
  constructor({ baseUrl = '', storage = globalThis.localStorage } = {}) {
    this.storage = storage;
    this.api = new ArcanumApiClient({ baseUrl, storage });
    this.engine = new SyncEngine({ deviceId: makeDeviceId(storage), storage });
    this.sync = new SyncService({ api: this.api, engine: this.engine, deviceId: this.engine.deviceId });
    this.state = { user: null, knowledge: [], categories: [], books: [], history: [], devices: [] };
  }

  get authenticated() { return Boolean(this.api.token && this.state.user); }

  async login(credentials) {
    this.state.user = await this.api.login({ ...credentials, deviceName: credentials.deviceName || this.deviceName() });
    await this.refresh();
    return this.state.user;
  }

  async refresh() {
    const data = await this.sync.bootstrap();
    this.state = { ...this.state, ...data };
    this.state.devices = await this.api.devices();
    return this.state;
  }

  async logout() {
    await this.api.logout();
    this.state = { user: null, knowledge: [], categories: [], books: [], history: [], devices: [] };
  }

  async addKnowledge(data) {
    const result = await this.sync.saveKnowledge(data);
    await this.refresh();
    return result;
  }

  async updateKnowledge(id, data) {
    const result = await this.sync.updateKnowledge(id, data);
    await this.refresh();
    return result;
  }

  async addBook(data) {
    const result = await this.api.createBook(data);
    await this.refresh();
    return result;
  }

  async addTranslation(bookId, data) {
    const result = await this.api.addTranslation(bookId, data);
    await this.refresh();
    return result;
  }

  async searchKnowledge(query = '') {
    this.state.knowledge = await this.api.knowledge(query);
    return this.state.knowledge;
  }

  deviceName() {
    return `${globalThis.navigator?.platform || 'Device'} / Arcanum`;
  }
}
