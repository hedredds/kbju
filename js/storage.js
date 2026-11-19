/* storage.js - localStorage persistence layer for KBJU app.
 * All data is stored locally on-device. No backend except direct AI API calls.
 */
'use strict';

const Storage = (() => {
  const KEYS = {
    PROFILE: 'kbju_profile',          // onboarding answers + computed targets
    SETTINGS: 'kbju_settings',        // theme, api key, model names
    DAYS: 'kbju_days',                // { 'YYYY-MM-DD': { meals: [...] } }
    WEIGHTS: 'kbju_weights',          // [{date:'YYYY-MM-DD', value:number}]
    ONBOARDED: 'kbju_onboarded',      // 'true' | null
    POLICY_ACCEPTED: 'kbju_policy_accepted',
    STREAK: 'kbju_streak'             // { count:number, lastDate:'YYYY-MM-DD' }
  };

  // Local date helpers (storage.js loads before utils.js, so it cannot
  // depend on Utils - these tiny helpers keep the streak logic self-contained).
  function pad2Local(n) {
    return n < 10 ? '0' + n : '' + n;
  }
  function todayKeyLocal() {
    const d = new Date();
    return `${d.getFullYear()}-${pad2Local(d.getMonth() + 1)}-${pad2Local(d.getDate())}`;
  }
  function addDaysLocal(key, delta) {
    const [y, m, d] = key.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    dt.setDate(dt.getDate() + delta);
    return `${dt.getFullYear()}-${pad2Local(dt.getMonth() + 1)}-${pad2Local(dt.getDate())}`;
  }

  function read(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (raw === null || raw === undefined) return fallback;
      return JSON.parse(raw);
    } catch (e) {
      console.error('Storage.read failed for', key, e);
      return fallback;
    }
  }

  function write(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      console.error('Storage.write failed for', key, e);
      return false;
    }
  }

  // ---------- Profile ----------
  function getProfile() {
    return read(KEYS.PROFILE, null);
  }
  function setProfile(profile) {
    return write(KEYS.PROFILE, profile);
  }

  // ---------- Settings ----------
  // SETTINGS_VERSION gates one-time API config migrations (see migrateSettings
  // below). Bump it whenever apiBaseUrl/model defaults change so existing
  // users on an older localStorage automatically pick up the new values.
  const SETTINGS_VERSION = 2;
  const DEFAULT_SETTINGS = {
    settingsVersion: SETTINGS_VERSION,
    theme: 'light',
    apiKey: '',
    apiBaseUrl: 'https://bitter-night-9507.artem-kyznitsov2007.workers.dev/v1',
    modelText: 'gemini-2.5-flash-lite',
    modelPhoto: 'gemini-2.5-flash',
    targets: { kcal: 2000, protein: 120, fat: 70, carbs: 230 }
  };

  // Migrates settings written by older app versions: updates the API
  // endpoint/model defaults to the current ones, without touching the
  // user's apiKey, KBJU targets, or any diary/weight history. `rawVersion`
  // is the settingsVersion of the *stored* object (before defaults were
  // merged in) so pre-migration settings (missing the field entirely) are
  // correctly detected as version 0, not silently upgraded by the merge.
  function migrateSettings(merged, rawVersion) {
    if ((rawVersion || 0) >= SETTINGS_VERSION) return merged;
    return {
      ...merged,
      settingsVersion: SETTINGS_VERSION,
      apiBaseUrl: DEFAULT_SETTINGS.apiBaseUrl,
      modelText: DEFAULT_SETTINGS.modelText,
      modelPhoto: DEFAULT_SETTINGS.modelPhoto
    };
  }

  function getSettings() {
    const s = read(KEYS.SETTINGS, null);
    if (!s) return { ...DEFAULT_SETTINGS };
    const merged = { ...DEFAULT_SETTINGS, ...s, targets: { ...DEFAULT_SETTINGS.targets, ...(s.targets || {}) } };
    const migrated = migrateSettings(merged, s.settingsVersion);
    if ((s.settingsVersion || 0) < SETTINGS_VERSION) write(KEYS.SETTINGS, migrated);
    return migrated;
  }
  function setSettings(settings) {
    return write(KEYS.SETTINGS, settings);
  }

  // ---------- Onboarding / Policy flags ----------
  function isOnboarded() {
    return localStorage.getItem(KEYS.ONBOARDED) === 'true';
  }
  function setOnboarded(val) {
    localStorage.setItem(KEYS.ONBOARDED, val ? 'true' : 'false');
  }
  function isPolicyAccepted() {
    return localStorage.getItem(KEYS.POLICY_ACCEPTED) === 'true';
  }
  function setPolicyAccepted(val) {
    localStorage.setItem(KEYS.POLICY_ACCEPTED, val ? 'true' : 'false');
  }

  // ---------- Days / Meals ----------
  function getAllDays() {
    return read(KEYS.DAYS, {});
  }
  function setAllDays(days) {
    return write(KEYS.DAYS, days);
  }
  function getDay(dateKey) {
    const days = getAllDays();
    return days[dateKey] || { meals: [] };
  }
  function saveDay(dateKey, dayData) {
    const days = getAllDays();
    days[dateKey] = dayData;
    return setAllDays(days);
  }

  function addMeal(dateKey, meal) {
    const days = getAllDays();
    if (!days[dateKey]) days[dateKey] = { meals: [] };
    if (!meal.id) meal.id = 'm_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
    if (!meal.createdAt) meal.createdAt = Date.now();
    days[dateKey].meals.push(meal);
    setAllDays(days);
    touchStreak();
    return meal;
  }

  function updateMeal(dateKey, mealId, patch) {
    const days = getAllDays();
    const day = days[dateKey];
    if (!day) return null;
    const idx = day.meals.findIndex((m) => m.id === mealId);
    if (idx === -1) return null;
    day.meals[idx] = { ...day.meals[idx], ...patch };
    setAllDays(days);
    return day.meals[idx];
  }

  function deleteMeal(dateKey, mealId) {
    const days = getAllDays();
    const day = days[dateKey];
    if (!day) return false;
    day.meals = day.meals.filter((m) => m.id !== mealId);
    setAllDays(days);
    return true;
  }

  // ---------- Weights ----------
  function getWeights() {
    return read(KEYS.WEIGHTS, []);
  }
  function addWeight(dateKey, value) {
    const weights = getWeights();
    const idx = weights.findIndex((w) => w.date === dateKey);
    if (idx !== -1) {
      weights[idx].value = value;
    } else {
      weights.push({ date: dateKey, value });
    }
    weights.sort((a, b) => (a.date < b.date ? -1 : 1));
    write(KEYS.WEIGHTS, weights);
    return weights;
  }
  function getLatestWeight() {
    const weights = getWeights();
    if (!weights.length) return null;
    return weights[weights.length - 1];
  }

  // ---------- Streak (consecutive days of activity: opening app or logging food) ----------
  // Call on every app launch and on every diary write. Advances the streak by
  // one if the last recorded activity was yesterday, keeps it unchanged if it
  // was already today, and resets to 1 if a day was missed.
  function getStreak() {
    return read(KEYS.STREAK, { count: 0, lastDate: null });
  }
  function touchStreak() {
    const today = todayKeyLocal();
    const streak = getStreak();
    if (streak.lastDate === today) {
      return streak;
    }
    const yesterday = addDaysLocal(today, -1);
    const nextCount = streak.lastDate === yesterday ? (streak.count || 0) + 1 : 1;
    const next = { count: nextCount, lastDate: today };
    write(KEYS.STREAK, next);
    return next;
  }

  // ---------- Export / Reset ----------
  function exportAll() {
    return {
      exportedAt: new Date().toISOString(),
      profile: getProfile(),
      settings: getSettings(),
      days: getAllDays(),
      weights: getWeights()
    };
  }

  function resetAll() {
    Object.values(KEYS).forEach((k) => localStorage.removeItem(k));
  }

  // ---------- Quota-safe image storage (thumbnails only, ~300px) ----------
  // Full-size compressed images for the API are never persisted - only a
  // small thumbnail (base64 JPEG) is stored alongside the meal record.
  function estimateStorageUsageKB() {
    let total = 0;
    for (const k in localStorage) {
      if (Object.prototype.hasOwnProperty.call(localStorage, k)) {
        total += (localStorage[k].length + k.length) * 2; // UTF-16 -> bytes approx
      }
    }
    return Math.round(total / 1024);
  }

  return {
    KEYS,
    getProfile, setProfile,
    getSettings, setSettings,
    isOnboarded, setOnboarded,
    isPolicyAccepted, setPolicyAccepted,
    getAllDays, setAllDays, getDay, saveDay,
    addMeal, updateMeal, deleteMeal,
    getWeights, addWeight, getLatestWeight,
    getStreak, touchStreak,
    exportAll, resetAll,
    estimateStorageUsageKB
  };
})();
