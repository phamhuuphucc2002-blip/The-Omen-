/* Arcanum Core bootstrap: one entry point for the production app. */
import { ArcanumApp } from './app-controller.js';

export function createArcanumApp({ baseUrl = '', storage = globalThis.localStorage } = {}) {
  return new ArcanumApp({ baseUrl, storage });
}

export async function bootArcanum(options = {}) {
  const app = createArcanumApp(options);
  if (!app.api.token) return { app, authenticated: false };
  try {
    await app.refresh();
    return { app, authenticated: true };
  } catch {
    await app.logout();
    return { app, authenticated: false };
  }
}
