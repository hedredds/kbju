/* utils.js - generic helpers: dates, DOM shortcuts, toasts, formatting. */
'use strict';

const Utils = (() => {
  const MONTHS_RU = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
  const WEEKDAYS_RU = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
  const WEEKDAYS_MON_RU = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

  function pad2(n) {
    return n < 10 ? '0' + n : '' + n;
  }

  function dateKey(date) {
    return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
  }

  function todayKey() {
    return dateKey(new Date());
  }

  function parseKey(key) {
    const [y, m, d] = key.split('-').map(Number);
    return new Date(y, m - 1, d);
  }

  function addDays(key, delta) {
    const d = parseKey(key);
    d.setDate(d.getDate() + delta);
    return dateKey(d);
  }

  function formatDayLabel(key) {
    const today = todayKey();
    const yesterday = addDays(today, -1);
    const tomorrow = addDays(today, 1);
    if (key === today) return 'Сегодня';
    if (key === yesterday) return 'Вчера';
    if (key === tomorrow) return 'Завтра';
    const d = parseKey(key);
    return `${d.getDate()} ${MONTHS_RU[d.getMonth()]}`;
  }

  function formatDayShort(key) {
    const d = parseKey(key);
    return `${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}`;
  }

  function formatWeekday(key) {
    const d = parseKey(key);
    return WEEKDAYS_RU[d.getDay()];
  }

  // Monday-first weekday index: 0=Mon ... 6=Sun (JS getDay() is Sunday-first).
  function mondayIndex(date) {
    return (date.getDay() + 6) % 7;
  }

  // Returns the Monday (as a dateKey) of the week containing `key`.
  function weekStart(key) {
    const d = parseKey(key);
    d.setDate(d.getDate() - mondayIndex(d));
    return dateKey(d);
  }

  // Returns an array of 7 dateKeys (Mon..Sun) for the week containing `key`.
  function weekDays(key) {
    const start = weekStart(key);
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  }

  function formatTime(ts) {
    const d = new Date(ts);
    return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  }

  function round(n, digits = 0) {
    const f = Math.pow(10, digits);
    return Math.round((Number(n) || 0) * f) / f;
  }

  function clamp(n, min, max) {
    return Math.min(Math.max(n, min), max);
  }

  // ---------- DOM shortcuts ----------
  function $(sel, root = document) {
    return root.querySelector(sel);
  }
  function $all(sel, root = document) {
    return Array.from(root.querySelectorAll(sel));
  }
  function el(id) {
    return document.getElementById(id);
  }
  function show(node) {
    if (typeof node === 'string') node = el(node);
    if (node) node.classList.remove('hidden');
  }
  function hide(node) {
    if (typeof node === 'string') node = el(node);
    if (node) node.classList.add('hidden');
  }

  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // ---------- Toasts ----------
  let toastTimer = null;
  function toast(message, type = 'info', duration = 2600) {
    const root = el('toast-root');
    if (!root) return;
    const node = document.createElement('div');
    node.className = 'toast' + (type === 'error' ? ' toast-error' : '');
    node.textContent = message;
    root.appendChild(node);
    setTimeout(() => {
      node.style.transition = 'opacity .3s, transform .3s';
      node.style.opacity = '0';
      node.style.transform = 'translateY(-8px)';
      setTimeout(() => node.remove(), 300);
    }, duration);
  }

  // ---------- Simple debounce ----------
  function debounce(fn, wait = 300) {
    let t = null;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), wait);
    };
  }

  function uid(prefix = 'id') {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  // ---------- Generic modal open/close ----------
  function openModal(id) {
    const node = el(id);
    if (node) node.classList.remove('hidden');
  }
  function closeModal(id) {
    const node = el(id);
    if (node) node.classList.add('hidden');
  }

  return {
    openModal, closeModal,
    pad2, dateKey, todayKey, parseKey, addDays,
    formatDayLabel, formatDayShort, formatWeekday, formatTime,
    weekStart, weekDays, WEEKDAYS_MON_RU,
    round, clamp,
    $, $all, el, show, hide, escapeHtml,
    toast, debounce, uid
  };
})();
