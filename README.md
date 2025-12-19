# Tabi

Tabi is a command palette that sits on top of your browser and lets you tell an AI assistant what to do with your tabs in plain English. Ask it to clean up distractions, find a tab you lost, or spin up an entire research workspace and Tabi will take care of the clicks for you.

## Features

- **One command bar for everything.** Tap the toolbar icon or `Cmd + K` (`Ctrl + Shift + K` on Windows) to open Tabi anywhere and type natural language requests.
- **Understands your current window.** The extension sends the titles, urls, and groupings of your open tabs so the assistant always reasons over the real state of your browser.
- **Cleans and organizes.** Ask to close redundant tabs, regroup workspaces (ex: "sort my school tabs by class"), or move noisy tabs into an "Ungrouped" bucket.
- **Bootstraps new sessions.** Describe a task ("plan a Yosemite trip") and the backend suggests and opens a curated set of tabs inside a labeled Chrome group.
- **Remembers quick actions.** Autocomplete lets you jump to any tab, bookmark, or common Chrome page (Settings, Downloads, Extensions, etc.) before you even talk to the agent.

## Architecture

| Layer | Purpose | Key Files |
| --- | --- | --- |
| Chrome extension | Injects the overlay UI (`content.js`), listens for hotkeys (`background.js`), renders the command bar (`popup.html/css/js`), and applies agent decisions by grouping, closing, or opening tabs. | `extension/*` |
| Backend API | FastAPI app that accepts `/agent` requests from the extension, enforces user/IP/global rate limits via Redis, and returns structured instructions the extension can execute safely. | `backend/app.py` |
| Agent runtime | Runs a `pydantic_ai.Agent` powered by Gemini 2.5 Flash. It receives the prompt plus tab context, chooses an action (`search_tabs`, `close_tabs`, `organize_tabs`, `generate_tabs`), and sends a strictly typed payload back. | `backend/main.py`, `backend/schemas.py` |


### Data flow
1. The user opens the overlay; `popup.js` collects the active window's tabs and tab groups and displays autocomplete suggestions from tabs, bookmarks, and curated Chrome pages.
2. When the user submits a request, the extension posts `{prompt, context}` to `POST /agent`. The `context` contains sanitized tab metadata plus a persistent `client_id` stored in `chrome.storage`.
3. `backend/app.py` checks Redis counters to rate-limit by client, IP, and globally, then forwards the request to the agent (`run_agent` in `backend/main.py`).
4. The agent reasons over the provided context and returns a schema-validated object (defined in `backend/schemas.py`).
5. The extension interprets `result.action`:
   - `organize_tabs`: regroups open tabs, collapsing them with deterministic colors.
   - `generate_tabs`: opens new tabs and stores them in a freshly named group.
   - `search_tabs`: focuses a matching tab via the background service worker.
   - `close_tabs`: closes tabs whose titles/urls match the payload.

## Local setup

### Requirements
- Python 3.10+ (the repo includes a `venv/` folder, but create your own virtual environment).
- Redis (cloud URL or local instance).
- Google API key with access to Gemini 2.5 Flash (used through `pydantic-ai`'s `google-gla` provider).
- Google Chrome (or Chromium) with Developer Mode enabled for loading unpacked extensions.

### Configure environment variables

Create a `.env` file at the repository root with the following keys. Never commit real secrets.

```bash
GEMINI_API_KEY=your_key             # Used by pydantic-ai's Gemini backend
GOOGLE_API_KEY=your_key             # Alias used by some Google SDKs
REDIS_API_LINK=hostname_or_ip       # Redis host (or localhost if you run your own)
REDIS_API_PWD=strong_password       # Redis auth password
MONGO_USERNAME=optional_if_used
MONGO_PWD=optional_if_used
```

If you prefer a local Redis container instead of a cloud instance you can run:

```bash
docker run -p 6379:6379 -e REDIS_PASSWORD=tabi redis redis-server --requirepass tabi
```

Then point `REDIS_API_LINK=127.0.0.1` and update the password/port in `backend/app.py`.

### Install backend dependencies

```bash
cd backend
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install --upgrade pip
pip install fastapi uvicorn[standard] redis python-dotenv pydantic pydantic-ai
```

> Tip: create a `requirements.txt` once you've stabilized the dependency list.

### Run the API locally

```bash
uvicorn app:app --reload --host 0.0.0.0 --port 8000
```

- `GET /` responds with `{"status": "Tabi's backend is live!"}`.
- `POST /agent` accepts:

```jsonc
{
  "prompt": "close the distracting tabs",
  "context": {
    "client_id": "uuid-from-chrome-storage",
    "tabs": [
      {
        "group_name": "Work",
        "tabs": [
          {"title": "Sprint doc", "url": "...", "description": "..."}
        ]
      }
    ]
  }
}
```

It returns `{ "action": "close_tabs", "output": {...} }`.

### Load the Chrome extension
1. Update `BACKEND_URL` in `extension/popup.js` if your API is not running on `http://127.0.0.1:8000`.
2. Open Chrome → `chrome://extensions` → enable **Developer mode**.
3. Click **Load unpacked**, select the `extension/` directory.
4. Pin the extension or press `Cmd + K` / `Ctrl + Shift + K` (declared in `manifest.json`) to toggle the overlay.
5. Watch the console (`chrome://extensions → Inspect views`) for logs if something misbehaves.

### Landing page preview (optional)

The `landing-page/` folder is a static site. Open `landing-page/index.html` directly in a browser or serve it via any static file server if you need live reload.

## Development tips
- The backend enforces global, per-client, and per-IP rate limits; when testing locally you can temporarily lower the `RATE_LIMIT`, `IP_RATE_LIMIT`, and `GLOBAL_RATE_LIMIT` constants in `backend/app.py`.
- `popup.js` is the integration point for new agent actions—extend the `handleAgentResponse` switch and add new schema types in `backend/schemas.py` when expanding capabilities.
- When adjusting styling, remember the UI runs inside a shadow DOM injected by `content.js`, so global page styles will not leak in.

Happy tab taming!
