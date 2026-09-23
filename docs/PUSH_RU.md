# Как перенести фронтенд в свою ветку

Архив содержит полный проект. Backend не изменён. ZIP не содержит `.git`,
`node_modules`, базы с аккаунтами или тестовых данных.

## 1. Открой свой существующий репозиторий

```bash
cd ~/G-WEB-500-BAR-5-1-dashboard-1
git status
```

Если есть свои незакоммиченные изменения, сначала сохрани их отдельно или
сделай свой коммит. Не перезаписывай файлы, в которых сейчас работает коллега.

## 2. Переключись в свою ветку

Если ветка ещё не создана:

```bash
git switch -c frontend-mark
```

Если ветка уже существует, используй `git switch ИМЯ_ТВОЕЙ_ВЕТКИ`.
`frontend-mark` — пример имени, можешь выбрать своё.

## 3. Перенеси только изменённые файлы

Распакуй архив отдельно. Из распакованной папки скопируй в свой репозиторий:

- `public/index.html`
- `public/styles.css`
- `public/app.js`
- `public/data.js` (новый файл)
- `package.json`
- `package-lock.json`
- `README.md`
- `tests/frontend.cjs` (новый файл)
- `docs/frontend.md`, `docs/PUSH_RU.md`, `docs/bootstrap.md` (новые файлы)

В `package.json` добавлена только dev-зависимость Playwright и команда
`test:frontend`. Если коллеги уже поменяли этот файл, объедини изменения,
а не заменяй их версию целиком. Файлы `server/`, `auth/`, `books/`, Dockerfile
и docker-compose.yml переносить для этого фронтенда не нужно.

## 4. Запусти и проверь

```bash
npm ci
npm start
```

Открой http://localhost:8080. Создай аккаунт, подтверди его кнопкой,
выполни вход, добавь виджеты. Для GitHub и RSS сначала включи сервис
на странице Services. Для тестов в другом терминале:

```bash
npx playwright install chromium
npm run test:frontend
```

## 5. Сделай коммит и пуш

```bash
git diff --stat
git diff --check
git add public/index.html public/styles.css public/app.js public/data.js
git add package.json package-lock.json README.md tests/frontend.cjs
git add docs/frontend.md docs/PUSH_RU.md docs/bootstrap.md
git diff --cached --stat
git commit -m "feat: implement responsive dashboard frontend"
git push -u origin HEAD
```

`HEAD` отправит именно текущую ветку. Перед пушем можно проверить её командой
`git branch --show-current`. Авторизация GitHub используется уже настроенная
у тебя в терминале. Пуш из этого чата не выполнялся.

## Что ещё нужно сделать команде

Сейчас backend объявляет 3 сервиса и 9 виджетов. По заданию нужны минимум
`1 + X` сервисов и `3 × X` виджетов, где `X` — количество студентов.
Подписки на сервере, OAuth приватных сервисов, рассылка подтверждения и
RSS-прокси остаются задачами backend; их нельзя считать выполненными
за счёт готового интерфейса. Подробнее — README и docs/frontend.md.
