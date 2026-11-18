/* onboarding.js - 9-step onboarding wizard:
 * 1. welcome  2. demographics (sex+age)  3. body metrics (height+weight)
 * 4. goal  5. activity  6. optional measurements (target weight/pace)
 * 7. lifestyle (diet type)  8. KBJU summary (Mifflin-St Jeor calc)
 * 9. email + consent -> finish
 */
'use strict';

const Onboarding = (() => {
  const { el, $, $all, show, hide, escapeHtml, toast } = Utils;

  let state = null;
  let stepIndex = 0;
  let onFinishCb = null;

  function defaultState() {
    return {
      sex: null,              // 'male' | 'female'
      age: '',
      units: 'metric',        // 'metric' | 'imperial'
      heightCm: '',
      weightKg: '',
      goal: null,              // 'lose' | 'maintain' | 'gain'
      activity: null,          // key of Nutrition.ACTIVITY_FACTORS
      targetWeightKg: '',
      weeklyPaceKg: '',
      dietType: null,          // 'none' | 'vegetarian' | 'vegan' | 'keto' | 'other'
      mealsPerDay: null,
      email: '',
      consent: false
    };
  }

  const STEPS = [
    { key: 'welcome', render: renderWelcome },
    { key: 'demographics', render: renderDemographics, validate: validateDemographics },
    { key: 'metrics', render: renderMetrics, validate: validateMetrics },
    { key: 'goal', render: renderGoal, validate: (s) => !!s.goal },
    { key: 'activity', render: renderActivity, validate: (s) => !!s.activity },
    { key: 'optional', render: renderOptionalMeasurements },
    { key: 'lifestyle', render: renderLifestyle },
    { key: 'summary', render: renderSummary },
    { key: 'finish', render: renderFinish, validate: (s) => !!s.consent }
  ];

  function progressPercent() {
    return Math.round(((stepIndex + 1) / STEPS.length) * 100);
  }

  function updateProgress() {
    const bar = el('ob-progress-bar');
    if (bar) bar.style.width = progressPercent() + '%';
  }

  function goTo(index) {
    const target = Utils.clamp(index, 0, STEPS.length - 1);
    const direction = target >= stepIndex ? 'forward' : 'back';
    stepIndex = target;
    renderCurrentStep(direction);
    updateProgress();
  }

  function next() {
    const step = STEPS[stepIndex];
    if (step.validate && !step.validate(state)) {
      toast('Пожалуйста, заполните поле', 'error');
      return;
    }
    if (stepIndex === STEPS.length - 1) {
      finish();
      return;
    }
    goTo(stepIndex + 1);
  }

  function back() {
    if (stepIndex === 0) return;
    goTo(stepIndex - 1);
  }

  function finish() {
    // Normalize numeric fields
    const profile = {
      sex: state.sex,
      age: Number(state.age),
      heightCm: Number(state.heightCm),
      weightKg: Number(state.weightKg),
      goal: state.goal,
      activity: state.activity,
      targetWeightKg: state.targetWeightKg ? Number(state.targetWeightKg) : null,
      weeklyPaceKg: state.weeklyPaceKg ? Number(state.weeklyPaceKg) : null,
      dietType: state.dietType,
      mealsPerDay: state.mealsPerDay,
      email: state.email || '',
      consentAt: Date.now(),
      units: state.units
    };
    const calc = Nutrition.calcTargets(profile);
    profile.bmr = calc.bmr;
    profile.tdee = calc.tdee;

    Storage.setProfile(profile);
    Storage.setSettings({
      ...Storage.getSettings(),
      targets: calc.targets
    });
    Storage.addWeight(Utils.todayKey(), profile.weightKg);
    Storage.setPolicyAccepted(!!state.consent);
    Storage.setOnboarded(true);

    if (onFinishCb) onFinishCb(profile, calc);
  }

  function renderCurrentStep(direction = 'forward') {
    const viewport = el('ob-viewport');
    if (!viewport) return;
    viewport.innerHTML = '';
    const stepEl = document.createElement('div');
    stepEl.className = `ob-step ob-step-${direction}`;
    viewport.appendChild(stepEl);
    STEPS[stepIndex].render(stepEl, state, { next, back, goTo, isFirst: stepIndex === 0, isLast: stepIndex === STEPS.length - 1 });
    viewport.scrollTop = 0;
  }

  function footer({ back: showBack = true, nextLabel = 'Далее' } = {}) {
    return `
      <div class="ob-footer">
        ${showBack ? '<button class="btn-secondary" id="ob-btn-back">Назад</button>' : ''}
        <button class="btn-primary full" id="ob-btn-next">${escapeHtml(nextLabel)}</button>
      </div>
    `;
  }

  function bindFooter(container, ctx, { onNext } = {}) {
    const backBtn = $('#ob-btn-back', container);
    const nextBtn = $('#ob-btn-next', container);
    if (backBtn) backBtn.addEventListener('click', ctx.back);
    if (nextBtn) nextBtn.addEventListener('click', () => (onNext ? onNext() : ctx.next()));
  }

  // ---------- Step 1: Welcome ----------
  function renderWelcome(container, s, ctx) {
    container.innerHTML = `
      <div class="ob-emoji">🥗</div>
      <div class="ob-eyebrow">Добро пожаловать</div>
      <div class="ob-title">Считайте калории проще, с помощью ИИ</div>
      <div class="ob-sub">Сфотографируйте еду или опишите блюдо словами - мы оценим калории и БЖУ автоматически. Ответьте на несколько вопросов, чтобы мы рассчитали вашу дневную норму.</div>
      <div class="ob-body"></div>
      <div class="ob-footer"><button class="btn-primary full" id="ob-btn-next">Начать</button></div>
    `;
    $('#ob-btn-next', container).addEventListener('click', ctx.next);
  }

  // ---------- Step 2: Demographics ----------
  function validateDemographics(s) {
    return !!s.sex && Number(s.age) >= 10 && Number(s.age) <= 100;
  }

  function renderDemographics(container, s, ctx) {
    container.innerHTML = `
      <div class="ob-eyebrow">Шаг 1 из 7</div>
      <div class="ob-title">Расскажите о себе</div>
      <div class="ob-sub">Эти данные нужны для точного расчета нормы калорий.</div>
      <div class="ob-body">
        <div class="ob-choice-grid">
          <button class="ob-choice ${s.sex === 'male' ? 'selected' : ''}" data-sex="male">
            <span class="ob-choice-icon">🙋‍♂️</span>
            <span class="ob-choice-text"><span class="ob-choice-title">Мужчина</span></span>
          </button>
          <button class="ob-choice ${s.sex === 'female' ? 'selected' : ''}" data-sex="female">
            <span class="ob-choice-icon">🙋‍♀️</span>
            <span class="ob-choice-text"><span class="ob-choice-title">Женщина</span></span>
          </button>
        </div>
        <div class="ob-field">
          <label>Возраст, лет</label>
          <input type="number" id="ob-age" inputmode="numeric" placeholder="25" value="${escapeHtml(s.age)}">
        </div>
      </div>
      ${footer()}
    `;
    $all('.ob-choice', container).forEach((btn) => {
      btn.addEventListener('click', () => {
        s.sex = btn.dataset.sex;
        $all('.ob-choice', container).forEach((b) => b.classList.toggle('selected', b === btn));
      });
    });
    $('#ob-age', container).addEventListener('input', (e) => (s.age = e.target.value));
    bindFooter(container, ctx);
  }

  // ---------- Step 3: Body metrics ----------
  function validateMetrics(s) {
    return Number(s.heightCm) > 0 && Number(s.weightKg) > 0;
  }

  function renderMetrics(container, s, ctx) {
    container.innerHTML = `
      <div class="ob-eyebrow">Шаг 2 из 7</div>
      <div class="ob-title">Рост и вес</div>
      <div class="ob-sub">Используются в формуле расчета базового обмена веществ (Миффлина-Сан Жеора).</div>
      <div class="ob-body">
        <div class="ob-row2">
          <div class="ob-field">
            <label>Рост, см</label>
            <input type="number" id="ob-height" inputmode="decimal" placeholder="170" value="${escapeHtml(s.heightCm)}">
          </div>
          <div class="ob-field">
            <label>Вес, кг</label>
            <input type="number" id="ob-weight" inputmode="decimal" step="0.1" placeholder="65" value="${escapeHtml(s.weightKg)}">
          </div>
        </div>
      </div>
      ${footer()}
    `;
    $('#ob-height', container).addEventListener('input', (e) => (s.heightCm = e.target.value));
    $('#ob-weight', container).addEventListener('input', (e) => (s.weightKg = e.target.value));
    bindFooter(container, ctx);
  }

  // ---------- Step 4: Goal ----------
  const GOALS = [
    { key: 'lose', icon: '📉', title: 'Снизить вес', desc: 'Дефицит калорий ~500 ккал/день' },
    { key: 'maintain', icon: '⚖️', title: 'Поддерживать вес', desc: 'Питание на уровне нормы обмена' },
    { key: 'gain', icon: '📈', title: 'Набрать массу', desc: 'Избыток калорий ~400 ккал/день' }
  ];

  function renderGoal(container, s, ctx) {
    container.innerHTML = `
      <div class="ob-eyebrow">Шаг 3 из 7</div>
      <div class="ob-title">Какая у вас цель?</div>
      <div class="ob-sub">От этого зависит ваша дневная норма калорий.</div>
      <div class="ob-body">
        <div class="ob-choice-grid">
          ${GOALS.map((g) => `
            <button class="ob-choice ${s.goal === g.key ? 'selected' : ''}" data-goal="${g.key}">
              <span class="ob-choice-icon">${g.icon}</span>
              <span class="ob-choice-text">
                <span class="ob-choice-title">${g.title}</span>
                <span class="ob-choice-desc">${g.desc}</span>
              </span>
            </button>
          `).join('')}
        </div>
      </div>
      ${footer()}
    `;
    $all('.ob-choice', container).forEach((btn) => {
      btn.addEventListener('click', () => {
        s.goal = btn.dataset.goal;
        $all('.ob-choice', container).forEach((b) => b.classList.toggle('selected', b === btn));
      });
    });
    bindFooter(container, ctx);
  }

  // ---------- Step 5: Activity ----------
  const ACTIVITIES = [
    { key: 'sedentary', icon: '🛋️', title: 'Малоподвижный', desc: 'Сидячая работа, минимум тренировок' },
    { key: 'light', icon: '🚶', title: 'Легкая активность', desc: '1-3 тренировки в неделю' },
    { key: 'moderate', icon: '🏃', title: 'Средняя активность', desc: '3-5 тренировок в неделю' },
    { key: 'high', icon: '🏋️', title: 'Высокая активность', desc: '6-7 тренировок в неделю' },
    { key: 'very_high', icon: '🔥', title: 'Очень высокая', desc: 'Физический труд + тренировки' }
  ];

  function renderActivity(container, s, ctx) {
    container.innerHTML = `
      <div class="ob-eyebrow">Шаг 4 из 7</div>
      <div class="ob-title">Насколько вы активны?</div>
      <div class="ob-sub">Выберите вариант, который ближе всего к вашему обычному дню.</div>
      <div class="ob-body">
        <div class="ob-choice-grid">
          ${ACTIVITIES.map((a) => `
            <button class="ob-choice ${s.activity === a.key ? 'selected' : ''}" data-activity="${a.key}">
              <span class="ob-choice-icon">${a.icon}</span>
              <span class="ob-choice-text">
                <span class="ob-choice-title">${a.title}</span>
                <span class="ob-choice-desc">${a.desc}</span>
              </span>
            </button>
          `).join('')}
        </div>
      </div>
      ${footer()}
    `;
    $all('.ob-choice', container).forEach((btn) => {
      btn.addEventListener('click', () => {
        s.activity = btn.dataset.activity;
        $all('.ob-choice', container).forEach((b) => b.classList.toggle('selected', b === btn));
      });
    });
    bindFooter(container, ctx);
  }

  // ---------- Step 6: Optional measurements ----------
  function renderOptionalMeasurements(container, s, ctx) {
    container.innerHTML = `
      <div class="ob-eyebrow">Шаг 5 из 7</div>
      <div class="ob-title">Дополнительно (необязательно)</div>
      <div class="ob-sub">Можно пропустить - эти данные помогают точнее отслеживать прогресс.</div>
      <div class="ob-body">
        <div class="ob-field">
          <label>Желаемый вес, кг</label>
          <input type="number" id="ob-target-weight" inputmode="decimal" step="0.1" placeholder="Необязательно" value="${escapeHtml(s.targetWeightKg)}">
        </div>
        <div class="ob-field">
          <label>Желаемый темп, кг/нед</label>
          <input type="number" id="ob-pace" inputmode="decimal" step="0.1" placeholder="Например: 0.5" value="${escapeHtml(s.weeklyPaceKg)}">
        </div>
      </div>
      ${footer()}
    `;
    $('#ob-target-weight', container).addEventListener('input', (e) => (s.targetWeightKg = e.target.value));
    $('#ob-pace', container).addEventListener('input', (e) => (s.weeklyPaceKg = e.target.value));
    bindFooter(container, ctx);
  }

  // ---------- Step 7: Lifestyle (diet type) ----------
  const DIETS = [
    { key: 'none', icon: '🍽️', title: 'Без ограничений' },
    { key: 'vegetarian', icon: '🥦', title: 'Вегетарианство' },
    { key: 'vegan', icon: '🌱', title: 'Веганство' },
    { key: 'keto', icon: '🥓', title: 'Кето/низкоуглеводная' },
    { key: 'other', icon: '🍴', title: 'Другое' }
  ];

  function renderLifestyle(container, s, ctx) {
    container.innerHTML = `
      <div class="ob-eyebrow">Шаг 6 из 7</div>
      <div class="ob-title">Вы придерживаетесь особого питания?</div>
      <div class="ob-sub">Это поможет точнее понимать ваш рацион (необязательно).</div>
      <div class="ob-body">
        <div class="ob-choice-grid">
          ${DIETS.map((d) => `
            <button class="ob-choice ${s.dietType === d.key ? 'selected' : ''}" data-diet="${d.key}">
              <span class="ob-choice-icon">${d.icon}</span>
              <span class="ob-choice-text"><span class="ob-choice-title">${d.title}</span></span>
            </button>
          `).join('')}
        </div>
      </div>
      ${footer()}
    `;
    $all('.ob-choice', container).forEach((btn) => {
      btn.addEventListener('click', () => {
        s.dietType = btn.dataset.diet;
        $all('.ob-choice', container).forEach((b) => b.classList.toggle('selected', b === btn));
      });
    });
    bindFooter(container, ctx);
  }

  // ---------- Step 8: Summary (KBJU calc preview) ----------
  function renderSummary(container, s, ctx) {
    const profile = {
      sex: s.sex,
      age: Number(s.age),
      heightCm: Number(s.heightCm),
      weightKg: Number(s.weightKg),
      goal: s.goal,
      activity: s.activity
    };
    const calc = Nutrition.calcTargets(profile);
    container.innerHTML = `
      <div class="ob-eyebrow">Шаг 7 из 7</div>
      <div class="ob-title">Ваша дневная норма</div>
      <div class="ob-sub">Рассчитано по формуле Миффлина-Сан Жеора на основе ваших данных. Вы всегда сможете изменить цели в настройках.</div>
      <div class="ob-body">
        <div class="ob-summary">
          <div class="ob-summary-row"><span class="ob-summary-label">Калории</span><span class="ob-summary-val">${calc.targets.kcal} ккал</span></div>
          <div class="ob-summary-row"><span class="ob-summary-label">Белки</span><span class="ob-summary-val">${calc.targets.protein} г</span></div>
          <div class="ob-summary-row"><span class="ob-summary-label">Жиры</span><span class="ob-summary-val">${calc.targets.fat} г</span></div>
          <div class="ob-summary-row"><span class="ob-summary-label">Углеводы</span><span class="ob-summary-val">${calc.targets.carbs} г</span></div>
          <div class="ob-summary-row"><span class="ob-summary-label">Базовый обмен (BMR)</span><span class="ob-summary-val">${calc.bmr} ккал</span></div>
        </div>
      </div>
      ${footer()}
    `;
    bindFooter(container, ctx);
  }

  // ---------- Step 9: Finish (email + consent) ----------
  function renderFinish(container, s, ctx) {
    container.innerHTML = `
      <div class="ob-eyebrow">Почти готово</div>
      <div class="ob-title">Последний шаг</div>
      <div class="ob-sub">Email необязателен и используется только локально. Для продолжения подтвердите согласие с документами.</div>
      <div class="ob-body">
        <div class="ob-field">
          <label>Email (необязательно)</label>
          <input type="email" id="ob-email" placeholder="you@example.com" value="${escapeHtml(s.email)}">
        </div>
        <div class="ob-checkbox-row">
          <div class="ob-checkbox ${s.consent ? 'checked' : ''}" id="ob-consent-check"></div>
          <div class="ob-checkbox-text">
            Я согласен с <a href="#" id="ob-link-policy">Политикой конфиденциальности</a> и <a href="#" id="ob-link-terms">Пользовательским соглашением</a>.
          </div>
        </div>
      </div>
      ${footer({ nextLabel: 'Завершить' })}
    `;
    $('#ob-email', container).addEventListener('input', (e) => (s.email = e.target.value));
    const checkEl = $('#ob-consent-check', container);
    checkEl.addEventListener('click', () => {
      s.consent = !s.consent;
      checkEl.classList.toggle('checked', s.consent);
    });
    $('#ob-link-policy', container).addEventListener('click', (e) => {
      e.preventDefault();
      if (typeof App !== 'undefined' && App.showPolicy) App.showPolicy('privacy');
    });
    $('#ob-link-terms', container).addEventListener('click', (e) => {
      e.preventDefault();
      if (typeof App !== 'undefined' && App.showPolicy) App.showPolicy('terms');
    });
    bindFooter(container, ctx);
  }

  // ---------- Public API ----------
  function init({ onFinish } = {}) {
    state = defaultState();
    stepIndex = 0;
    onFinishCb = onFinish || null;
    renderCurrentStep();
    updateProgress();
  }

  function reset() {
    state = defaultState();
    stepIndex = 0;
  }

  return { init, reset };
})();


