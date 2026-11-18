/* diary.js - Home page (diary): ring progress, meal list, FAB flows
 * (photo/text/manual), AI preview with clarification, edit/delete meal.
 */
'use strict';

const Diary = (() => {
  const { el, $, $all, show, hide, escapeHtml, toast, round, uid } = Utils;

  let currentDate = Utils.todayKey();
  let pendingPhotoFull = null;   // compressed data URL sent to API (max 1000px)
  let pendingPhotoThumb = null;  // small thumbnail for storage (~300px)
  let pendingSource = 'text';    // 'photo' | 'text'
  let previewDraft = null;       // { title, ingredients, clarificationQuestion }
  let editingMealId = null;

  const RING_CIRCUMFERENCE = 2 * Math.PI * 70; // r=70 per index.html svg

  // ---------- Rendering ----------
  function renderDay() {
    el('day-label').textContent = Utils.formatDayLabel(currentDate);
    const day = Storage.getDay(currentDate);
    const settings = Storage.getSettings();
    const targets = settings.targets;
    const totals = Nutrition.sumMeals(day.meals);

    const kcalLeft = Math.max(0, round(targets.kcal - totals.kcal));
    el('ring-kcal-left').textContent = kcalLeft;
    el('ring-kcal-total').textContent = `из ${round(targets.kcal)}`;

    const progressRatio = Utils.clamp(totals.kcal / (targets.kcal || 1), 0, 1);
    const offset = RING_CIRCUMFERENCE * (1 - progressRatio);
    const ringProgress = el('ring-kcal-progress');
    ringProgress.style.strokeDasharray = `${RING_CIRCUMFERENCE}`;
    ringProgress.style.strokeDashoffset = `${offset}`;
    if (totals.kcal > targets.kcal) {
      ringProgress.style.stroke = 'var(--protein)';
    } else {
      ringProgress.style.stroke = 'var(--text)';
    }

    renderMacroBar('protein', totals.protein, targets.protein);
    renderMacroBar('fat', totals.fat, targets.fat);
    renderMacroBar('carbs', totals.carbs, targets.carbs);

    const latestWeight = Storage.getLatestWeight();
    el('quick-weight-label').textContent = latestWeight
      ? `Вес: ${round(latestWeight.value, 1)} кг`
      : 'Обновить вес';

    renderMealsList(day.meals);
  }

  function renderMacroBar(key, value, target) {
    const ratio = Utils.clamp(value / (target || 1), 0, 1);
    el(`bar-${key}`).style.width = `${ratio * 100}%`;
    el(`val-${key}`).textContent = round(value);
    el(`target-${key}`).textContent = round(target);
  }

  function mealIcon(meal) {
    if (meal.thumbnail) {
      return `<img class="meal-thumb" src="${meal.thumbnail}" alt="${escapeHtml(meal.title)}">`;
    }
    const icon = meal.source === 'manual' ? '📝' : '🍽️';
    return `<div class="meal-thumb-placeholder">${icon}</div>`;
  }

  function renderMealsList(meals) {
    const list = el('meals-list');
    const empty = el('meals-empty');
    if (!meals.length) {
      list.innerHTML = '';
      show(empty);
      return;
    }
    hide(empty);
    const sorted = [...meals].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    list.innerHTML = sorted.map((meal) => `
      <div class="meal-card" data-meal-id="${meal.id}">
        ${mealIcon(meal)}
        <div class="meal-info">
          <div class="meal-title">${escapeHtml(meal.title)}</div>
          <div class="meal-meta">${Utils.formatTime(meal.createdAt)} - Б${round(meal.protein)} Ж${round(meal.fat)} У${round(meal.carbs)}</div>
        </div>
        <div class="meal-kcal">
          <div class="meal-kcal-num">${round(meal.kcal)}</div>
          <div class="meal-kcal-unit">ккал</div>
        </div>
      </div>
    `).join('');
    $all('.meal-card', list).forEach((card) => {
      card.addEventListener('click', () => openEditMeal(card.dataset.mealId));
    });
  }

  // ---------- Day navigation ----------
  function changeDay(delta) {
    currentDate = Utils.addDays(currentDate, delta);
    renderDay();
  }

  // ---------- FAB menu ----------
  function openFabMenu() {
    show('fab-overlay');
  }
  function closeFabMenu() {
    hide('fab-overlay');
  }

  // ---------- Photo flow ----------
  async function startPhotoFlow() {
    closeFabMenu();
    if (!Camera.isSupported()) {
      toast('Камера не поддерживается в этом браузере', 'error');
      openManualPhotoPicker();
      return;
    }
    try {
      Utils.openModal('modal-camera');
      await Camera.open(el('camera-video'));
      const flashBtn = el('camera-flash');
      flashBtn.style.display = Camera.hasTorchSupport() ? '' : 'none';
    } catch (e) {
      Utils.closeModal('modal-camera');
      toast(e.message, 'error');
    }
  }

  function closeCameraModal() {
    Camera.close();
    Utils.closeModal('modal-camera');
  }

  async function onCameraShutter() {
    try {
      const canvas = el('camera-canvas');
      const dataUrl = Camera.capture(canvas);
      closeCameraModal();
      await handleCapturedPhoto(dataUrl);
    } catch (e) {
      toast(e.message, 'error');
    }
  }

  async function onCameraFlashToggle() {
    await Camera.toggleTorch();
  }

  // Fallback file picker (used if camera API unsupported, or could be wired
  // to an <input type="file" accept="image/*" capture="environment">).
  function openManualPhotoPicker() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.capture = 'environment';
    input.addEventListener('change', async () => {
      const file = input.files && input.files[0];
      if (!file) return;
      try {
        const compressed = await Api.compressImage(file, 1000, 0.7);
        await handleCapturedPhoto(compressed, true);
      } catch (e) {
        toast(e.message, 'error');
      }
    });
    input.click();
  }

  async function handleCapturedPhoto(dataUrl, alreadyCompressed = false) {
    try {
      pendingPhotoFull = alreadyCompressed ? dataUrl : await Api.compressDataUrl(dataUrl, 1000, 0.7);
      pendingPhotoThumb = await Api.makeThumbnail(dataUrl, 300, 0.6);
      pendingSource = 'photo';
      openCommentModal();
    } catch (e) {
      toast(e.message, 'error');
    }
  }

  // ---------- Comment modal (photo caption or text-only entry) ----------
  function openCommentModal() {
    const preview = el('comment-photo-preview');
    const title = el('comment-title');
    el('comment-text').value = '';
    if (pendingSource === 'photo' && pendingPhotoFull) {
      preview.src = pendingPhotoFull;
      show(preview);
      title.textContent = 'Описание к фото';
    } else {
      hide(preview);
      title.textContent = 'Описание блюда';
    }
    Utils.openModal('modal-comment');
    el('comment-text').focus();
  }

  function startTextFlow() {
    closeFabMenu();
    pendingSource = 'text';
    pendingPhotoFull = null;
    pendingPhotoThumb = null;
    openCommentModal();
  }

  async function onCommentCalc() {
    const text = el('comment-text').value.trim();
    if (pendingSource === 'text' && !text) {
      toast('Опишите блюдо текстом', 'error');
      return;
    }
    Utils.closeModal('modal-comment');
    Utils.openModal('modal-loading');
    const settings = Storage.getSettings();
    try {
      let result;
      if (pendingSource === 'photo') {
        result = await Api.analyzePhoto({
          apiKey: settings.apiKey, model: settings.modelPhoto,
          imageDataUrl: pendingPhotoFull, text
        });
      } else {
        result = await Api.analyzeText({
          apiKey: settings.apiKey, model: settings.modelText, text
        });
      }
      Utils.closeModal('modal-loading');
      openPreviewModal(result);
    } catch (e) {
      Utils.closeModal('modal-loading');
      toast(e.message, 'error');
    }
  }

  // ---------- AI preview modal ----------
  function openPreviewModal(result) {
    previewDraft = {
      title: result.title || 'Блюдо',
      ingredients: (result.ingredients || []).map((ing) => ({
        id: uid('ing'),
        name: ing.name || 'Ингредиент',
        weight: Number(ing.weight_g) || 0,
        kcal: Number(ing.kcal) || 0,
        protein: Number(ing.protein) || 0,
        fat: Number(ing.fat) || 0,
        carbs: Number(ing.carbs) || 0
      })),
      clarificationQuestion: result.clarification_question || null
    };
    el('preview-title').value = previewDraft.title;
    renderPreviewIngredients();
    renderPreviewClarify();
    renderPreviewTotals();
    Utils.openModal('modal-preview');
  }

  function renderPreviewIngredients() {
    const list = el('preview-ingredients');
    list.innerHTML = previewDraft.ingredients.map((ing) => `
      <div class="ingredient-row" data-ing-id="${ing.id}">
        <input class="ingredient-name" value="${escapeHtml(ing.name)}" data-field="name">
        <input class="ingredient-weight" type="number" value="${round(ing.weight)}" data-field="weight">
        <span class="ingredient-weight-unit">г</span>
        <span class="ingredient-kcal">${round(ing.kcal)} ккал</span>
        <button class="ingredient-del" data-del="${ing.id}">&times;</button>
      </div>
    `).join('');
    $all('.ingredient-row', list).forEach((row) => {
      const id = row.dataset.ingId;
      const ing = previewDraft.ingredients.find((i) => i.id === id);
      $('[data-field="name"]', row).addEventListener('input', (e) => { ing.name = e.target.value; });
      $('[data-field="weight"]', row).addEventListener('input', (e) => {
        const newWeight = Number(e.target.value) || 0;
        const ratio = ing.weight > 0 ? newWeight / ing.weight : 1;
        ing.kcal = round(ing.kcal * ratio);
        ing.protein = round(ing.protein * ratio, 1);
        ing.fat = round(ing.fat * ratio, 1);
        ing.carbs = round(ing.carbs * ratio, 1);
        ing.weight = newWeight;
        renderPreviewTotals();
        $('.ingredient-kcal', row).textContent = `${round(ing.kcal)} ккал`;
      });
    });
    $all('[data-del]', list).forEach((btn) => {
      btn.addEventListener('click', () => {
        previewDraft.ingredients = previewDraft.ingredients.filter((i) => i.id !== btn.dataset.del);
        renderPreviewIngredients();
        renderPreviewTotals();
      });
    });
  }

  function renderPreviewClarify() {
    const box = el('preview-clarify-box');
    if (previewDraft.clarificationQuestion) {
      el('preview-clarify-q').textContent = previewDraft.clarificationQuestion;
      el('preview-clarify-answer').value = '';
      show(box);
    } else {
      hide(box);
    }
  }

  function renderPreviewTotals() {
    const totals = Nutrition.sumIngredients(previewDraft.ingredients);
    el('preview-total-kcal').textContent = `${round(totals.kcal)} ккал`;
    el('preview-total-protein').textContent = round(totals.protein);
    el('preview-total-fat').textContent = round(totals.fat);
    el('preview-total-carbs').textContent = round(totals.carbs);
  }

  async function onPreviewClarifyRecalc() {
    const answer = el('preview-clarify-answer').value.trim();
    if (!answer) {
      toast('Введите ответ на вопрос', 'error');
      return;
    }
    const text = el('comment-text') ? el('comment-text').value.trim() : '';
    Utils.closeModal('modal-preview');
    Utils.openModal('modal-loading');
    const settings = Storage.getSettings();
    try {
      let result;
      if (pendingSource === 'photo') {
        result = await Api.analyzePhoto({
          apiKey: settings.apiKey, model: settings.modelPhoto,
          imageDataUrl: pendingPhotoFull, text, clarificationAnswer: answer
        });
      } else {
        result = await Api.analyzeText({
          apiKey: settings.apiKey, model: settings.modelText, text, clarificationAnswer: answer
        });
      }
      Utils.closeModal('modal-loading');
      openPreviewModal(result);
    } catch (e) {
      Utils.closeModal('modal-loading');
      toast(e.message, 'error');
    }
  }

  function onPreviewSave() {
    const totals = Nutrition.sumIngredients(previewDraft.ingredients);
    const title = el('preview-title').value.trim() || previewDraft.title;
    const meal = {
      title,
      source: pendingSource,
      ingredients: previewDraft.ingredients,
      kcal: round(totals.kcal),
      protein: round(totals.protein, 1),
      fat: round(totals.fat, 1),
      carbs: round(totals.carbs, 1),
      thumbnail: pendingSource === 'photo' ? pendingPhotoThumb : null
    };
    Storage.addMeal(currentDate, meal);
    Utils.closeModal('modal-preview');
    pendingPhotoFull = null;
    pendingPhotoThumb = null;
    previewDraft = null;
    toast('Сохранено в дневник');
    renderDay();
  }

  // ---------- Manual entry ----------
  function startManualFlow() {
    closeFabMenu();
    ['manual-name', 'manual-weight', 'manual-kcal', 'manual-protein', 'manual-fat', 'manual-carbs'].forEach((id) => {
      el(id).value = '';
    });
    Utils.openModal('modal-manual');
    el('manual-name').focus();
  }

  function onManualSave() {
    const name = el('manual-name').value.trim();
    const kcal = Number(el('manual-kcal').value) || 0;
    if (!name) {
      toast('Укажите название блюда', 'error');
      return;
    }
    if (kcal <= 0) {
      toast('Укажите калорийность', 'error');
      return;
    }
    const meal = {
      title: name,
      source: 'manual',
      weight: Number(el('manual-weight').value) || 0,
      kcal,
      protein: Number(el('manual-protein').value) || 0,
      fat: Number(el('manual-fat').value) || 0,
      carbs: Number(el('manual-carbs').value) || 0,
      ingredients: [],
      thumbnail: null
    };
    Storage.addMeal(currentDate, meal);
    Utils.closeModal('modal-manual');
    toast('Сохранено в дневник');
    renderDay();
  }

  // ---------- Edit meal modal ----------
  let editDraftIngredients = null;

  function openEditMeal(mealId) {
    const day = Storage.getDay(currentDate);
    const meal = day.meals.find((m) => m.id === mealId);
    if (!meal) return;
    editingMealId = mealId;
    editDraftIngredients = (meal.ingredients && meal.ingredients.length)
      ? meal.ingredients.map((i) => ({ ...i }))
      : [{
          id: uid('ing'), name: meal.title, weight: meal.weight || 0,
          kcal: meal.kcal, protein: meal.protein, fat: meal.fat, carbs: meal.carbs
        }];
    el('edit-meal-name').value = meal.title;
    el('edit-meal-ai-text').value = '';
    renderEditIngredients();
    renderEditTotals();
    Utils.openModal('modal-edit-meal');
  }

  function renderEditIngredients() {
    const list = el('edit-meal-ingredients');
    list.innerHTML = editDraftIngredients.map((ing) => `
      <div class="ingredient-row" data-ing-id="${ing.id}">
        <input class="ingredient-name" value="${escapeHtml(ing.name)}" data-field="name">
        <input class="ingredient-weight" type="number" value="${round(ing.weight)}" data-field="weight">
        <span class="ingredient-weight-unit">г</span>
        <span class="ingredient-kcal">${round(ing.kcal)} ккал</span>
        <button class="ingredient-del" data-del="${ing.id}">&times;</button>
      </div>
    `).join('');
    $all('.ingredient-row', list).forEach((row) => {
      const id = row.dataset.ingId;
      const ing = editDraftIngredients.find((i) => i.id === id);
      $('[data-field="name"]', row).addEventListener('input', (e) => { ing.name = e.target.value; });
      $('[data-field="weight"]', row).addEventListener('input', (e) => {
        const newWeight = Number(e.target.value) || 0;
        const ratio = ing.weight > 0 ? newWeight / ing.weight : 1;
        ing.kcal = round(ing.kcal * ratio);
        ing.protein = round(ing.protein * ratio, 1);
        ing.fat = round(ing.fat * ratio, 1);
        ing.carbs = round(ing.carbs * ratio, 1);
        ing.weight = newWeight;
        renderEditTotals();
        $('.ingredient-kcal', row).textContent = `${round(ing.kcal)} ккал`;
      });
    });
    $all('[data-del]', list).forEach((btn) => {
      btn.addEventListener('click', () => {
        editDraftIngredients = editDraftIngredients.filter((i) => i.id !== btn.dataset.del);
        renderEditIngredients();
        renderEditTotals();
      });
    });
  }

  function renderEditTotals() {
    const totals = Nutrition.sumIngredients(editDraftIngredients);
    el('edit-meal-total-kcal').textContent = `${round(totals.kcal)} ккал`;
    el('edit-meal-total-protein').textContent = round(totals.protein);
    el('edit-meal-total-fat').textContent = round(totals.fat);
    el('edit-meal-total-carbs').textContent = round(totals.carbs);
  }

  async function onEditMealAi() {
    const text = el('edit-meal-ai-text').value.trim();
    if (!text) {
      toast('Опишите, что нужно добавить', 'error');
      return;
    }
    Utils.openModal('modal-loading');
    const settings = Storage.getSettings();
    try {
      const result = await Api.analyzeText({ apiKey: settings.apiKey, model: settings.modelText, text });
      const newIngredients = (result.ingredients || []).map((ing) => ({
        id: uid('ing'),
        name: ing.name || 'Ингредиент',
        weight: Number(ing.weight_g) || 0,
        kcal: Number(ing.kcal) || 0,
        protein: Number(ing.protein) || 0,
        fat: Number(ing.fat) || 0,
        carbs: Number(ing.carbs) || 0
      }));
      editDraftIngredients = editDraftIngredients.concat(newIngredients);
      renderEditIngredients();
      renderEditTotals();
      el('edit-meal-ai-text').value = '';
      Utils.closeModal('modal-loading');
      toast('Ингредиенты добавлены');
    } catch (e) {
      Utils.closeModal('modal-loading');
      toast(e.message, 'error');
    }
  }

  function onSaveEditMeal() {
    const totals = Nutrition.sumIngredients(editDraftIngredients);
    const title = el('edit-meal-name').value.trim() || 'Блюдо';
    Storage.updateMeal(currentDate, editingMealId, {
      title,
      ingredients: editDraftIngredients,
      kcal: round(totals.kcal),
      protein: round(totals.protein, 1),
      fat: round(totals.fat, 1),
      carbs: round(totals.carbs, 1)
    });
    Utils.closeModal('modal-edit-meal');
    toast('Изменения сохранены');
    renderDay();
  }

  function onDeleteMeal() {
    if (!editingMealId) return;
    Storage.deleteMeal(currentDate, editingMealId);
    Utils.closeModal('modal-edit-meal');
    toast('Прием пищи удален');
    renderDay();
  }

  // ---------- Weight quick entry ----------
  let weightTargetDate = currentDate;

  function openWeightModal(dateKey) {
    weightTargetDate = dateKey || currentDate;
    const profile = Storage.getProfile();
    const latest = Storage.getLatestWeight();
    el('weight-input').value = latest ? latest.value : (profile ? profile.weightKg : '');
    Utils.openModal('modal-weight');
    el('weight-input').focus();
  }

  function onSaveWeight() {
    const value = Number(el('weight-input').value);
    if (!value || value <= 0) {
      toast('Укажите корректный вес', 'error');
      return;
    }
    Storage.addWeight(weightTargetDate, value);
    Utils.closeModal('modal-weight');
    toast('Вес сохранен');
    renderDay();
    if (typeof Stats !== 'undefined' && Stats.refresh) Stats.refresh();
  }

  // ---------- Init / event wiring ----------
  function bindEvents() {
    el('day-prev').addEventListener('click', () => changeDay(-1));
    el('day-next').addEventListener('click', () => changeDay(1));

    el('fab-add').addEventListener('click', openFabMenu);
    el('fab-overlay').addEventListener('click', (e) => {
      if (e.target.id === 'fab-overlay') closeFabMenu();
    });
    el('fab-photo').addEventListener('click', startPhotoFlow);
    el('fab-text').addEventListener('click', startTextFlow);
    el('fab-manual').addEventListener('click', startManualFlow);

    el('camera-close').addEventListener('click', closeCameraModal);
    el('camera-shutter').addEventListener('click', onCameraShutter);
    el('camera-flash').addEventListener('click', onCameraFlashToggle);

    el('btn-comment-calc').addEventListener('click', onCommentCalc);
    el('btn-preview-clarify-recalc').addEventListener('click', onPreviewClarifyRecalc);
    el('btn-preview-save').addEventListener('click', onPreviewSave);

    el('btn-manual-save').addEventListener('click', onManualSave);

    el('btn-edit-meal-ai').addEventListener('click', onEditMealAi);
    el('btn-save-edit-meal').addEventListener('click', onSaveEditMeal);
    el('btn-delete-meal').addEventListener('click', onDeleteMeal);

    el('btn-quick-weight').addEventListener('click', openWeightModal);
    el('btn-weight-save').addEventListener('click', onSaveWeight);

    // Generic close buttons (data-close attribute) for all modals
    $all('[data-close]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.close;
        if (id === 'modal-camera') closeCameraModal();
        else Utils.closeModal(id);
      });
    });
    $all('.modal-overlay').forEach((overlay) => {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
          if (overlay.id === 'modal-camera') closeCameraModal();
          else overlay.classList.add('hidden');
        }
      });
    });
  }

  function init() {
    currentDate = Utils.todayKey();
    bindEvents();
    renderDay();
  }

  return { init, renderDay, changeDay, openWeightModal };
})();
