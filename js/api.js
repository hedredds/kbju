/* api.js - AI integration: image compression + chat completions wrapper.
 * Default endpoint: https://bitter-night-9507.artem-kyznitsov2007.workers.dev/v1/chat/completions
 * Text analysis model: gemini-2.5-flash-lite
 * Photo analysis model: gemini-2.5-flash
 */
'use strict';

const Api = (() => {
  const DEFAULT_BASE_URL = 'https://bitter-night-9507.artem-kyznitsov2007.workers.dev/v1';
  const REQUEST_TIMEOUT_MS = 45000;

  // Builds the full chat completions endpoint from a configurable base URL,
  // trimming any trailing slash(es) so "https://host/v1/" and "https://host/v1"
  // both resolve to the same correct endpoint.
  function buildEndpoint(baseUrl) {
    const base = (baseUrl || DEFAULT_BASE_URL).trim().replace(/\/+$/, '');
    return `${base}/chat/completions`;
  }

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

  // Extracts the most informative human-readable text out of an HTTP error
  // response body (JSON error object, plain text, or falls back to status).
  async function extractServerErrorText(response) {
    let bodyText = '';
    try {
      bodyText = await response.text();
    } catch (e) {
      return '';
    }
    if (!bodyText) return '';
    try {
      const parsed = JSON.parse(bodyText);
      const msg = parsed?.error?.message || parsed?.message || parsed?.error;
      if (typeof msg === 'string' && msg.trim()) return msg.trim();
    } catch (e) {
      // not JSON - use raw text below
    }
    return bodyText.trim().slice(0, 500);
  }

  async function buildHttpError(response) {
    const serverText = await extractServerErrorText(response);
    const prefix = `Ошибка запроса к ИИ: HTTP ${response.status} ${response.statusText || ''}`.trim();
    return new Error(serverText ? `${prefix}. Ответ сервера: ${serverText}` : `${prefix}.`);
  }

  async function callChatCompletions({ apiKey, baseUrl, model, messages }) {
    const endpoint = buildEndpoint(baseUrl);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    let response;
    try {
      try {
        response = await fetch(endpoint, {
          method: 'POST',
          headers: buildHeaders(apiKey),
          body: JSON.stringify({
            model,
            messages,
            temperature: 0.3
          }),
          signal: controller.signal
        });
      } catch (e) {
        if (e.name === 'AbortError') {
          throw new Error('Сервис ИИ не ответил за 45 секунд - запрос прерван по таймауту. Попробуйте еще раз.');
        }
        // A TypeError from fetch with no HTTP response usually means the request
        // never reached the server - most commonly a CORS block, an unreachable/
        // incorrect domain, or (less often) no network connectivity.
        if (e instanceof TypeError) {
          throw new Error(
            `Не удалось выполнить запрос к "${endpoint}" (${e.message}). ` +
            `Вероятная причина - блокировка CORS этим доменом или неверный Base URL в настройках API. ` +
            `Проверьте Base URL и, если возможно, доступность сервера.`
          );
        }
        throw new Error(`Не удалось связаться с сервисом ИИ: ${e.message || e}`);
      }

      if (!response.ok) {
        throw await buildHttpError(response);
      }

      let data;
      try {
        data = await response.json();
      } catch (e) {
        throw new Error('Сервис ИИ вернул некорректный (не-JSON) ответ.');
      }

      const content = data?.choices?.[0]?.message?.content;
      if (!content) throw new Error('Пустой ответ от сервиса ИИ.');
      return extractJson(content);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  // ---------- Image compression (Canvas) ----------
  // Returns a base64 JPEG data URL compressed to maxDim px, quality `quality`.
  // Default 640px/0.6 keeps requests to the AI small enough to fly through the
  // proxy instantly, avoiding timeouts, while staying sharp enough for
  // reliable food recognition.
  function compressImage(file, maxDim = 640, quality = 0.6) {
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
  function compressDataUrl(dataUrl, maxDim = 640, quality = 0.6) {
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
  async function analyzeText({ apiKey, baseUrl, model, text, clarificationAnswer }) {
    let userContent = `Описание блюда от пользователя: "${text}"`;
    if (clarificationAnswer) {
      userContent += `\nОтвет пользователя на уточняющий вопрос: "${clarificationAnswer}"`;
    }
    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userContent }
    ];
    return callChatCompletions({ apiKey, baseUrl, model, messages });
  }

  async function analyzePhoto({ apiKey, baseUrl, model, imageDataUrl, text, clarificationAnswer }) {
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
    return callChatCompletions({ apiKey, baseUrl, model, messages });
  }

  return {
    DEFAULT_BASE_URL,
    buildEndpoint,
    compressImage, compressDataUrl, makeThumbnail, dataUrlFromBlob,
    analyzeText, analyzePhoto,
    extractJson
  };
})();
