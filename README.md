# Tabi

## TL;DR
Tabi is a lightweight Chrome extension for fast tab switching and universal Chrome search. Press one shortcut to jump to recent tabs, search open tabs, open bookmarks, launch common Chrome pages, ask AI for browser actions, or fall back to a Google search.

## GitHub
[https://github.com/umairx25/Tabi](https://github.com/umairx25/Tabi)

Demo: [YouTube walkthrough](https://www.youtube.com/watch?v=gLh0bX87wIg)

## Tech Stack
- **JavaScript / Chrome Extension Manifest V3**: Powers the browser overlay, keyboard shortcut, tab/bookmark access, local recent-tab tracking, and tab switching directly inside Chrome.
- **HTML/CSS**: Implements the injected Spotlight-style search UI and static landing page.
- **FastAPI / pydantic-ai**: Powers the explicit `Ask AI` category for browser actions such as organizing, generating, finding, or closing tabs.
- **SheetDB**: Stores waitlist submissions from the landing page.

## Architecture
Tabi is split into three active parts:

1. **Chrome extension (`extension/`)**
   - `content.js` injects a Shadow DOM overlay into the current page.
   - `background.js` listens for toolbar clicks and `Cmd+K` / `Ctrl+Shift+K`, toggles the overlay, handles cross-window tab switching, and tracks most-recently-used tabs locally.
   - `popup.js` renders the search experience, ranks local results, groups results by hierarchy section, executes selected Chrome actions, and routes `Ask AI` queries to the backend.

2. **Backend API (`backend/`)**
   - `app.py` exposes `POST /agent`.
   - `main.py` runs the AI agent and returns structured actions.
   - `schemas.py` defines the allowed browser action payloads.

3. **Landing page (`landing-page/`)**
   - Static product/waitlist page and privacy policy.
   - `waitlist.js` handles email capture.

Data flow:

```text
Shortcut or toolbar click
  -> content.js overlay
  -> popup.js local search index
  -> grouped results for Recent, Open Tabs, Bookmarks, Chrome, Web Search, and Ask AI
  -> selected local result opens or switches locally with Chrome APIs
  -> selected Ask AI result posts browser context to POST /agent
  -> structured AI action executes locally in Chrome
```

## Current Features
- Shows the five most recently used tabs before the user types.
- Searches open tabs across Chrome windows by title, URL, and domain.
- Searches Chrome bookmarks from the same input.
- Opens built-in Chrome destinations such as Settings, History, Downloads, Extensions, Passwords, Clear Browsing Data, Flags, and the Chrome Web Store.
- Groups visible results under hierarchy sections so bookmarks, open tabs, Chrome pages, and web fallback results are visually separated.
- Includes a compact search-type selector on the right side of the search bar, without a dedicated Chrome filter.
- Provides a Google fallback result for typed queries.
- Provides an explicit Ask AI category for AI browser actions.

## Notes
- Search and ranking are deterministic and local unless the user selects an `Ask AI` result.
- Persistent tab aliases and history search are proposal items for a later pass.
- The extension still uses broad host access for overlay injection across pages; permission scoping should be revisited before Chrome Web Store submission.

## Status
In Progress
