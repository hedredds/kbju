/* app.js - bootstrap: policy gate, onboarding gate, tab navigation, service worker. */
'use strict';

const App = (() => {
  const { el, $all, show, hide } = Utils;

  // ---------- Policy modal (shared by onboarding, settings) ----------
  function showPolicy(type) {
    const title = el('policy-title');
    const body = el('policy-body');
    if (type === 'terms') {
      title.textContent = 'Пользовательское соглашение';
      body.innerHTML = Texts.TERMS_OF_USE_HTML;
    } else {
      title.textContent = 'Политика конфиденциальности';
      body.innerHTML = Texts.PRIVACY_POLICY_HTML;
    }
    Utils.openModal('modal-policy');
  }

  // ---------- Tab navigation ----------
  function showPage(pageId) {
    $all('.page').forEach((page) => page.classList.toggle('active', page.id === pageId));
    $all('.tab-btn').forEach((btn) => btn.classList.toggle('active', btn.dataset.page === pageId));
    if (pageId === 'page-stats') Stats.refresh();
    if (pageId === 'page-settings') SettingsPage.refresh();
    if (pageId === 'page-home') Diary.renderDay();
  }

  function bindTabBar() {
    $all('.tab-btn').forEach((btn) => {
      btn.addEventListener('click', () => showPage(btn.dataset.page));
    });
  }

  // ---------- App shell bootstrap ----------
  function applyTheme() {
    const settings = Storage.getSettings();
    document.documentElement.setAttribute('data-theme', settings.theme || 'light');
  }

  function startMainApp() {
    applyTheme();
    show('app');
    bindTabBar();
    Diary.init();
    Stats.init();
    SettingsPage.init();
  }

  function startOnboarding() {
    show('onboarding');
    Onboarding.init({
      onFinish: () => {
        hide('onboarding');
        startMainApp();
      }
    });
  }

  function proceedAfterPolicy() {
    if (Storage.isOnboarded()) {
      startMainApp();
    } else {
      startOnboarding();
    }
  }

  function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js').catch((e) => {
          console.warn('Service worker registration failed', e);
        });
      });
    }
  }

  function bindPolicyModalClose() {
    const policyOverlay = el('modal-policy');
    $all('[data-close="modal-policy"]').forEach((btn) => {
      btn.addEventListener('click', onPolicyClosed);
    });
    policyOverlay.addEventListener('click', (e) => {
      if (e.target === policyOverlay) onPolicyClosed();
    });
  }

  // Only the first-run acceptance flow needs to continue bootstrap after the
  // policy modal is closed; subsequent opens (from settings/onboarding links)
  // are purely informational and this is a harmless no-op once the app/
  // onboarding screen is already visible.
  let firstRunPending = false;
  function onPolicyClosed() {
    Utils.closeModal('modal-policy');
    if (firstRunPending) {
      firstRunPending = false;
      Storage.setPolicyAccepted(true);
      proceedAfterPolicy();
    }
  }

  function init() {
    applyTheme();
    bindPolicyModalClose();
    registerServiceWorker();

    if (!Storage.isPolicyAccepted()) {
      firstRunPending = true;
      showPolicy('privacy');
    } else {
      proceedAfterPolicy();
    }
  }

  return { init, showPolicy, showPage };
})();

document.addEventListener('DOMContentLoaded', App.init);
