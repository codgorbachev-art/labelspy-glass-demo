# LabelSpy — Glass UI Demo (Static PWA)

Современное статическое демо‑приложение в стиле «стекло» (Apple-like glass UI):

- OCR по фото (локально, в браузере через **Tesseract.js**)
- опционально — Cloud OCR через ваш endpoint (например, **Yandex Cloud Function**)
- поиск **E‑кодов** по локальной базе `data/e_additives_ru.json`
- эвристика аллергенов и «скрытых сахаров»
- «светофор» по сахар/жир/соль (на 100 г)
- история анализов (localStorage)
- PWA (service worker + manifest)

> Важно: это демо. Результаты OCR/эвристик нужно проверять глазами.

---

## Структура проекта

- `index.html` — интерфейс (glass UI)
- `styles.css` — дизайн
- `app.js` — логика (OCR/анализ/история/карточка)
- `data/e_additives_ru.json` — база E‑добавок
- `service-worker.js` — офлайн‑кэш
- `manifest.webmanifest` — PWA‑манифест
- `.github/workflows/pages.yml` — деплой на GitHub Pages через Actions

---

## Запуск локально

### Вариант 1: через любой статический сервер

```bash
# Python 3
python -m http.server 8080
```

Откройте: `http://localhost:8080`

### Вариант 2: через VS Code Live Server
Установите расширение Live Server и запустите `index.html`.

---

## Деплой на GitHub Pages (рекомендовано)

1) Создайте репозиторий на GitHub и залейте содержимое проекта в ветку `main`.

2) В репозитории откройте:
   - **Settings → Pages**
   - В разделе **Build and deployment** выберите **GitHub Actions** (если не выбрано)

3) После пуша в `main` workflow `Deploy to GitHub Pages` автоматически опубликует сайт.

Ссылка появится в разделе **Actions** (job `Deploy`) и в **Settings → Pages**.

---

## Cloud OCR (опционально)

В интерфейсе есть переключатель OCR:
- **Локально** — распознавание в браузере (без сервера)
- **Cloud** — распознавание через ваш HTTPS endpoint

Ожидаемый формат endpoint (пример для прокси‑функции):

**Request** (POST JSON):
```json
{
  "image": "<base64 без префикса data:...>",
  "mimeType": "JPEG",
  "languageCodes": ["ru","en"],
  "model": "page"
}
```

**Response** (JSON):
```json
{ "text": "..." }
```

### Почему изображение сжимается перед отправкой
Некоторые serverless‑платформы имеют ограничение на размер JSON запроса/ответа. Поэтому в `app.js` перед Cloud OCR:
- картинка уменьшается по стороне
- перекодируется в JPEG

---

## Обновление версии офлайн‑кэша

Если вы меняете файлы и хотите гарантированно сбросить старый кэш, увеличьте версию `CACHE` в `service-worker.js`:

```js
const CACHE = 'labelspy-glass-v1';
```

---

## Лицензия

См. `LICENSE`.
