# Yandex Cloud Function — OCR proxy для LabelSpy

Папка `cloud/yandex-function` содержит минимальную **Node.js** функцию‑прокси, которая:

1) принимает HTTP `POST` с JSON `{ image, mimeType, languageCodes, model }`  
2) вызывает **Yandex Vision OCR** (`recognizeText`)  
3) возвращает JSON `{ text }`

Это удобно, когда вы хотите:
- держать ключ Vision API **на сервере**, а не в браузере
- контролировать CORS/квоты/логирование
- использовать Cloud OCR в интерфейсе LabelSpy (переключатель **OCR → Cloud**)

---

## Переменные окружения

- `VISION_API_KEY` (обязательно) — API key сервисного аккаунта с доступом к Vision OCR
- `ALLOWED_ORIGINS` (опционально) — список Origin для CORS через запятую (по умолчанию `*`)
- `DATA_LOGGING_ENABLED` (опционально) — `true/false` для заголовка `x-data-logging-enabled` (по умолчанию `false`)

---

## Развёртывание (пошагово, на уровне действий)

1) В Yandex Cloud создайте сервисный аккаунт и выдайте ему права на Vision OCR (обычно роль вида `ai.vision.user`).

2) Создайте **API key** для сервисного аккаунта и сохраните его значение.

3) Создайте Cloud Function:
   - Runtime: **Node.js**
   - Source: загрузите файл `index.js` из этой папки
   - Environment variables: добавьте `VISION_API_KEY=<ваш ключ>`

4) Разрешите публичный вызов функции (unauthenticated invoke), если вы хотите вызывать её напрямую из браузера.

5) Скопируйте URL вызова функции (invoke URL).

6) В веб‑приложении:
   - включите OCR → **Cloud**
   - вставьте URL в поле **Cloud OCR endpoint**
   - нажмите **Распознать**

---

## Формат запроса/ответа

### Request
```json
{
  "image": "<base64 без префикса data:...>",
  "mimeType": "JPEG",
  "languageCodes": ["ru","en"],
  "model": "page"
}
```

### Response
```json
{ "text": "..." }
```

---

## Практические советы

- Cloud Functions обычно имеет ограничения на размер запросов. Поэтому фронтенд уменьшает картинку и конвертирует её в JPEG перед отправкой.
- Для более «промышленного» варианта используйте API Gateway перед функцией: там проще ограничивать частоту/ключи/домены и централизовать CORS.
