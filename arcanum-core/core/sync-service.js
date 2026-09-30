/* Arcanum Core — server-authoritative synchronization coordinator. */

export class SyncService {
  constructor({ api, engine, deviceId }) {
    this.api = api;
    this.engine = engine;
    this.deviceId = deviceId || engine?.deviceId;
  }

  async bootstrap() {
    const user = await this.api.me();
    const [knowledge, categories, books, history] = await Promise.all([
      this.api.knowledge(), this.api.categories(), this.api.books(), this.api.history()
    ]);
    return { user, knowledge, categories, books, history, deviceId: this.deviceId };
  }

  async saveKnowledge(data) {
    const saved = await this.api.createKnowledge(data);
    return saved;
  }

  async updateKnowledge(id, data) {
    return this.api.updateKnowledge(id, data);
  }

  async refreshKnowledge(search = '') {
    return this.api.knowledge(search);
  }
}
