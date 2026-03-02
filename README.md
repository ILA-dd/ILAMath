# ILAMath Static Site

Статический сайт по математике для 7-11 классов.

## Структура

- `index.html` — корневая точка входа (редирект в `study/index-test.html`)
- `study/index-test.html` — главная (welcome) страница
- `study/index.html` — страница материалов и тем
- `study/g7a9/<topic>/index.html` — темы 7-9 классов
- `study/g10a11/<topic>/index.html` — темы 10-11 классов
- `assets/home-test.css`, `assets/home-test.js` — стили/логика welcome-страницы
- `assets/home.css`, `assets/home.js` — стили/логика страницы материалов
- `style.css`, `script.js` — общие стили и JS страниц тем
- `vercel.json` — роутинг для Vercel
- `scripts/validate-links.ps1` — проверка битых локальных ссылок

## Локальный запуск

1. Быстрый вариант: открыть `index.html` двойным кликом.
2. Рекомендуемый вариант (через сервер):

```powershell
python -m http.server 8080
```

После этого открыть:

- `http://localhost:8080/` (редирект на welcome)
- или `http://localhost:8080/study/index-test.html`

## Публикация на GitHub

```powershell
git init
git add .
git commit -m "Prepare ILAMath for Vercel deploy"
git branch -M main
git remote add origin https://github.com/<user>/<repo>.git
git push -u origin main
```

## Деплой на Vercel (через GitHub)

1. Загрузить репозиторий на GitHub.
2. В Vercel нажать `Add New -> Project`.
3. Выбрать репозиторий с этим сайтом.
4. Framework Preset: `Other`.
5. Build Command: пусто.
6. Output Directory: пусто (или `.`).
7. Нажать `Deploy`.

`vercel.json` уже настроен так, что:

- `/` -> `study/index-test.html`
- `/study` -> `study/index-test.html`

А `study/index.html` остается страницей материалов.

## Проверка ссылок

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\validate-links.ps1
```
