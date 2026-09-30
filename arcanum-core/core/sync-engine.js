/*
 * Arcanum Core — deterministic synchronization engine.
 *
 * Server is authoritative. Every mutation carries:
 *   entityId, version, updatedAt, deviceId, operationId, payload
 *
 * Rules:
 * 1. operationId is idempotent: replaying the same mutation is harmless.
 * 2. Higher version wins.
 * 3. Same version is resolved by updatedAt, then operationId as a stable tie-breaker.
 * 4. Deletes are tombstones, never silent local deletion.
 * 5. A client pulls the server cursor before pushing queued mutations.
 * 6. After push, the client pulls again so every device converges to server state.
 */

export class SyncEngine {
  constructor({ deviceId, clock = () => Date.now() } = {}) {
    if (!deviceId) throw new Error('deviceId is required');
    this.deviceId = deviceId;
    this.clock = clock;
    this.queue = new Map();
    this.cursor = 0;
  }

  createMutation({ entityType, entityId, version, payload, deleted = false }) {
    if (!entityType || !entityId) throw new Error('entityType and entityId are required');
    if (!Number.isInteger(version) || version < 1) throw new Error('version must be a positive integer');
    const operationId = `${this.deviceId}:${entityType}:${entityId}:${version}:${cryptoRandom()}`;
    const mutation = {
      operationId,
      deviceId: this.deviceId,
      entityType,
      entityId,
      version,
      updatedAt: this.clock(),
      deleted: Boolean(deleted),
      payload: deleted ? null : payload
    };
    this.queue.set(operationId, mutation);
    return mutation;
  }

  pending() {
    return [...this.queue.values()];
  }

  acknowledge(operationIds = []) {
    for (const id of operationIds) this.queue.delete(id);
  }

  applyRemote(local, remote) {
    if (!remote || local?.operationId === remote.operationId) return local;
    if (!local) return remote;
    if (remote.version !== local.version) return remote.version > local.version ? remote : local;
    if (remote.updatedAt !== local.updatedAt) return remote.updatedAt > local.updatedAt ? remote : local;
    return String(remote.operationId) > String(local.operationId) ? remote : local;
  }

  merge(localEntities, remoteEntities) {
    const result = new Map(localEntities.map(x => [key(x), x]));
    for (const remote of remoteEntities) {
      const k = key(remote);
      result.set(k, this.applyRemote(result.get(k), remote));
    }
    return [...result.values()].sort((a, b) =>
      String(a.entityType).localeCompare(String(b.entityType)) ||
      String(a.entityId).localeCompare(String(b.entityId))
    );
  }

  advanceCursor(nextCursor) {
    if (Number.isFinite(nextCursor) && nextCursor >= this.cursor) this.cursor = nextCursor;
    return this.cursor;
  }

  planSync(remoteEntities = [], nextCursor = this.cursor) {
    const pending = this.pending();
    const merged = this.merge(pending, remoteEntities);
    return { cursor: this.advanceCursor(nextCursor), pending, merged };
  }
}

function key(x) {
  return `${x.entityType}:${x.entityId}`;
}

function cryptoRandom() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function makeDeviceId(storage = globalThis.localStorage) {
  if (!storage) return `device-${Date.now()}-${cryptoRandom()}`;
  const keyName = 'arcanum_device_id';
  let id = storage.getItem(keyName);
  if (!id) {
    id = `device-${Date.now()}-${cryptoRandom()}`;
    storage.setItem(keyName, id);
  }
  return id;
}
