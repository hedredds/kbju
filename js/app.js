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

  // Each module's init() is isolated behind its own try/catch so a bug in
  // one page (e.g. Diary) can never prevent the other pages (Stats,
  // Settings) from wiring up their own buttons - previously a single
  // uncaught error here silently broke the whole app shell.
  function safeInit(name, fn) {
    try {
      fn();
    } catch (e) {
      console.error(`${name}.init failed`, e);
    }
  }

  function startMainApp() {
    applyTheme();
    show('app');
    bindTabBar();
    safeInit('Diary', Diary.init);
    safeInit('Stats', Stats.init);
    safeInit('SettingsPage', SettingsPage.init);
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

  // The policy modal is now purely informational (opened from the onboarding
  // consent step or from Settings -> "About"). There is no blocking first-run
  // gate anymore - consent is captured solely via the checkbox on the final
  // onboarding step, together with the optional email.
  function bindPolicyModalClose() {
    const policyOverlay = el('modal-policy');
    $all('[data-close="modal-policy"]').forEach((btn) => {
      btn.addEventListener('click', () => Utils.closeModal('modal-policy'));
    });
    policyOverlay.addEventListener('click', (e) => {
      if (e.target === policyOverlay) Utils.closeModal('modal-policy');
    });
  }

  function init() {
    applyTheme();
    bindPolicyModalClose();
    registerServiceWorker();
    proceedAfterPolicy();
  }

  return { init, showPolicy, showPage };
})();

document.addEventListener('DOMContentLoaded', App.init);
