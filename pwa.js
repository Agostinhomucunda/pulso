(() => {
  const standalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  let deferredInstallPrompt = null;
  let isOnline = navigator.onLine;

  const networkBanner = document.createElement('aside');
  networkBanner.className = 'pwa-network-banner';
  networkBanner.setAttribute('role', 'status');
  networkBanner.setAttribute('aria-live', 'polite');
  networkBanner.hidden = true;

  const networkCopy = document.createElement('span');
  networkCopy.textContent = 'Sem ligação à internet. Liga-te para usar as oportunidades e a tua conta.';
  const retryButton = document.createElement('button');
  retryButton.type = 'button';
  retryButton.textContent = 'Verificar';
  networkBanner.append(networkCopy, retryButton);

  const installButton = document.createElement('button');
  installButton.className = 'pwa-install-button';
  installButton.type = 'button';
  installButton.textContent = 'Instalar PULSO';
  installButton.hidden = true;

  const installHelp = document.createElement('aside');
  installHelp.className = 'pwa-install-help';
  installHelp.setAttribute('role', 'status');
  installHelp.hidden = true;
  installHelp.innerHTML = '<span>Para instalar no iPhone ou iPad: toca em <b>Partilhar</b> e escolhe <b>Adicionar ao ecrã principal</b>.</span><button type="button" aria-label="Fechar instruções">×</button>';
  installHelp.querySelector('button').addEventListener('click', () => { installHelp.hidden = true; });

  document.addEventListener('DOMContentLoaded', () => {
    document.body.append(networkBanner, installButton, installHelp);
  }, { once: true });

  function showConnectionState(online) {
    isOnline = online;
    networkBanner.hidden = online;
    installButton.hidden = online || (!deferredInstallPrompt && !isAppleMobile()) || standalone;
  }

  async function checkConnection() {
    if (!navigator.onLine) {
      showConnectionState(false);
      return;
    }
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 4500);
    try {
      const probe = new URL('./manifest.webmanifest', document.baseURI);
      probe.searchParams.set('__pwa_check', String(Date.now()));
      const response = await fetch(probe, { cache: 'no-store', signal: controller.signal });
      showConnectionState(response.ok);
    } catch {
      showConnectionState(false);
    } finally {
      window.clearTimeout(timeout);
    }
  }

  function isAppleMobile() {
    return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  }

  retryButton.addEventListener('click', () => { void checkConnection(); });
  window.addEventListener('offline', () => showConnectionState(false));
  window.addEventListener('online', () => { void checkConnection(); });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void checkConnection();
  });

  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    deferredInstallPrompt = event;
    installButton.hidden = standalone || !isOnline;
  });
  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    installButton.hidden = true;
    installHelp.hidden = true;
  });

  installButton.addEventListener('click', async () => {
    if (deferredInstallPrompt) {
      deferredInstallPrompt.prompt();
      const result = await deferredInstallPrompt.userChoice;
      if (result?.outcome === 'accepted') installButton.hidden = true;
      deferredInstallPrompt = null;
      return;
    }
    if (isAppleMobile()) installHelp.hidden = false;
  });

  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    navigator.serviceWorker.register(new URL('./sw.js', document.baseURI), {
      scope: new URL('./', document.baseURI).pathname,
      updateViaCache: 'none'
    }).catch(error => console.warn('PULSO PWA: service worker não registado.', error));
  }

  void checkConnection();
  window.setInterval(() => {
    if (document.visibilityState === 'visible') void checkConnection();
  }, 30000);
})();
