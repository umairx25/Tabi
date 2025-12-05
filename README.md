# Tabi
Your AI-powered copilot that turns messy browser sessions into a tidy workspace. Ask Tabi to find a tab, clean up distractions, or spin up a fresh research workspace and it does the heavy lifting for you.

## Features
- **Find anything instantly:** Tell Tabi “take me back to the CNN article about AI regulation” and it hops to the right tab.
- **Declutter with one request:** “Close the old Figma files” or “clean up shopping tabs” removes the noise.
- **Auto-organize:** Group tabs by project or topic so you can collapse entire workstreams.
- **Start new tasks faster:** Ask for “tabs to plan a Yosemite trip” and Tabi opens a curated set (maps, guides, bookings, etc.).
- **Keyboard-first experience:** Launch the command bar with `Cmd/Ctrl + K` or by clicking the extension icon and stay in flow.

## Feature Highlights
- Natural‑language control over existing tabs (search, focus, group, close).
- Curated tab packs generated for a goal (study, shopping, planning, etc.).
- Runs entirely inside Chrome/Edge via a lightweight popup UI.
- Fast feedback with status messaging so the user always knows what Tabi is doing.
- Privacy-aware: only the titles/URLs of your current tabs are sent to the backend for processing.

## Architecture Overview
```
Browser Extension (popup.js / content.js)
          │
          ├─ collects open tabs + user request
          ▼
FastAPI Backend (backend/app.py)
          │
          ├─ workflow.run_agent → LangChain agent
          ▼
Google Gemini via LangChain Tools (backend/workflow.py & tools.py)
          │
          └─ Returns structured action (search_tabs, organize_tabs, generate_tabs, close_tabs)
```

- **Browser extension** (`extension/`) hosts the popup UI, keyboard shortcut listener, and Chrome APIs for tab management.
- **FastAPI backend** (`backend/app.py`) exposes `/agent`, forwards prompts plus tab context, and returns an action + payload.
- **Agent workflow** (`backend/workflow.py`) builds a LangChain agent backed by Google Gemini, logs the tool that ran, and enforces structured outputs defined in `backend/schemas.py`.
- **Tools layer** (`backend/tools.py`) implements the tab-centric actions Tabi can perform. Each tool strictly returns a schema so the frontend can trust the shape of the response.

## Repository Layout
```
backend/        FastAPI app, LangChain workflow, tool definitions, schemas
extension/      Chrome extension (popup, background worker, content script, config)
landing-page/   Marketing site (static assets)
pytest.ini      Root pytest config if you add tests
```

## Local Setup

### 1. Prerequisites
- Python 3.10+
- Chrome or Chromium-based browser
- (Optional) `uvicorn` for hot reload

### 2. Configure Environment Variables
Create a `.env` file at the project root:
```
GEMINI_API_KEY=your-google-gemini-key
GOOGLE_API_KEY=your-google-gemini-key         # kept for langchain compatibility
# Optional services used in experiments
REDIS_API_LINK=
REDIS_API_PWD=
MONGO_USERNAME=
MONGO_PWD=
```

### 3. Install Backend Dependencies
```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
```

### 4. Run the Backend
```bash
cd backend
uvicorn app:app --reload --port 8000
# or
python app.py
```
The API exposes:
- `GET /` health check.
- `POST /agent` → body `{ "prompt": "...", "context": { "tabs": [...] } }`.

### 5. Load the Browser Extension
1. Open Chrome → `chrome://extensions`.
2. Toggle **Developer mode**.
3. **Load unpacked** → choose the `extension/` folder.
4. Update `extension/config.js` if your backend runs on a non-default URL.
5. Pin “Tabi” and/or use the `Cmd/Ctrl + Shift + K` shortcut defined in `manifest.json`.

### 6. Daily Workflow
1. Start the backend (step 4).
2. Open the extension popup (icon or shortcut).
3. Type a natural-language request and let Tabi modify your browser.
4. Watch status messages in the popup for progress/errors.

## Development Notes
- LangChain tool invocations are logged in the backend console (`print("Tool returned:", ...)`) to help you see which tool responded to a request.
- All tool responses rely on structured Pydantic schemas. If you add a new action, create a schema in `backend/schemas.py`, a tool in `backend/tools.py`, then register it by leaving it in the module’s globals (it is auto-discovered).
- The extension expects a JSON payload shaped like the schemas, so keep backwards compatibility when updating outputs.
- The backend CORS config is currently wide open (`allow_origins=["*"]`). Tighten this before shipping publicly.

## Testing Ideas
- Hit `POST /agent` using curl or VS Code REST client with mock tab data to verify Gemini responses before wiring the extension.
- In Chrome, use the Extensions page “service worker” console to debug `background.js` events and ensure the popup is toggled correctly.
- Add unit tests in `backend/` targeting tool prompts or schema validation if you expand the agent’s capabilities.


