/* stats.js - Stats page: 7/30-day kcal/macro charts, weight trend, day history list. */
'use strict';

const Stats = (() => {
  const { el, $all, round, escapeHtml } = Utils;
  let rangeDays = 7;

  function buildRangeData(days) {
    const today = Utils.todayKey();
    const allDays = Storage.getAllDays();
    const result = [];
    for (let i = days - 1; i >= 0; i--) {
      const key = Utils.addDays(today, -i);
      const day = allDays[key] || { meals: [] };
      const totals = Nutrition.sumMeals(day.meals);
      result.push({
        key,
        label: Utils.formatDayShort(key),
        kcal: round(totals.kcal),
        protein: round(totals.protein),
        fat: round(totals.fat),
        carbs: round(totals.carbs),
        mealsCount: day.meals.length
      });
    }
    return result;
  }

  function buildWeightData(days) {
    const today = Utils.todayKey();
    const fromKey = Utils.addDays(today, -(days - 1));
    const weights = Storage.getWeights().filter((w) => w.date >= fromKey && w.date <= today);
    return weights.map((w) => ({ label: Utils.formatDayShort(w.date), value: w.value }));
  }

  function renderCharts() {
    const settings = Storage.getSettings();
    const rangeData = buildRangeData(rangeDays);

    Charts.renderBarChart(
      el('chart-kcal'),
      rangeData.map((d) => ({ label: d.label, value: d.kcal })),
      { target: settings.targets.kcal, color: 'var(--text)' }
    );

    Charts.renderStackedMacroChart(
      el('chart-macro'),
      rangeData.map((d) => ({ label: d.label, protein: d.protein, fat: d.fat, carbs: d.carbs }))
    );

    const weightData = buildWeightData(rangeDays);
    Charts.renderLineChart(el('chart-weight'), weightData, { color: 'var(--text)' });
  }

  function renderHistoryList() {
    const settings = Storage.getSettings();
    const target = settings.targets.kcal || 1;
    const rangeData = buildRangeData(rangeDays);
    const list = el('history-list');
    const reversed = [...rangeData].reverse();
    list.innerHTML = reversed.map((d) => {
      const ratio = Utils.clamp(d.kcal / target, 0, 1);
      const over = d.kcal > target;
      return `
        <div class="history-row" data-date="${d.key}">
          <div class="history-date">${d.label}</div>
          <div class="history-bar-track"><div class="history-bar-fill${over ? ' over' : ''}" style="width:${ratio * 100}%"></div></div>
          <div class="history-kcal">${d.kcal} ккал</div>
        </div>
      `;
    }).join('');
    $all('.history-row', list).forEach((row) => {
      row.addEventListener('click', () => openDayDetail(row.dataset.date));
    });
  }

  function openDayDetail(dateKey) {
    const day = Storage.getDay(dateKey);
    const totals = Nutrition.sumMeals(day.meals);
    el('day-detail-title').textContent = Utils.formatDayLabel(dateKey);
    const body = el('day-detail-body');
    const sorted = [...day.meals].sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
    const mealsHtml = sorted.length
      ? sorted.map((m) => `
          <div class="meal-card">
            ${m.thumbnail ? `<img class="meal-thumb" src="${m.thumbnail}" alt="">` : `<div class="meal-thumb-placeholder">${m.source === 'manual' ? '📝' : '🍽️'}</div>`}
            <div class="meal-info">
              <div class="meal-title">${escapeHtml(m.title)}</div>
              <div class="meal-meta">${Utils.formatTime(m.createdAt)} - Б${round(m.protein)} Ж${round(m.fat)} У${round(m.carbs)}</div>
            </div>
            <div class="meal-kcal">
              <div class="meal-kcal-num">${round(m.kcal)}</div>
              <div class="meal-kcal-unit">ккал</div>
            </div>
          </div>
        `).join('')
      : '<div class="meals-empty">Нет записей за этот день</div>';
    body.innerHTML = `
      <div class="preview-total glass">
        <div class="preview-total-row"><span>Итого</span><span>${round(totals.kcal)} ккал</span></div>
        <div class="preview-total-sub">
          <span>Б: <b>${round(totals.protein)}</b> г</span>
          <span>Ж: <b>${round(totals.fat)}</b> г</span>
          <span>У: <b>${round(totals.carbs)}</b> г</span>
        </div>
      </div>
      <div class="meals-list" style="margin-top:14px">${mealsHtml}</div>
    `;
    Utils.openModal('modal-day-detail');
  }

  function refresh() {
    renderCharts();
    renderHistoryList();
  }

  function bindEvents() {
    $all('#chart-range-switch .seg-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        rangeDays = Number(btn.dataset.range);
        $all('#chart-range-switch .seg-btn').forEach((b) => b.classList.toggle('active', b === btn));
        refresh();
      });
    });
    el('btn-add-weight').addEventListener('click', () => Diary.openWeightModal(Utils.todayKey()));
  }

  function init() {
    bindEvents();
    refresh();
  }

  return { init, refresh };
})();
