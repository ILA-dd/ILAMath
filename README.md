<h1 align="center">ILAMath</h1>
<p align="center">Образовательная платформа по математике для 7-11 классов</p>

<p align="center">
  <a href="study/index-test.html">Главная</a>
  ·
  <a href="study/index.html">Каталог тем</a>
  ·
  <a href="mailto:support@ilamath.ru">Поддержка</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Stack-HTML%20%7C%20CSS%20%7C%20JavaScript-1f6feb" alt="Stack">
  <img src="https://img.shields.io/badge/Site-Static-0f766e" alt="Site Type">
  <img src="https://img.shields.io/badge/Classes-7--11-0ea5e9" alt="Classes">
</p>

## О проекте

ILAMath - статический образовательный сайт с материалами по алгебре, геометрии, математическому анализу и теории вероятности.

Проект разделен на:
- welcome-страницу (`study/index-test.html`);
- каталог материалов (`study/index.html`);
- отдельные учебные страницы по темам для 7-9 и 10-11 классов.

## Ключевые возможности

- Быстрый переход по классам и темам.
- 16+ разделов с формулами, объяснениями и примерами.
- Адаптивный интерфейс с мобильным меню.
- Анимации появления карточек и удобная навигация по якорям.
- Готовый роутинг для деплоя на Vercel.

## Каталог тем

### 7-9 классы

- [Линейные уравнения](study/g7a9/linear-equations/index.html)
- [Квадратные уравнения](study/g7a9/quadratic-equations/index.html)
- [Свойства функции](study/g7a9/function-properties/index.html)
- [Функции и графики](study/g7a9/functions-graphs/index.html)
- [Площади фигур](study/g7a9/areas/index.html)
- [Теорема Пифагора](study/g7a9/pythagoras/index.html)
- [Подобие треугольников](study/g7a9/similarity/index.html)
- [Окружность и круг](study/g7a9/circle-disk/index.html)

Дополнительные подразделы:
- [Метод Гаусса](study/g7a9/linear-equations/gauss-method/index.html)
- [Матрицы и определители](study/g7a9/linear-equations/matrices-determinants/index.html)

### 10-11 классы

- [Производная](study/g10a11/derivative/index.html)
- [Интеграл](study/g10a11/integrall/index.html)
- [Пределы](study/g10a11/limits/index.html)
- [Тригонометрия](study/g10a11/trigonometry/index.html)
- [Логарифмы](study/g10a11/logarithms/index.html)
- [Комплексные числа](study/g10a11/complex-numbers/index.html)
- [Вероятность](study/g10a11/probability/index.html)
- [Стереометрия](study/g10a11/stereometry/index.html)

## Быстрый старт

1. Клонируйте репозиторий:

```bash
git clone https://github.com/<user>/<repo>.git
cd <repo>
```

2. Запустите локальный сервер:

```bash
python -m http.server 8080
```

3. Откройте в браузере:
- `http://localhost:8080/` (редирект на welcome-страницу);
- `http://localhost:8080/study/index.html` (каталог тем).

## Структура проекта

```text
.
|-- index.html                  # редирект на study/index-test.html
|-- study/
|   |-- index-test.html         # welcome-страница
|   |-- index.html              # каталог материалов
|   |-- g7a9/                   # темы 7-9 классов
|   `-- g10a11/                 # темы 10-11 классов
|-- assets/
|   |-- home-test.css/js        # стили и логика welcome-страницы
|   `-- home.css/js             # стили и логика каталога
|-- style.css                   # общие стили учебных страниц
|-- script.js                   # общая логика учебных страниц
|-- scripts/validate-links.ps1  # проверка локальных ссылок
`-- vercel.json                 # редиректы для Vercel
```

## Деплой на Vercel

`vercel.json` уже настроен на редиректы:
- `/` -> `/study/index-test.html`
- `/study` -> `/study/index-test.html`
- `/study/` -> `/study/index-test.html`

Для деплоя:
1. Запушьте репозиторий на GitHub.
2. В Vercel выберите `Add New -> Project`.
3. Импортируйте репозиторий и нажмите `Deploy` (preset `Other`, без build-команды).

## Проверка битых локальных ссылок

Windows PowerShell:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\validate-links.ps1
```

PowerShell 7 (`pwsh`):

```bash
pwsh -File ./scripts/validate-links.ps1
```

## Контакты

- Поддержка: [support@ilamath.ru](mailto:support@ilamath.ru)
