/* nutrition.js - Mifflin-St Jeor BMR/TDEE calculation and macro distribution. */
'use strict';

const Nutrition = (() => {
  // Activity multipliers (standard Harris/Mifflin PAL coefficients)
  const ACTIVITY_FACTORS = {
    sedentary: 1.2,     // малоподвижный
    light: 1.375,       // легкая активность (1-3 тренировки/нед)
    moderate: 1.55,     // средняя активность (3-5 тренировок/нед)
    high: 1.725,        // высокая активность (6-7 тренировок/нед)
    very_high: 1.9       // очень высокая (физический труд + тренировки)
  };

  // Goal adjustments applied to TDEE (kcal delta)
  const GOAL_DELTA = {
    lose: -500,     // похудение
    maintain: 0,    // поддержание
    gain: 400       // набор массы
  };

  function bmrMifflin({ sex, weightKg, heightCm, age }) {
    const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
    return sex === 'male' ? base + 5 : base - 161;
  }

  function tdee(bmr, activityKey) {
    const factor = ACTIVITY_FACTORS[activityKey] || ACTIVITY_FACTORS.sedentary;
    return bmr * factor;
  }

  function targetKcal(tdeeValue, goalKey) {
    const delta = GOAL_DELTA[goalKey] !== undefined ? GOAL_DELTA[goalKey] : 0;
    const result = tdeeValue + delta;
    return Math.max(1200, Math.round(result));
  }

  // Macro split by goal: protein g/kg body weight, fat % of kcal, carbs = rest
  function macroTargets({ kcal, weightKg, goalKey }) {
    const proteinPerKg = goalKey === 'lose' ? 1.8 : goalKey === 'gain' ? 1.9 : 1.6;
    const fatRatio = goalKey === 'lose' ? 0.28 : 0.3;

    const proteinG = Math.round(proteinPerKg * weightKg);
    const proteinKcal = proteinG * 4;

    const fatKcal = Math.round(kcal * fatRatio);
    const fatG = Math.round(fatKcal / 9);

    const carbsKcal = Math.max(0, kcal - proteinKcal - fatKcal);
    const carbsG = Math.round(carbsKcal / 4);

    return { kcal: Math.round(kcal), protein: proteinG, fat: fatG, carbs: carbsG };
  }

  // Full pipeline: profile -> { bmr, tdee, targets }
  function calcTargets(profile) {
    const { sex, weightKg, heightCm, age, activity, goal } = profile;
    const bmr = bmrMifflin({ sex, weightKg, heightCm, age });
    const tdeeValue = tdee(bmr, activity);
    const kcal = targetKcal(tdeeValue, goal);
    const targets = macroTargets({ kcal, weightKg, goalKey: goal });
    return {
      bmr: Math.round(bmr),
      tdee: Math.round(tdeeValue),
      targets
    };
  }

  // ---------- Day totals ----------
  function sumMeals(meals) {
    return meals.reduce(
      (acc, m) => {
        acc.kcal += Number(m.kcal) || 0;
        acc.protein += Number(m.protein) || 0;
        acc.fat += Number(m.fat) || 0;
        acc.carbs += Number(m.carbs) || 0;
        return acc;
      },
      { kcal: 0, protein: 0, fat: 0, carbs: 0 }
    );
  }

  function sumIngredients(ingredients) {
    return ingredients.reduce(
      (acc, ing) => {
        acc.kcal += Number(ing.kcal) || 0;
        acc.protein += Number(ing.protein) || 0;
        acc.fat += Number(ing.fat) || 0;
        acc.carbs += Number(ing.carbs) || 0;
        return acc;
      },
      { kcal: 0, protein: 0, fat: 0, carbs: 0 }
    );
  }

  function kgToLb(kg) {
    return kg * 2.20462;
  }
  function lbToKg(lb) {
    return lb / 2.20462;
  }
  function cmToFtIn(cm) {
    const totalInches = cm / 2.54;
    const ft = Math.floor(totalInches / 12);
    const inches = Math.round(totalInches - ft * 12);
    return { ft, inches };
  }
  function ftInToCm(ft, inches) {
    return (ft * 12 + inches) * 2.54;
  }

  return {
    ACTIVITY_FACTORS, GOAL_DELTA,
    bmrMifflin, tdee, targetKcal, macroTargets, calcTargets,
    sumMeals, sumIngredients,
    kgToLb, lbToKg, cmToFtIn, ftInToCm
  };
})();
