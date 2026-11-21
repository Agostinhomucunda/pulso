(() => {
  const INSTALLED_KEY = 'pulso-pwa-installed-v1';
  const DISMISSED_KEY = 'pulso-pwa-install-dismissed-v3';
  const displayMode = window.matchMedia('(display-mode: standalone)');
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

  const installCard = document.createElement('aside');
  installCard.className = 'pwa-install-card';
  installCard.id = 'pwaInstallNotice';
  installCard.setAttribute('aria-labelledby', 'pwaInstallTitle');
  installCard.setAttribute('aria-live', 'polite');
  installCard.hidden = true;

  const installCardIcon = document.createElement('span');
  installCardIcon.className = 'pwa-install-card-icon';
  installCardIcon.setAttribute('aria-hidden', 'true');
  installCardIcon.textContent = '↓';
  const installCardContent = document.createElement('span');
  installCardContent.className = 'pwa-install-card-content';
  const installTitle = document.createElement('strong');
  installTitle.id = 'pwaInstallTitle';
  installTitle.textContent = 'Acesso rápido ao PULSO';
  const installDescription = document.createElement('span');
  installDescription.className = 'pwa-install-description';
  installDescription.textContent = 'Se quiseres, instala a aplicação no teu dispositivo. O site continua disponível no navegador.';
  const installInstructions = document.createElement('span');
  installInstructions.className = 'pwa-install-instructions';
  installInstructions.hidden = true;
  installCardContent.append(installTitle, installDescription, installInstructions);

  const installCardControls = document.createElement('span');
  installCardControls.className = 'pwa-install-card-controls';
  const installButton = document.createElement('button');
  installButton.className = 'pwa-install-button';
  installButton.type = 'button';
  installButton.textContent = 'Instalar aplicação';
  const dismissButton = document.createElement('button');
  dismissButton.className = 'pwa-install-dismiss';
  dismissButton.type = 'button';
  dismissButton.setAttribute('aria-label', 'Fechar aviso de instalação');
  dismissButton.title = 'Fechar aviso';
  dismissButton.textContent = '×';
  installCardControls.append(installButton, dismissButton);
  installCard.append(installCardIcon, installCardContent, installCardControls);

  function showLaunchScreen() {
    const launchScreen = document.getElementById('pwaLaunchScreen');
    if (!launchScreen || !(displayMode.matches || window.navigator.standalone === true)) return;
    launchScreen.classList.add('pwa-launch-screen--visible');
    launchScreen.setAttribute('aria-hidden', 'false');
    window.setTimeout(() => {
      launchScreen.classList.add('pwa-launch-screen--leaving');
      launchScreen.setAttribute('aria-hidden', 'true');
      window.setTimeout(() => launchScreen.remove(), 500);
    }, 1450);
  }

  document.addEventListener('DOMContentLoaded', () => {
    showLaunchScreen();
    document.body.append(networkBanner);
    const notificationList = document.getElementById('notificationList');
    if (notificationList?.parentElement) notificationList.parentElement.insertBefore(installCard, notificationList);
    updateInstallUi();
    const notificationView = document.querySelector('[data-panel="notifications"]');
    if (notificationView) {
      new MutationObserver(updateInstallUi).observe(notificationView, { attributes: true, attributeFilter: ['hidden'] });
    }
  }, { once: true });

  function safeStorageGet(storageName, key) {
    try { return window[storageName].getItem(key); } catch { return null; }
  }

  function safeStorageSet(storageName, key, value) {
    try { window[storageName].setItem(key, value); } catch { /* O armazenamento pode estar bloqueado pelo navegador. */ }
  }

  function isAppleMobile() {
    return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  }

  function isInstalled() {
    const standalone = displayMode.matches || window.navigator.standalone === true;
    if (standalone) safeStorageSet('localStorage', INSTALLED_KEY, '1');
    return standalone || safeStorageGet('localStorage', INSTALLED_KEY) === '1';
  }

  function updateInstallUi() {
    const installed = isInstalled();
    const bell = document.getElementById('notificationBell');
    if (bell) {
      bell.classList.toggle('pwa-install-reminder', !installed);
      bell.title = installed ? '' : 'Instala a aplicação PULSO';
    }
    const dismissed = safeStorageGet('sessionStorage', DISMISSED_KEY) === '1';
    const notificationView = document.querySelector('[data-panel="notifications"]');
    const notificationsOpen = Boolean(notificationView && !notificationView.hidden);
    installCard.hidden = installed || dismissed || !isOnline || !notificationsOpen;
  }

  function showConnectionState(online) {
    isOnline = online;
    networkBanner.hidden = online;
    updateInstallUi();
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

  function showInstallInstructions() {
    if (isAppleMobile()) {
      installInstructions.textContent = 'No Safari: toca em Partilhar e escolhe “Adicionar ao ecrã principal”.';
    } else if (/android/i.test(navigator.userAgent)) {
      installInstructions.textContent = 'No menu ⋮ do navegador, escolhe “Instalar aplicação” ou “Adicionar ao ecrã principal”.';
    } else {
      installInstructions.textContent = 'No Chrome ou Edge, usa o ícone de instalação na barra de endereço ou a opção “Instalar aplicação” no menu.';
    }
    installInstructions.hidden = false;
    installDescription.textContent = 'Este navegador não permite instalar directamente pelo botão. Podes adicionar o PULSO pelo menu de partilha ou do navegador.';
  }

  retryButton.addEventListener('click', () => { void checkConnection(); });
  window.addEventListener('offline', () => showConnectionState(false));
  window.addEventListener('online', () => { void checkConnection(); });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void checkConnection();
  });
  if (displayMode.addEventListener) displayMode.addEventListener('change', updateInstallUi);
  else displayMode.addListener?.(updateInstallUi);

  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    deferredInstallPrompt = event;
    installButton.disabled = false;
    installButton.textContent = 'Instalar aplicação';
    updateInstallUi();
  });
  window.addEventListener('appinstalled', () => {
    safeStorageSet('localStorage', INSTALLED_KEY, '1');
    deferredInstallPrompt = null;
    updateInstallUi();
  });

  installButton.addEventListener('click', async () => {
    if (!deferredInstallPrompt) {
      showInstallInstructions();
      return;
    }
    const promptEvent = deferredInstallPrompt;
    deferredInstallPrompt = null;
    try {
      await promptEvent.prompt();
      const choice = await promptEvent.userChoice;
      if (choice?.outcome === 'accepted') {
        safeStorageSet('localStorage', INSTALLED_KEY, '1');
        installInstructions.hidden = true;
        updateInstallUi();
      } else {
        installInstructions.hidden = true;
        installDescription.textContent = 'A instalação não foi concluída. Podes tentar mais tarde.';
        installButton.disabled = true;
        installButton.textContent = 'Tenta mais tarde';
      }
    } catch {
      showInstallInstructions();
    }
    updateInstallUi();
  });

  dismissButton.addEventListener('click', () => {
    safeStorageSet('sessionStorage', DISMISSED_KEY, '1');
    installCard.hidden = true;
    // Dispensar o cartão não apaga o lembrete vermelho do sino.
  });

  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    navigator.serviceWorker.register(new URL('./sw.js', document.baseURI), {
      scope: new URL('./', document.baseURI).pathname,
      updateViaCache: 'none'
    }).catch(error => console.warn('PULSO PWA: service worker não registado.', error));
  }

  updateInstallUi();
  void checkConnection();
  window.setInterval(() => {
    if (document.visibilityState === 'visible') void checkConnection();
  }, 30000);
})();
