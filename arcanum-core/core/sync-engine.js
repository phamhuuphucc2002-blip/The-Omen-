/* Arcanum Core — deterministic, idempotent client synchronization engine. */

export class SyncEngine {
  constructor({ deviceId, clock = () => Date.now(), storage = globalThis.localStorage } = {}) {
    this.storage = storage;
    this.deviceId = deviceId || makeDeviceId(storage);
    this.clock = clock;
    this.queue = new Map();
    this.cursor = Number(storage?.getItem('arcanum_sync_cursor') || 0);
  }

  createMutation({ entityType, entityId, version, payload = null, deleted = false }) {
    if (!entityType || !entityId) throw new Error('entityType and entityId are required');
    if (!Number.isInteger(version) || version < 1) throw new Error('version must be a positive integer');
    const operationId = `${this.deviceId}:${cryptoRandom()}`;
    const mutation = Object.freeze({
      operationId, deviceId: this.deviceId, entityType, entityId, version,
      updatedAt: this.clock(), deleted: Boolean(deleted), payload: deleted ? null : payload
    });
    this.queue.set(operationId, mutation);
    return mutation;
  }

  pending() { return [...this.queue.values()]; }

  acknowledge(operationIds = []) {
    for (const operationId of operationIds) this.queue.delete(operationId);
  }

  applyRemote(local, remote) {
    if (!remote) return local;
    if (!local) return remote;
    if (local.operationId === remote.operationId) return local;
    if (remote.version !== local.version) return remote.version > local.version ? remote : local;
    if (remote.updatedAt !== local.updatedAt) return remote.updatedAt > local.updatedAt ? remote : local;
    return String(remote.operationId).localeCompare(String(local.operationId)) > 0 ? remote : local;
  }

  merge(localEntities = [], remoteEntities = []) {
    const result = new Map();
    for (const item of localEntities) result.set(key(item), item);
    for (const remote of remoteEntities) {
      const k = key(remote);
      result.set(k, this.applyRemote(result.get(k), remote));
    }
    return [...result.values()].sort(compareEntities);
  }

  advanceCursor(nextCursor) {
    const n = Number(nextCursor);
    if (Number.isFinite(n) && n >= this.cursor) {
      this.cursor = n;
      try { this.storage?.setItem('arcanum_sync_cursor', String(n)); } catch {}
    }
    return this.cursor;
  }

  planSync(remoteEntities = [], nextCursor = this.cursor) {
    const pending = this.pending();
    return { cursor: this.advanceCursor(nextCursor), pending, merged: this.merge(pending, remoteEntities) };
  }

  clear() {
    this.queue.clear();
    this.cursor = 0;
    try { this.storage?.removeItem('arcanum_sync_cursor'); } catch {}
  }
}

function key(x) { return `${x.entityType}:${x.entityId}`; }
function compareEntities(a, b) {
  return String(a.entityType).localeCompare(String(b.entityType)) || String(a.entityId).localeCompare(String(b.entityId));
}
function cryptoRandom() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function makeDeviceId(storage = globalThis.localStorage) {
  const keyName = 'arcanum_device_id';
  try {
    let id = storage?.getItem(keyName);
    if (!id) { id = `device-${cryptoRandom()}`; storage?.setItem(keyName, id); }
    return id;
  } catch {
    return `device-${cryptoRandom()}`;
  }
}
