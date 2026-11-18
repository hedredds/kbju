/* api.js - RuRout AI integration: image compression + chat completions wrapper.
 * Endpoint: https://rurout.online/v1/chat/completions
 * Text analysis model: gpt-6-luna
 * Photo analysis model: gemini-2.5-flash
 */
'use strict';

const Api = (() => {
  const ENDPOINT = 'https://rurout.online/v1/chat/completions';

  const SYSTEM_PROMPT = `Ты - нутрициолог-эксперт, который анализирует еду по фото или текстовому описанию и оценивает её состав.
Отвечай ТОЛЬКО валидным JSON без markdown-разметки, без пояснений вне JSON, в следующем формате:
{
  "title": "короткое название блюда на русском",
  "ingredients": [
    {"name": "название ингредиента", "weight_g": число, "kcal": число, "protein": число, "fat": число, "carbs": число}
  ],
  "clarification_question": "вопрос пользователю, если данных не хватает для точной оценки, иначе null"
}
Правила:
- Все числовые поля - это числа (не строки), калории и БЖУ указывай для всего количества ингредиента (не на 100г).
- Если по фото/тексту видно несколько ингредиентов - разбей на отдельные пункты списка.
- Если информации достаточно для оценки - clarification_question строго null.
- Если не хватает важных деталей (например не видно размер порции, или не указан способ приготовления, который сильно влияет на калорийность) - задай ОДИН короткий уточняющий вопрос в clarification_question, но при этом всё равно дай лучшую возможную оценку в ingredients.
- Никогда не добавляй текст до или после JSON объекта.`;

  function buildHeaders(apiKey) {
    const headers = { 'Content-Type': 'application/json' };
    if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;
    return headers;
  }

  function extractJson(text) {
    if (!text) throw new Error('Пустой ответ от ИИ');
    let cleaned = text.trim();
    // Strip markdown code fences if present
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');
    if (firstBrace === -1 || lastBrace === -1) {
      throw new Error('Не удалось найти JSON в ответе ИИ');
    }
    const jsonStr = cleaned.slice(firstBrace, lastBrace + 1);
    try {
      return JSON.parse(jsonStr);
    } catch (e) {
      throw new Error('Не удалось разобрать JSON от ИИ: ' + e.message);
    }
  }

  function errorMessageForStatus(status) {
    if (status === 401 || status === 403) return 'Неверный или отсутствующий API-ключ. Проверьте ключ в настройках.';
    if (status === 429) return 'Превышен лимит запросов к ИИ. Попробуйте позже.';
    if (status >= 500) return 'Сервис ИИ временно недоступен. Попробуйте позже.';
    return `Ошибка запроса к ИИ (код ${status}).`;
  }

  async function callChatCompletions({ apiKey, model, messages }) {
    let response;
    try {
      response = await fetch(ENDPOINT, {
        method: 'POST',
        headers: buildHeaders(apiKey),
        body: JSON.stringify({
          model,
          messages,
          temperature: 0.3
        })
      });
    } catch (e) {
      throw new Error('Не удалось связаться с сервисом ИИ. Проверьте интернет-соединение.');
    }

    if (!response.ok) {
      throw new Error(errorMessageForStatus(response.status));
    }

    let data;
    try {
      data = await response.json();
    } catch (e) {
      throw new Error('Сервис ИИ вернул некорректный ответ.');
    }

    const content = data?.choices?.[0]?.message?.content;
    if (!content) throw new Error('Пустой ответ от сервиса ИИ.');
    return extractJson(content);
  }

  // ---------- Image compression (Canvas) ----------
  // Returns a base64 JPEG data URL compressed to maxDim px, quality `quality`.
  function compressImage(file, maxDim = 1000, quality = 0.7) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Не удалось прочитать файл изображения.'));
      reader.onload = () => {
        img.onload = () => {
          try {
            let { width, height } = img;
            if (width > height && width > maxDim) {
              height = Math.round((height * maxDim) / width);
              width = maxDim;
            } else if (height > maxDim) {
              width = Math.round((width * maxDim) / height);
              height = maxDim;
            }
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);
            resolve(canvas.toDataURL('image/jpeg', quality));
          } catch (e) {
            reject(e);
          }
        };
        img.onerror = () => reject(new Error('Не удалось загрузить изображение.'));
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  // Compress from an already-loaded data URL (e.g. camera capture) to a
  // smaller thumbnail for localStorage persistence (~300px).
  function makeThumbnail(dataUrl, maxDim = 300, quality = 0.6) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        try {
          let { width, height } = img;
          if (width > height && width > maxDim) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else if (height > maxDim) {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', quality));
        } catch (e) {
          reject(e);
        }
      };
      img.onerror = () => reject(new Error('Не удалось создать миниатюру.'));
      img.src = dataUrl;
    });
  }

  function dataUrlFromBlob(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('Не удалось прочитать изображение.'));
      reader.readAsDataURL(blob);
    });
  }

  // Compress a data URL (not a File) - used for camera captures which are
  // already data URLs produced by canvas.toDataURL in camera.js.
  function compressDataUrl(dataUrl, maxDim = 1000, quality = 0.7) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        try {
          let { width, height } = img;
          if (width > height && width > maxDim) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else if (height > maxDim) {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', quality));
        } catch (e) {
          reject(e);
        }
      };
      img.onerror = () => reject(new Error('Не удалось обработать фото.'));
      img.src = dataUrl;
    });
  }

  // ---------- High-level analysis calls ----------
  async function analyzeText({ apiKey, model, text, clarificationAnswer }) {
    let userContent = `Описание блюда от пользователя: "${text}"`;
    if (clarificationAnswer) {
      userContent += `\nОтвет пользователя на уточняющий вопрос: "${clarificationAnswer}"`;
    }
    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userContent }
    ];
    return callChatCompletions({ apiKey, model, messages });
  }

  async function analyzePhoto({ apiKey, model, imageDataUrl, text, clarificationAnswer }) {
    let userText = text && text.trim()
      ? `Комментарий пользователя к фото: "${text.trim()}"`
      : 'Определи состав блюда на фото.';
    if (clarificationAnswer) {
      userText += `\nОтвет пользователя на уточняющий вопрос: "${clarificationAnswer}"`;
    }
    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: [
          { type: 'text', text: userText },
          { type: 'image_url', image_url: { url: imageDataUrl } }
        ]
      }
    ];
    return callChatCompletions({ apiKey, model, messages });
  }

  return {
    ENDPOINT,
    compressImage, compressDataUrl, makeThumbnail, dataUrlFromBlob,
    analyzeText, analyzePhoto,
    extractJson
  };
})();
