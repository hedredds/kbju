/* settings.js - Settings page: theme, targets, API config, export/reset, policy modals. */
'use strict';

const SettingsPage = (() => {
  const { el, $all, toast, round } = Utils;

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
  }

  function renderThemeSwitch(theme) {
    $all('#theme-switch .seg-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.theme === theme);
    });
  }

  function onThemeSwitch(theme) {
    const settings = Storage.getSettings();
    settings.theme = theme;
    Storage.setSettings(settings);
    applyTheme(theme);
    renderThemeSwitch(theme);
  }

  function renderTargetsForm() {
    const settings = Storage.getSettings();
    el('set-kcal').value = round(settings.targets.kcal);
    el('set-protein').value = round(settings.targets.protein);
    el('set-fat').value = round(settings.targets.fat);
    el('set-carbs').value = round(settings.targets.carbs);
  }

  function onSaveTargets() {
    const kcal = Number(el('set-kcal').value);
    const protein = Number(el('set-protein').value);
    const fat = Number(el('set-fat').value);
    const carbs = Number(el('set-carbs').value);
    if (!kcal || kcal <= 0) {
      toast('Укажите корректную норму калорий', 'error');
      return;
    }
    const settings = Storage.getSettings();
    settings.targets = {
      kcal, protein: protein || 0, fat: fat || 0, carbs: carbs || 0
    };
    Storage.setSettings(settings);
    toast('Цели сохранены');
    Diary.renderDay();
  }

  function renderApiForm() {
    const settings = Storage.getSettings();
    el('set-apikey').value = settings.apiKey || '';
    el('set-model-text').value = settings.modelText || '';
    el('set-model-photo').value = settings.modelPhoto || '';
  }

  function onSaveApi() {
    const settings = Storage.getSettings();
    settings.apiKey = el('set-apikey').value.trim();
    settings.modelText = el('set-model-text').value.trim() || settings.modelText;
    settings.modelPhoto = el('set-model-photo').value.trim() || settings.modelPhoto;
    Storage.setSettings(settings);
    toast('Настройки API сохранены');
  }

  function onExport() {
    const data = Storage.exportAll();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `kbju-export-${Utils.todayKey()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('Экспорт сохранен');
  }

  function onResetAll() {
    const confirmed = window.confirm('Все данные (профиль, дневник, вес, настройки) будут удалены без возможности восстановления. Продолжить?');
    if (!confirmed) return;
    Storage.resetAll();
    toast('Все данные удалены');
    setTimeout(() => window.location.reload(), 600);
  }

  function onRedoOnboarding() {
    const confirmed = window.confirm('Профиль и расчет целей будут сброшены, но дневник питания сохранится. Продолжить?');
    if (!confirmed) return;
    Storage.setOnboarded(false);
    setTimeout(() => window.location.reload(), 200);
  }

  function onShowPolicy() {
    App.showPolicy('privacy');
  }
  function onShowTerms() {
    App.showPolicy('terms');
  }

  function bindEvents() {
    $all('#theme-switch .seg-btn').forEach((btn) => {
      btn.addEventListener('click', () => onThemeSwitch(btn.dataset.theme));
    });
    el('btn-save-targets').addEventListener('click', onSaveTargets);
    el('btn-save-api').addEventListener('click', onSaveApi);
    el('btn-export').addEventListener('click', onExport);
    el('btn-reset-all').addEventListener('click', onResetAll);
    el('btn-redo-onboarding').addEventListener('click', onRedoOnboarding);
    el('link-policy').addEventListener('click', onShowPolicy);
    el('link-terms').addEventListener('click', onShowTerms);
  }

  function refresh() {
    const settings = Storage.getSettings();
    renderThemeSwitch(settings.theme);
    renderTargetsForm();
    renderApiForm();
  }

  function init() {
    bindEvents();
    refresh();
  }

  return { init, refresh };
})();
