import { createArcanumApp } from '../core/bootstrap.js';

const core = createArcanumApp({ baseUrl: '', storage: globalThis.localStorage });
globalThis.arcanumCore = core;

globalThis.arcanumCoreReady = (async () => {
  if (core.api.token) {
    try {
      await core.refresh();
      document.dispatchEvent(new CustomEvent('arcanum:ready', { detail: core.state }));
    } catch {
      core.api.token = '';
      document.dispatchEvent(new CustomEvent('arcanum:auth-required'));
    }
  }
  return core;
})();

window.addEventListener('load', () => {
  const originalLogin = globalThis.login;
  const originalLogout = globalThis.logout;
  globalThis.login = async function () {
    const username = document.getElementById('loginUser')?.value.trim();
    const password = document.getElementById('loginPass')?.value || '';
    const msg = document.getElementById('loginMsg');
    if (!username || !password) { if (msg) msg.textContent = 'Vui lòng nhập đầy đủ thông tin.'; return; }
    try {
      await core.login({ username, password });
      document.getElementById('loginGate')?.classList.add('hidden');
      document.getElementById('appShell')?.classList.remove('hidden');
      if (typeof globalThis.startApp === 'function') await globalThis.startApp();
    } catch (error) {
      if (msg) msg.textContent = `Đăng nhập thất bại: ${error.message}`;
    }
  };

  globalThis.logout = async function (callServer = true) {
    if (callServer) { try { await core.logout(); } catch {} }
    else { core.api.token = ''; }
    document.getElementById('appShell')?.classList.add('hidden');
    document.getElementById('loginGate')?.classList.remove('hidden');
  };

  document.dispatchEvent(new CustomEvent('arcanum:core-attached', { detail: core }));
});
