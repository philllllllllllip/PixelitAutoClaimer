# Pixelit Bot

Simple bot for logging in and claiming the daily reward on the Pixelit site.

## Setup

1. Copy `.env.example` to `.env`.
2. Fill in your credentials:
   - `PIXELIT_USERNAME`
   - `PIXELIT_PASSWORD`
3. Update `SITE_URL` only if the site address changes.

## Install

```bash
npm install
```

## Run

```bash
node bot.js
```

The bot will:
- log in using the credentials in `.env`
- check the account state
- claim the daily wheel reward automatically when ready

## Ignore

Do not commit:
- `.env`
- `node_modules/`
- temporary debug files
