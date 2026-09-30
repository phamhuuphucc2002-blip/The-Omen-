/* Arcanum Core Sync Protocol
 * Server-authoritative, authenticated, idempotent synchronization contract.
 */

export const SYNC_PROTOCOL_VERSION = 1;

export function createSyncRequest({ token, deviceId, cursor = 0, mutations = [] }) {
  if (!token) throw new Error('Authentication token required');
  if (!deviceId) throw new Error('deviceId required');
  return {
    protocolVersion: SYNC_PROTOCOL_VERSION,
    deviceId,
    cursor: Number.isFinite(Number(cursor)) ? Number(cursor) : 0,
    mutations: mutations.map(normalizeMutation)
  };
}

export function normalizeMutation(mutation) {
  if (!mutation?.operationId || !mutation?.entityType || !mutation?.entityId) {
    throw new Error('Invalid mutation');
  }
  return {
    operationId: String(mutation.operationId),
    deviceId: String(mutation.deviceId),
    entityType: String(mutation.entityType),
    entityId: String(mutation.entityId),
    version: Math.max(1, Number(mutation.version) || 1),
    updatedAt: Number(mutation.updatedAt) || Date.now(),
    deleted: Boolean(mutation.deleted),
    payload: mutation.deleted ? null : (mutation.payload ?? null)
  };
}

export function buildSyncResult({ cursor, accepted = [], rejected = [], entities = [] }) {
  return {
    protocolVersion: SYNC_PROTOCOL_VERSION,
    cursor: Number(cursor) || 0,
    accepted: [...new Set(accepted)],
    rejected,
    entities
  };
}
