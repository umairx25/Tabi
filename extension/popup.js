/*
popup.js
Runs the Tabi switcher. Local search handles tabs, bookmarks, Chrome pages, and
web fallback; the Ask AI result explicitly routes a query to the backend agent.
*/

const input = document.getElementById("search-input");
const results = document.getElementById("results");
const searchBar = document.querySelector(".search-bar");
const filterButton = document.getElementById("filter-button");
const filterMenu = document.getElementById("filter-menu");
const BACKEND_URL = "https://tabi-api-10z9.onrender.com";

const MAX_VISIBLE_RESULTS = 5;
const DEFAULT_FILTER = "all";

const FILTERS = [
  { value: "all", label: "All", icon: "fa-layer-group" },
  { value: "tab", label: "Tabs", icon: "fa-globe" },
  { value: "bookmark", label: "Bookmarks", icon: "fa-bookmark" },
  { value: "tool", label: "Tools", icon: "fa-screwdriver-wrench" },
  { value: "web", label: "Web", icon: "fa-magnifying-glass" },
  { value: "ai", label: "Ask AI", icon: "fa-wand-magic-sparkles" },
];

const SECTION_META = {
  recent: { label: "Recent", icon: "fa-clock" },
  tab: { label: "Open Tabs", icon: "fa-globe" },
  bookmark: { label: "Bookmarks", icon: "fa-bookmark" },
  tool: { label: "Tools", icon: "fa-screwdriver-wrench" },
  chrome: { label: "Chrome", icon: "fa-compass" },
  web: { label: "Web Search", icon: "fa-magnifying-glass" },
  ai: { label: "Ask AI", icon: "fa-wand-magic-sparkles" },
};

const TOOL_DESTINATIONS = [
  {
    label: "Color Picker",
    url: "",
    terms: ["color", "colour", "picker", "color picker", "eyedropper", "eye dropper", "hex", "rgb", "hsl"],
    icon: "fa-eye-dropper",
    action: "color_picker",
  },
  {
    label: "QR Code",
    url: "",
    terms: ["qr", "qrcode", "qr code", "barcode", "code generator"],
    icon: "fa-qrcode",
    action: "qr_generator",
  },
  {
    label: "Remove Background",
    url: "",
    terms: ["remove background", "remove bg", "background remover", "transparent background", "image cutout"],
    icon: "fa-scissors",
    action: "remove_background",
  },
  {
    label: "Word Counter",
    url: "",
    terms: ["word count", "word counter", "character count", "characters", "sentence count", "sentences"],
    icon: "fa-align-left",
    action: "word_counter",
  },
  {
    label: "Full Page Screenshot",
    url: "",
    terms: ["screenshot", "screen shot", "full page screenshot", "capture page", "full page capture", "png"],
    icon: "fa-camera",
    action: "full_page_screenshot",
  },
];

const CHROME_DESTINATIONS = [
  {
    label: "Settings",
    url: "chrome://settings/",
    terms: ["settings", "prefs", "preferences", "chrome settings"],
    icon: "fa-gear",
  },
  {
    label: "History",
    url: "chrome://history/",
    terms: ["history", "recent", "recent history"],
    icon: "fa-clock-rotate-left",
  },
  {
    label: "Downloads",
    url: "chrome://downloads/",
    terms: ["downloads", "download"],
    icon: "fa-download",
  },
  {
    label: "Extensions",
    url: "chrome://extensions/",
    terms: ["extensions", "addons", "plugins"],
    icon: "fa-puzzle-piece",
  },
  {
    label: "Chrome Web Store",
    url: "https://chromewebstore.google.com/",
    terms: ["web store", "chrome store", "extension store", "store"],
    icon: "fa-bag-shopping",
  },
  {
    label: "Bookmarks",
    url: "chrome://bookmarks/",
    terms: ["bookmarks", "bookmark manager"],
    icon: "fa-book",
  },
  {
    label: "Passwords",
    url: "chrome://settings/passwords",
    terms: ["passwords", "password manager", "saved passwords"],
    icon: "fa-key",
  },
  {
    label: "Clear Browsing Data",
    url: "chrome://settings/clearBrowserData",
    terms: ["clear cache", "clear browsing data", "delete browsing data", "cache"],
    icon: "fa-broom",
  },
  {
    label: "Flags",
    url: "chrome://flags/",
    terms: ["flags", "chrome flags", "experiments"],
    icon: "fa-flask",
  },
];

let allResults = [];
let visibleResults = [];
let selectedIndex = 0;
let activeFilter = DEFAULT_FILTER;
let lastPointerSelectionAt = 0;
let renameState = null;
let removeBgResultUrl = "";
let removeBgPasteController = null;
let screenshotResultUrl = "";
let activeScreenshotCaptureId = "";
const currencyCache = new Map();
const currencyRequests = new Map();

function normalize(value = "") {
  return value
    .toString()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function getDomain(url = "") {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url.replace(/^https?:\/\//, "").split("/")[0] || "";
  }
}

function normalizeUrlForAlias(url = "") {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    return parsed.href;
  } catch {
    return url;
  }
}

function getDirectUrl(value = "") {
  const trimmed = value.trim();
  if (!/^https?:\/\//i.test(trimmed)) return "";

  try {
    const parsed = new URL(trimmed);
    if (!parsed.hostname || parsed.hostname.includes(" ")) return "";
    return parsed.href;
  } catch {
    return "";
  }
}

function escapeHtml(value = "") {
  return value.replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  })[char]);
}

function matchesQuery(result, query) {
  if (!query) return true;
  const haystack = [
    result.label,
    result.url,
    result.domain,
    result.section,
    result.originalTitle,
    result.alias,
    ...(result.terms || []),
  ].map(normalize).join(" ");

  return normalize(query).split(/\s+/).every(part => haystack.includes(part));
}

function scoreResult(result, query) {
  const normalizedQuery = normalize(query);
  if (!normalizedQuery) {
    if (result.section === "recent") return 10000 - (result.recentRank || 0);
    return 0;
  }

  const label = normalize(result.label);
  const domain = normalize(result.domain);
  const url = normalize(result.url);
  const terms = (result.terms || []).map(normalize);
  let score = 0;

  if (label === normalizedQuery) score += 1000;
  if (label.startsWith(normalizedQuery)) score += 700;
  if (terms.some(term => term === normalizedQuery)) score += 650;
  if (terms.some(term => term.startsWith(normalizedQuery))) score += 500;
  if (label.includes(normalizedQuery)) score += 300;
  if (domain.includes(normalizedQuery)) score += 180;
  if (url.includes(normalizedQuery)) score += 90;

  const sectionBoost = {
    tab: 500,
    recent: 520,
    bookmark: 260,
    tool: 240,
    chrome: 220,
    web: 10,
    ai: 430,
  };

  score += sectionBoost[result.section] || 0;
  score += Math.max(0, 120 - (result.recentRank || 120));

  return score;
}

function getFilterSections(query = "") {
  if (!query && activeFilter === "all") return ["recent"];
  if (activeFilter === "all") return ["tab", "bookmark", "tool", "chrome", "web", "ai"];
  if (activeFilter === "web") return ["web"];
  if (activeFilter === "ai") return ["ai"];
  return [activeFilter];
}

function groupResults(query) {
  const sections = getFilterSections(query);
  const candidates = [];
  const smartResult = getSmartResult(query);

  for (const result of allResults) {
    if (!sections.includes(result.section)) continue;
    if (!matchesQuery(result, query)) continue;
    candidates.push({ ...result, score: scoreResult(result, query) });
  }

  if (smartResult && sections.includes("tool")) {
    candidates.push(smartResult);
  }

  const hasLocalResults = candidates.some(result => result.section !== "web");
  const shouldShowWeb = query && (activeFilter === "all" || activeFilter === "web");
  const shouldShowAi = query && (activeFilter === "all" || activeFilter === "ai");

  if (shouldShowWeb) {
    const directUrl = getDirectUrl(query);
    candidates.push({
      id: `web:${query}`,
      section: "web",
      label: directUrl ? `Open ${directUrl}` : `Search Google for "${query}"`,
      url: directUrl || `https://www.google.com/search?q=${encodeURIComponent(query)}`,
      domain: directUrl ? getDomain(directUrl) : "google.com",
      icon: directUrl ? "fa-arrow-up-right-from-square" : "fa-magnifying-glass",
      score: activeFilter === "web" || !hasLocalResults ? 1000 : 0,
    });
  }

  if (shouldShowAi) {
    candidates.push({
      id: `ai:${query}`,
      section: "ai",
      label: `Ask AI: "${query}"`,
      url: "",
      domain: "Use Tabi AI actions",
      icon: "fa-wand-magic-sparkles",
      prompt: query,
      score: activeFilter === "ai" ? 1000 : 430,
    });
  }

  const visible = candidates
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_VISIBLE_RESULTS);

  return sections
    .map(section => ({
      section,
      items: visible.filter(result => result.section === section),
    }))
    .filter(group => group.items.length > 0);
}

function flattenGroups(groups) {
  return groups.flatMap(group => group.items);
}

function renderResults() {
  if (!results || !searchBar) return;

  cleanupRemoveBgPanel();
  cleanupScreenshotPanel();

  const query = input.value.trim();
  const groups = groupResults(query);
  visibleResults = flattenGroups(groups);

  if (selectedIndex >= visibleResults.length) selectedIndex = 0;
  if (selectedIndex < 0) selectedIndex = visibleResults.length - 1;

  updatePanelShape(groups.length > 0);
  results.style.display = groups.length ? "block" : "none";

  if (!groups.length) {
    results.innerHTML = "";
    return;
  }

  let flatIndex = 0;
  results.innerHTML = groups.map(group => {
    const meta = SECTION_META[group.section];
    const items = group.items.map(item => {
      const index = flatIndex++;
      const selected = index === selectedIndex ? " is-selected" : "";
      const icon = item.icon || meta.icon;
      const canRename = canRenameResult(item);
      const titleContent = `
        <span class="result-title-text">${escapeHtml(item.label)}</span>
        ${canRename ? `
          <button class="rename-tab-button" type="button" data-index="${index}" title="Rename tab" aria-label="Rename ${escapeHtml(item.label)}">
            <i class="fa-solid fa-pencil"></i>
          </button>
        ` : ""}
      `;
      return `
        <div class="result-row${selected}" data-index="${index}" role="button">
          <span class="result-main">
            <span class="result-glyph ${item.section}">
              <i class="fa-solid ${icon}"></i>
            </span>
            <span class="result-copy">
              <span class="result-title">${titleContent}</span>
              <span class="result-subtitle">${escapeHtml(item.domain || item.url || "")}</span>
            </span>
          </span>
          <span class="result-action">${getActionLabel(item)}</span>
        </div>
      `;
    }).join("");

    return `
      <section class="result-section" aria-label="${meta.label}">
        <div class="section-heading">
          <span><i class="fa-solid ${meta.icon}"></i>${meta.label}</span>
        </div>
        ${items}
      </section>
    `;
  }).join("");

  results.querySelectorAll(".result-row").forEach(row => {
    row.addEventListener("mouseenter", () => {
      selectedIndex = Number(row.dataset.index);
      updateSelectedResultStyles();
    });
    row.addEventListener("pointerdown", event => {
      if (event.button !== 0) return;
      if (event.target.closest(".rename-tab-button")) return;
      event.preventDefault();
      lastPointerSelectionAt = Date.now();
      selectedIndex = Number(row.dataset.index);
      selectCurrentResult();
    });
    row.addEventListener("click", event => {
      event.preventDefault();
      if (event.target.closest(".rename-tab-button")) return;
      if (Date.now() - lastPointerSelectionAt < 500) return;
      selectedIndex = Number(row.dataset.index);
      selectCurrentResult();
    });
  });

  results.querySelectorAll(".rename-tab-button").forEach(button => {
    button.addEventListener("pointerdown", event => {
      event.preventDefault();
      event.stopPropagation();
    });
    button.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      const result = visibleResults[Number(button.dataset.index)];
      enterRenameMode(result);
    });
  });

  resolveCurrencyResult(query);
}

function updateSelectedResultStyles() {
  results.querySelectorAll(".result-row").forEach(row => {
    row.classList.toggle("is-selected", Number(row.dataset.index) === selectedIndex);
  });
}

function updatePanelShape(hasResults = visibleResults.length > 0) {
  const hasFilterMenu = filterMenu && !filterMenu.hidden;
  searchBar.style.borderRadius = hasResults || hasFilterMenu ? "30px 30px 0 0" : "30px";
}

function getActionLabel(item) {
  if (item.section === "tab" || item.section === "recent") return "Switch";
  if (item.section === "ai") return "Ask";
  return "Open";
}

function canRenameResult(item) {
  return item?.section === "tab" || item?.section === "recent";
}

async function getRecentIds() {
  const { recentTabIds = [] } = await chrome.storage.local.get("recentTabIds");
  return recentTabIds;
}

async function getTabAliases() {
  const { tabAliasesByUrl = {} } = await chrome.storage.local.get("tabAliasesByUrl");
  return tabAliasesByUrl;
}

async function getTabResults() {
  const tabs = await chrome.tabs.query({});
  const recentIds = await getRecentIds();
  const aliases = await getTabAliases();
  const recentRank = new Map(recentIds.map((id, index) => [id, index]));

  return tabs
    .filter(tab => tab.id && tab.url)
    .map(tab => {
      const aliasKey = normalizeUrlForAlias(tab.url);
      const aliasRecord = aliases[aliasKey];
      const alias = aliasRecord?.alias || "";
      const originalTitle = aliasRecord?.originalTitle || tab.title || "";

      return {
        id: `tab:${tab.id}`,
        tabId: tab.id,
        windowId: tab.windowId,
        section: "tab",
        label: alias || tab.title || getDomain(tab.url) || "Untitled Tab",
        originalTitle,
        alias,
        aliasKey,
        url: tab.url,
        domain: alias ? `${originalTitle || getDomain(tab.url)} · ${getDomain(tab.url)}` : getDomain(tab.url),
        terms: [alias, originalTitle, tab.title, tab.url, getDomain(tab.url)],
        icon: "fa-globe",
        recentRank: recentRank.has(tab.id) ? recentRank.get(tab.id) : 1000,
        lastAccessed: tab.lastAccessed || 0,
      };
    })
    .sort((a, b) => {
      if (a.recentRank !== b.recentRank) return a.recentRank - b.recentRank;
      return b.lastAccessed - a.lastAccessed;
    });
}

async function getBookmarkResults() {
  return new Promise(resolve => {
    chrome.bookmarks.getTree(nodes => {
      const bookmarks = [];

      const walk = items => {
        for (const item of items) {
          if (item.url) {
            bookmarks.push({
              id: `bookmark:${item.id}`,
              bookmarkId: item.id,
              section: "bookmark",
              label: item.title || getDomain(item.url),
              url: item.url,
              domain: getDomain(item.url),
              icon: "fa-bookmark",
            });
          }
          if (item.children) walk(item.children);
        }
      };

      walk(nodes);
      resolve(bookmarks);
    });
  });
}

function getChromeResults() {
  return CHROME_DESTINATIONS.map(destination => ({
    id: `chrome:${destination.url}`,
    section: "chrome",
    label: destination.label,
    url: destination.url,
    domain: destination.url.replace(/\/$/, ""),
    terms: destination.terms,
    icon: destination.icon,
    action: "open_url",
  }));
}

function getToolResults() {
  return TOOL_DESTINATIONS.map(destination => ({
    id: `tool:${destination.action}`,
    section: "tool",
    label: destination.label,
    url: "",
    domain: getToolSubtitle(destination),
    terms: destination.terms,
    icon: destination.icon,
    action: destination.action,
  }));
}

function getToolSubtitle(destination) {
  const subtitles = {
    color_picker: "Native eyedropper",
    qr_generator: "Generate and download QR codes",
    remove_background: "Remove an image background",
    word_counter: "Count words, characters, and sentences",
    full_page_screenshot: "Capture the full page as PNG",
  };

  return subtitles[destination.action] || "";
}

async function loadResults() {
  const tabs = await getTabResults();
  const recentTabs = tabs.slice(0, 5).map((tab, index) => ({
    ...tab,
    id: `recent:${tab.tabId}`,
    section: "recent",
    recentRank: index,
    icon: "fa-clock",
  }));

  const bookmarks = await getBookmarkResults();
  allResults = [
    ...recentTabs,
    ...tabs,
    ...bookmarks,
    ...getToolResults(),
    ...getChromeResults(),
  ];

  selectedIndex = 0;
  renderResults();
}

async function selectCurrentResult() {
  const result = visibleResults[selectedIndex];
  if (!result) return;

  if (result.section === "tab" || result.section === "recent") {
    await chrome.windows.update(result.windowId, { focused: true });
    await chrome.tabs.update(result.tabId, { active: true });
  } else if (result.section === "ai") {
    await executeAiCommand(result.prompt || input.value.trim());
    return;
  } else if (result.action === "color_picker") {
    await openNativeColorPicker();
    return;
  } else if (result.action === "qr_generator") {
    await showQrGenerator();
    return;
  } else if (result.action === "remove_background") {
    showRemoveBackgroundPanel();
    return;
  } else if (result.action === "word_counter") {
    showWordCounter();
    return;
  } else if (result.action === "full_page_screenshot") {
    showFullPageScreenshotPanel();
    return;
  } else if (result.action === "smart_result") {
    showSmartResult(result.smart);
    return;
  } else {
    await chrome.tabs.create({ url: result.url, active: true });
  }

  window.parent.postMessage({ type: "TABI_CLOSE" }, "*");
}

function enterRenameMode(result) {
  if (!canRenameResult(result)) return;

  renameState = {
    tabId: result.tabId,
    windowId: result.windowId,
    url: result.url,
    aliasKey: result.aliasKey || normalizeUrlForAlias(result.url),
    originalTitle: result.originalTitle || result.label,
    previousQuery: input.value,
  };

  input.value = result.alias || result.label;
  input.placeholder = "Rename tab...";
  filterMenu.hidden = true;
  searchBar.classList.add("is-renaming");
  selectedIndex = 0;
  renderRenamePanel(result);
  input.focus();
  input.select();
}

function renderRenamePanel(result) {
  updatePanelShape(true);
  results.style.display = "block";
  results.innerHTML = `
    <section class="rename-panel" aria-label="Rename tab">
      <div class="rename-current">
        <span class="result-glyph tab"><i class="fa-solid fa-pencil"></i></span>
        <span class="rename-current-copy">
          <span class="rename-label">Rename Tab</span>
          <span class="rename-title">${escapeHtml(result.originalTitle || result.label)}</span>
        </span>
      </div>
      <div class="rename-help">Type a new tab title and press Enter. Clear the input to remove the custom name.</div>
    </section>
  `;
}

async function commitRename() {
  if (!renameState) return;

  const alias = input.value.trim();
  const { tabAliasesByUrl = {} } = await chrome.storage.local.get("tabAliasesByUrl");
  const existingAlias = tabAliasesByUrl[renameState.aliasKey];
  const originalTitle = existingAlias?.originalTitle || renameState.originalTitle;

  if (alias) {
    tabAliasesByUrl[renameState.aliasKey] = {
      alias,
      originalTitle,
      updatedAt: Date.now(),
    };
  } else {
    delete tabAliasesByUrl[renameState.aliasKey];
  }

  await chrome.storage.local.set({ tabAliasesByUrl });
  await applyAliasToTab(renameState.tabId, alias, originalTitle);

  const message = alias ? "Tab renamed." : "Custom name removed.";
  renameState = null;
  searchBar.classList.remove("is-renaming");
  input.placeholder = "Search tabs, bookmarks, or the web...";
  input.value = "";
  await loadResults();
  setStatus(message);
}

function cancelRename() {
  const previousQuery = renameState?.previousQuery || "";
  renameState = null;
  searchBar.classList.remove("is-renaming");
  input.placeholder = "Search tabs, bookmarks, or the web...";
  input.value = previousQuery;
  renderResults();
}

async function applyAliasToTab(tabId, alias, originalTitle = "") {
  const message = {
    type: "TABI_APPLY_ALIAS",
    alias,
    originalTitle,
  };

  try {
    await chrome.tabs.sendMessage(tabId, message);
  } catch (error) {
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ["content.js"],
      });
      await chrome.tabs.sendMessage(tabId, message);
    } catch (injectError) {
      console.warn("Failed to apply tab alias:", injectError || error);
    }
  }
}

async function openNativeColorPicker() {
  if (!("EyeDropper" in window)) {
    showColorPickerError("Color picker is not supported in this browser.");
    return;
  }

  document.documentElement.classList.add("eyedropper-active");
  window.parent.postMessage({ type: "TABI_TEMP_HIDE" }, "*");
  const abortController = new AbortController();
  const cancelOnKey = () => abortController.abort();
  window.addEventListener("keydown", cancelOnKey, { capture: true, once: true });

  try {
    const eyeDropper = new EyeDropper();
    const picked = await eyeDropper.open({ signal: abortController.signal });
    showColorValues(picked.sRGBHex);
  } catch (error) {
    if (error?.name !== "AbortError") {
      showColorPickerError("Color picker was cancelled.");
    } else {
      renderResults();
    }
  } finally {
    window.removeEventListener("keydown", cancelOnKey, { capture: true });
    document.documentElement.classList.remove("eyedropper-active");
    window.parent.postMessage({ type: "TABI_TEMP_SHOW" }, "*");
    input.focus();
  }
}

function showColorValues(hex) {
  const rgb = hexToRgb(hex);
  const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
  const values = [
    { label: "HEX", value: hex.toUpperCase() },
    { label: "RGB", value: `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})` },
    { label: "HSL", value: `hsl(${hsl.h}, ${hsl.s}%, ${hsl.l}%)` },
    { label: "CSS", value: `color: ${hex.toUpperCase()};` },
  ];

  searchBar.style.borderRadius = "30px 30px 0 0";
  results.style.display = "block";
  results.innerHTML = `
    <section class="color-picker-panel" aria-label="Picked color">
      <div class="color-sample-row">
        <span class="color-swatch" style="background:${escapeHtml(hex)}"></span>
        <span class="color-sample-copy">
          <span class="color-sample-title">Picked Color</span>
          <span class="color-sample-subtitle">${escapeHtml(hex.toUpperCase())}</span>
        </span>
      </div>
      <div class="color-values">
        ${values.map(item => `
          <button class="color-value-row" type="button" data-copy="${escapeHtml(item.value)}">
            <span>
              <span class="color-value-label">${escapeHtml(item.label)}</span>
              <span class="color-value-text">${escapeHtml(item.value)}</span>
            </span>
            <i class="fa-regular fa-copy"></i>
          </button>
        `).join("")}
      </div>
    </section>
  `;

  results.querySelectorAll(".color-value-row").forEach(row => {
    row.addEventListener("click", async () => {
      const copied = await copyText(row.dataset.copy);
      row.classList.toggle("is-copied", copied);
      row.classList.toggle("is-copy-error", !copied);
      setTimeout(() => {
        row.classList.remove("is-copied", "is-copy-error");
      }, 900);
    });
  });
}

async function copyText(value) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch (error) {
    console.warn("navigator.clipboard.writeText failed:", error);
  }

  const textArea = document.createElement("textarea");
  textArea.value = value;
  textArea.setAttribute("readonly", "");
  textArea.style.position = "fixed";
  textArea.style.left = "-9999px";
  textArea.style.top = "0";
  document.body.appendChild(textArea);
  textArea.focus();
  textArea.select();

  try {
    return document.execCommand("copy");
  } catch (error) {
    console.warn("execCommand copy failed:", error);
    return false;
  } finally {
    textArea.remove();
  }
}

function showColorPickerError(message) {
  searchBar.style.borderRadius = "30px 30px 0 0";
  results.style.display = "block";
  results.innerHTML = `
    <div class="status-message is-error">
      <span>${escapeHtml(message)}</span>
    </div>
  `;
}

function hexToRgb(hex) {
  const value = hex.replace("#", "");
  return {
    r: parseInt(value.slice(0, 2), 16),
    g: parseInt(value.slice(2, 4), 16),
    b: parseInt(value.slice(4, 6), 16),
  };
}

function rgbToHsl(r, g, b) {
  r /= 255;
  g /= 255;
  b /= 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    if (max === g) h = (b - r) / d + 2;
    if (max === b) h = (r - g) / d + 4;
    h /= 6;
  }

  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    l: Math.round(l * 100),
  };
}

async function showQrGenerator() {
  const seed = input.value.trim().replace(/^(qr|qrcode|qr code)\s*/i, "");
  let initialText = seed;

  if (!initialText) {
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    initialText = activeTab?.url || "";
  }

  searchBar.style.borderRadius = "30px 30px 0 0";
  filterMenu.hidden = true;
  results.style.display = "block";
  results.innerHTML = `
    <section class="tool-panel" aria-label="QR code generator">
      <div class="tool-panel-header">
        <span class="result-glyph tool"><i class="fa-solid fa-qrcode"></i></span>
        <span>
          <span class="tool-panel-title">QR Code</span>
          <span class="tool-panel-subtitle">Generate a local QR code</span>
        </span>
      </div>
      <textarea class="tool-textarea" id="qr-input" rows="3" placeholder="Text or URL">${escapeHtml(initialText)}</textarea>
      <div class="qr-preview" id="qr-preview"></div>
      <div class="tool-actions">
        <button class="tool-button" id="qr-copy-text" type="button"><i class="fa-regular fa-copy"></i>Copy Text</button>
        <button class="tool-button" id="qr-download" type="button"><i class="fa-solid fa-download"></i>Download PNG</button>
      </div>
    </section>
  `;

  const qrInput = document.getElementById("qr-input");
  const qrPreview = document.getElementById("qr-preview");
  const copyButton = document.getElementById("qr-copy-text");
  const downloadButton = document.getElementById("qr-download");

  const renderQr = () => {
    try {
      qrPreview.innerHTML = "";
      const canvas = renderQrCanvas(qrInput.value.trim() || " ");
      qrPreview.appendChild(canvas);
      downloadButton.disabled = false;
    } catch (error) {
      qrPreview.innerHTML = `<div class="status-message is-error"><span>${escapeHtml(error.message)}</span></div>`;
      downloadButton.disabled = true;
    }
  };

  qrInput.addEventListener("input", renderQr);
  copyButton.addEventListener("click", async () => markToolButton(copyButton, await copyText(qrInput.value)));
  downloadButton.addEventListener("click", () => {
    const canvas = qrPreview.querySelector("canvas");
    if (!canvas) return;

    const link = document.createElement("a");
    link.download = "tabi-qr-code.png";
    link.href = canvas.toDataURL("image/png");
    link.click();
  });

  renderQr();
  qrInput.focus();
  qrInput.select();
}

function showRemoveBackgroundPanel() {
  cleanupRemoveBgPanel();
  revokeRemoveBgResultUrl();
  searchBar.style.borderRadius = "30px 30px 0 0";
  filterMenu.hidden = true;
  results.style.display = "block";
  results.innerHTML = `
    <section class="tool-panel remove-bg-panel" aria-label="Remove background">
      <div class="tool-panel-header">
        <span class="result-glyph tool"><i class="fa-solid fa-scissors"></i></span>
        <span>
          <span class="tool-panel-title">Remove Background</span>
          <span class="tool-panel-subtitle">Upload or paste an image</span>
        </span>
      </div>
      <label class="upload-dropzone" id="remove-bg-dropzone" for="remove-bg-input" tabindex="0">
        <input id="remove-bg-input" type="file" accept="image/*" hidden>
        <span class="upload-icon"><i class="fa-regular fa-image"></i></span>
        <span>
          <span class="upload-title">Choose Image</span>
          <span class="upload-subtitle">PNG, JPEG, or WebP. You can also paste an image here.</span>
        </span>
      </label>
      <div class="remove-bg-preview" id="remove-bg-preview" hidden></div>
      <div class="tool-actions">
        <button class="tool-button" id="remove-bg-run" type="button" disabled><i class="fa-solid fa-wand-magic-sparkles"></i>Remove BG</button>
        <button class="tool-button" id="remove-bg-download" type="button" disabled><i class="fa-solid fa-download"></i>Download PNG</button>
      </div>
    </section>
  `;

  let selectedFile = null;
  const fileInput = document.getElementById("remove-bg-input");
  const dropzone = document.getElementById("remove-bg-dropzone");
  const preview = document.getElementById("remove-bg-preview");
  const runButton = document.getElementById("remove-bg-run");
  const downloadButton = document.getElementById("remove-bg-download");

  const setSelectedFile = file => {
    if (!file?.type?.startsWith("image/")) {
      showRemoveBgMessage(preview, "Upload or paste an image file.", true);
      selectedFile = null;
      runButton.disabled = true;
      return;
    }

    selectedFile = file;
    revokeRemoveBgResultUrl();
    runButton.disabled = false;
    downloadButton.disabled = true;
    const previewUrl = URL.createObjectURL(file);
    preview.hidden = false;
    preview.innerHTML = `
      <img src="${previewUrl}" alt="">
      <span>
        <span class="tool-panel-title">${escapeHtml(file.name || "Pasted image")}</span>
        <span class="tool-panel-subtitle">${formatFileSize(file.size)}</span>
      </span>
    `;
    preview.querySelector("img")?.addEventListener("load", () => URL.revokeObjectURL(previewUrl), { once: true });
  };

  fileInput.addEventListener("change", () => setSelectedFile(fileInput.files?.[0]));
  dropzone.addEventListener("keydown", event => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      fileInput.click();
    }
  });
  dropzone.addEventListener("paste", event => {
    const file = getImageFromClipboard(event.clipboardData);
    if (!file) return;
    event.preventDefault();
    setSelectedFile(file);
  });
  removeBgPasteController = new AbortController();
  document.addEventListener("paste", function pasteListener(event) {
    if (!results.contains(dropzone)) {
      cleanupRemoveBgPanel();
      return;
    }
    const file = getImageFromClipboard(event.clipboardData);
    if (!file) return;
    event.preventDefault();
    setSelectedFile(file);
  }, { signal: removeBgPasteController.signal });

  runButton.addEventListener("click", async () => {
    if (!selectedFile) return;
    await removeBackground(selectedFile, preview, runButton, downloadButton);
  });
  downloadButton.addEventListener("click", () => {
    if (!removeBgResultUrl) return;
    const link = document.createElement("a");
    link.download = getRemovedBgFilename(selectedFile?.name);
    link.href = removeBgResultUrl;
    link.click();
  });

  dropzone.focus();
}

function cleanupRemoveBgPanel() {
  if (removeBgPasteController) {
    removeBgPasteController.abort();
    removeBgPasteController = null;
  }
  revokeRemoveBgResultUrl();
}

function cleanupScreenshotPanel() {
  activeScreenshotCaptureId = "";
  revokeScreenshotResultUrl();
}

function revokeScreenshotResultUrl() {
  if (!screenshotResultUrl) return;
  URL.revokeObjectURL(screenshotResultUrl);
  screenshotResultUrl = "";
}

async function removeBackground(file, preview, runButton, downloadButton) {
  runButton.disabled = true;
  downloadButton.disabled = true;
  showRemoveBgMessage(preview, "Removing background...", false, true);

  const formData = new FormData();
  formData.append("image", file, file.name || "image.png");

  try {
    const response = await fetch(`${BACKEND_URL}/remove-background`, {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      const error = await readApiError(response);
      showRemoveBgMessage(preview, error || "Background removal failed.", true);
      return;
    }

    const blob = await response.blob();
    revokeRemoveBgResultUrl();
    removeBgResultUrl = URL.createObjectURL(blob);
    preview.hidden = false;
    preview.innerHTML = `
      <img src="${removeBgResultUrl}" alt="">
      <span>
        <span class="tool-panel-title">Background Removed</span>
        <span class="tool-panel-subtitle">${formatFileSize(blob.size)} PNG ready to download</span>
      </span>
    `;
    downloadButton.disabled = false;
  } catch (error) {
    console.error("Remove background failed:", error);
    showRemoveBgMessage(preview, "Background removal failed.", true);
  } finally {
    runButton.disabled = false;
  }
}

function getImageFromClipboard(clipboardData) {
  const items = Array.from(clipboardData?.items || []);
  const imageItem = items.find(item => item.type.startsWith("image/"));
  return imageItem?.getAsFile() || null;
}

async function readApiError(response) {
  try {
    const data = await response.json();
    if (typeof data.error === "string") return data.error;
    return JSON.stringify(data.error || data);
  } catch {
    return response.statusText;
  }
}

function showRemoveBgMessage(container, message, isError = false, isLoading = false) {
  container.hidden = false;
  container.innerHTML = `
    <div class="status-message ${isError ? "is-error" : ""}">
      <span>${escapeHtml(message)}</span>
      ${isLoading ? `<div class="progress"><div class="progress-value"></div></div>` : ""}
    </div>
  `;
}

function revokeRemoveBgResultUrl() {
  if (!removeBgResultUrl) return;
  URL.revokeObjectURL(removeBgResultUrl);
  removeBgResultUrl = "";
}

function getRemovedBgFilename(filename = "image") {
  const base = filename.replace(/\.[^.]+$/, "") || "image";
  return `${base}-no-bg.png`;
}

function formatFileSize(bytes = 0) {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

function showWordCounter() {
  const seed = input.value.trim().replace(/^(word count|word counter|words?)\s*/i, "");
  searchBar.style.borderRadius = "30px 30px 0 0";
  filterMenu.hidden = true;
  results.style.display = "block";
  results.innerHTML = `
    <section class="tool-panel" aria-label="Word counter">
      <div class="tool-panel-header">
        <span class="result-glyph tool"><i class="fa-solid fa-align-left"></i></span>
        <span>
          <span class="tool-panel-title">Word Counter</span>
          <span class="tool-panel-subtitle">Paste or type text</span>
        </span>
      </div>
      <textarea class="tool-textarea word-counter-input" id="word-counter-input" rows="5" placeholder="Paste text here">${escapeHtml(seed)}</textarea>
      <div class="word-count-grid" id="word-count-grid"></div>
    </section>
  `;

  const counterInput = document.getElementById("word-counter-input");
  const countGrid = document.getElementById("word-count-grid");
  const renderCounts = () => {
    const counts = countText(counterInput.value);
    countGrid.innerHTML = `
      <div class="word-count-row"><span>Words</span><strong>${formatInteger(counts.words)}</strong></div>
      <div class="word-count-row"><span>Characters</span><strong>${formatInteger(counts.characters)}</strong></div>
      <div class="word-count-row"><span>Characters<br>(no spaces)</span><strong>${formatInteger(counts.charactersNoSpaces)}</strong></div>
      <div class="word-count-row"><span>Sentences</span><strong>${formatInteger(counts.sentences)}</strong></div>
    `;
  };

  counterInput.addEventListener("input", renderCounts);
  renderCounts();
  counterInput.focus();
  counterInput.select();
}

function countText(text = "") {
  const trimmed = text.trim();
  const words = trimmed.match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu)?.length || 0;
  const characters = text.length;
  const charactersNoSpaces = text.replace(/\s/g, "").length;
  const sentences = trimmed.match(/[^.!?]+[.!?]+(?:\s|$)|[^.!?]+$/g)?.filter(sentence => sentence.trim()).length || 0;

  return {
    words,
    characters,
    charactersNoSpaces,
    sentences,
  };
}

function formatInteger(value) {
  return value.toLocaleString("en-US");
}

function showFullPageScreenshotPanel() {
  cleanupScreenshotPanel();
  searchBar.style.borderRadius = "30px 30px 0 0";
  filterMenu.hidden = true;
  results.style.display = "block";
  results.innerHTML = `
    <section class="tool-panel" aria-label="Full page screenshot">
      <div class="tool-panel-header">
        <span class="result-glyph tool"><i class="fa-solid fa-camera"></i></span>
        <span>
          <span class="tool-panel-title">Full Page Screenshot</span>
          <span class="tool-panel-subtitle">Capture the full page as a PNG</span>
        </span>
      </div>
      <div class="screenshot-status" id="screenshot-status">
        <span class="upload-icon"><i class="fa-regular fa-file-image"></i></span>
        <span>
          <span class="tool-panel-title">Ready to capture</span>
          <span class="tool-panel-subtitle">The overlay will hide while Tabi scrolls the page.</span>
        </span>
      </div>
      <div class="tool-actions">
        <button class="tool-button" id="screenshot-run" type="button"><i class="fa-solid fa-camera"></i>Capture</button>
        <button class="tool-button" id="screenshot-download" type="button" disabled><i class="fa-solid fa-download"></i>Download PNG</button>
      </div>
    </section>
  `;

  const runButton = document.getElementById("screenshot-run");
  const downloadButton = document.getElementById("screenshot-download");
  runButton.addEventListener("click", () => startFullPageScreenshot(runButton, downloadButton));
  downloadButton.addEventListener("click", () => {
    if (!screenshotResultUrl) return;
    const link = document.createElement("a");
    link.download = "tabi-full-page-screenshot.png";
    link.href = screenshotResultUrl;
    link.click();
  });
  runButton.focus();
}

async function startFullPageScreenshot(runButton, downloadButton) {
  cleanupScreenshotPanel();
  const captureId = crypto.randomUUID();
  activeScreenshotCaptureId = captureId;
  runButton.disabled = true;
  downloadButton.disabled = true;
  renderScreenshotStatus("Preparing capture...", "The page will scroll automatically.", true);

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw new Error("No active tab found.");

    const result = await requestFullPageCapture(tab.id, captureId);
    if (!result.success) throw new Error(result.error || "Full page screenshot failed.");

    const blob = dataUrlToBlob(result.dataUrl);
    revokeScreenshotResultUrl();
    screenshotResultUrl = URL.createObjectURL(blob);
    renderScreenshotStatus(
      "Screenshot ready",
      `${formatInteger(result.width)} x ${formatInteger(result.height)} PNG`,
      false,
      true,
    );
    downloadButton.disabled = false;
  } catch (error) {
    console.error("Full page screenshot failed:", error);
    renderScreenshotStatus(error?.message || "Full page screenshot failed.", "Try a normal web page.", false, false, true);
  } finally {
    runButton.disabled = false;
  }
}

async function requestFullPageCapture(tabId, captureId) {
  const message = { type: "TABI_CAPTURE_FULL_PAGE", captureId };
  try {
    return await chrome.tabs.sendMessage(tabId, message);
  } catch (error) {
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ["content.js"],
      });
      return await chrome.tabs.sendMessage(tabId, message);
    } catch (injectError) {
      return {
        success: false,
        error: injectError?.message || error?.message || "Cannot capture this page.",
      };
    }
  }
}

function renderScreenshotStatus(title, subtitle, isLoading = false, isReady = false, isError = false) {
  const status = document.getElementById("screenshot-status");
  if (!status) return;
  status.classList.toggle("is-ready", isReady);
  status.classList.toggle("is-error", isError);
  status.innerHTML = `
    <span class="upload-icon"><i class="fa-${isReady ? "solid" : "regular"} ${isReady ? "fa-circle-check" : "fa-file-image"}"></i></span>
    <span>
      <span class="tool-panel-title">${escapeHtml(title)}</span>
      <span class="tool-panel-subtitle">${escapeHtml(subtitle)}</span>
      ${isLoading ? `<span class="screenshot-progress"><span></span></span>` : ""}
    </span>
  `;
}

function updateScreenshotProgress(current, total) {
  renderScreenshotStatus(`Capturing ${current} / ${total}`, "Keep this tab active until capture finishes.", true);
}

function dataUrlToBlob(dataUrl) {
  const [meta, data] = dataUrl.split(",");
  const mime = meta.match(/data:(.*?);base64/)?.[1] || "image/png";
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Blob([bytes], { type: mime });
}

function showSmartResult(smart) {
  searchBar.style.borderRadius = "30px 30px 0 0";
  filterMenu.hidden = true;
  results.style.display = "block";
  results.innerHTML = `
    <section class="tool-panel" aria-label="Smart result">
      <div class="tool-panel-header">
        <span class="result-glyph tool"><i class="fa-solid fa-equals"></i></span>
        <span>
          <span class="tool-panel-title">${escapeHtml(smart.output)}</span>
          <span class="tool-panel-subtitle">${escapeHtml(smart.detail)}</span>
        </span>
      </div>
      <div class="tool-actions">
        <button class="tool-button" id="smart-copy" type="button"><i class="fa-regular fa-copy"></i>Copy Result</button>
      </div>
    </section>
  `;

  document.getElementById("smart-copy")?.addEventListener("click", async event => {
    markToolButton(event.currentTarget, await copyText(smart.output));
  });
}

function markToolButton(button, copied) {
  button.classList.toggle("is-copied", copied);
  button.classList.toggle("is-copy-error", !copied);
  setTimeout(() => button.classList.remove("is-copied", "is-copy-error"), 900);
}

function getSmartResult(query) {
  if (!query.trim().startsWith("=")) return null;
  const expression = query.trim().slice(1).trim();
  const smart = evaluateSmartQuery(expression);
  if (!smart) return null;

  return {
    id: `smart:${query}`,
    section: "tool",
    label: smart.output,
    domain: smart.detail,
    terms: ["=", "calculator", "convert", "unit", "math", "currency", "fx"],
    icon: smart.kind === "currency" ? "fa-money-bill-transfer" : "fa-equals",
    action: "smart_result",
    smart,
    score: 2000,
  };
}

function evaluateSmartQuery(expression) {
  if (!expression) return null;

  const currency = convertCurrencyExpression(expression);
  if (currency) return currency;

  const color = convertColorExpression(expression);
  if (color) return color;

  const conversion = convertUnitExpression(expression);
  if (conversion) return conversion;

  try {
    const value = evaluateMathExpression(expression);
    return {
      output: formatNumber(value),
      detail: expression,
    };
  } catch {
    return null;
  }
}

const CURRENCY_CODES = new Set([
  "AED", "AFN", "ALL", "AMD", "ANG", "AOA", "ARS", "AUD", "AWG", "AZN",
  "BAM", "BBD", "BDT", "BGN", "BHD", "BIF", "BMD", "BND", "BOB", "BRL",
  "BSD", "BTC", "BTN", "BWP", "BYN", "BZD", "CAD", "CHF", "CLP", "CNY",
  "COP", "CRC", "CUP", "CVE", "CZK", "DJF", "DKK", "DOP", "DZD", "EGP",
  "ERN", "ETB", "EUR", "FJD", "FKP", "GBP", "GEL", "GHS", "GIP", "GMD",
  "GNF", "GTQ", "GYD", "HKD", "HNL", "HRK", "HTG", "HUF", "IDR", "ILS",
  "INR", "IQD", "IRR", "ISK", "JMD", "JOD", "JPY", "KES", "KGS", "KHR",
  "KMF", "KRW", "KWD", "KYD", "KZT", "LAK", "LBP", "LKR", "LRD", "LSL",
  "LYD", "MAD", "MDL", "MGA", "MKD", "MMK", "MNT", "MOP", "MRU", "MUR",
  "MVR", "MWK", "MXN", "MYR", "MZN", "NAD", "NGN", "NIO", "NOK", "NPR",
  "NZD", "OMR", "PAB", "PEN", "PGK", "PHP", "PKR", "PLN", "PYG", "QAR",
  "RON", "RSD", "RUB", "RWF", "SAR", "SBD", "SCR", "SEK", "SGD", "SHP",
  "SLE", "SOS", "SRD", "SSP", "STN", "SYP", "SZL", "THB", "TJS", "TMT",
  "TND", "TOP", "TRY", "TTD", "TWD", "TZS", "UAH", "UGX", "USD", "UYU",
  "UZS", "VES", "VND", "VUV", "WST", "XAF", "XCD", "XOF", "XPF", "YER",
  "ZAR", "ZMW",
]);

function convertCurrencyExpression(expression) {
  const parsed = parseCurrencyExpression(expression);
  if (!parsed) return null;

  const key = `${parsed.from}${parsed.to}`;
  const cached = currencyCache.get(key);
  if (!cached) {
    return {
      kind: "currency",
      output: "Converting...",
      detail: `${formatNumber(parsed.amount)} ${parsed.from} to ${parsed.to}`,
      currency: parsed,
      pending: true,
    };
  }

  const converted = parsed.amount * cached.rate;
  return {
    kind: "currency",
    output: `${formatCurrencyAmount(converted)} ${parsed.to}`,
    detail: `${formatCurrencyAmount(parsed.amount)} ${parsed.from} · 1 ${parsed.from} = ${formatCurrencyRate(cached.rate)} ${parsed.to}`,
    currency: parsed,
  };
}

function parseCurrencyExpression(expression) {
  const full = expression.match(/^(.+?)\s+([a-z]{3})\s+(?:to|in)\s+([a-z]{3})$/i);
  if (full) {
    const amount = evaluateCurrencyAmount(full[1]);
    const from = full[2].toUpperCase();
    const to = full[3].toUpperCase();
    if (amount !== null && isCurrencyCode(from) && isCurrencyCode(to)) return { amount, from, to };
  }

  const compact = expression.match(/^([a-z]{3})\s+(?:to|in)?\s*([a-z]{3})$/i);
  if (compact) {
    const from = compact[1].toUpperCase();
    const to = compact[2].toUpperCase();
    if (isCurrencyCode(from) && isCurrencyCode(to)) return { amount: 1, from, to };
  }

  return null;
}

function evaluateCurrencyAmount(expression) {
  try {
    const amount = evaluateMathExpression(expression.trim());
    return Number.isFinite(amount) ? amount : null;
  } catch {
    return null;
  }
}

function isCurrencyCode(code) {
  return CURRENCY_CODES.has(code);
}

function resolveCurrencyResult(query) {
  const expression = query.trim().startsWith("=") ? query.trim().slice(1).trim() : "";
  const parsed = parseCurrencyExpression(expression);
  if (!parsed) return;
  if (parsed.from === parsed.to) {
    currencyCache.set(`${parsed.from}${parsed.to}`, { rate: 1, timestamp: Date.now() });
    return;
  }

  const key = `${parsed.from}${parsed.to}`;
  const cached = currencyCache.get(key);
  if (cached && Date.now() - cached.timestamp < 10 * 60 * 1000) return;
  if (currencyRequests.has(key)) return;

  const request = fetchYahooCurrencyRate(parsed.from, parsed.to)
    .then(rate => {
      currencyCache.set(key, { rate, timestamp: Date.now() });
      if (input.value.trim() === query.trim()) renderResults();
    })
    .catch(error => {
      console.warn("Currency conversion failed:", error);
      currencyCache.delete(key);
    })
    .finally(() => currencyRequests.delete(key));

  currencyRequests.set(key, request);
}

async function fetchYahooCurrencyRate(from, to) {
  const symbol = `${from}${to}=X`;
  const response = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=1d`);
  if (!response.ok) throw new Error(`Yahoo Finance returned ${response.status}`);

  const data = await response.json();
  const error = data?.chart?.error;
  if (error) throw new Error(error.description || "Yahoo Finance error");

  const rate = data?.chart?.result?.[0]?.meta?.regularMarketPrice;
  if (!Number.isFinite(rate)) throw new Error("No currency rate found");
  return rate;
}

function formatCurrencyAmount(value) {
  return Number(value.toFixed(6)).toLocaleString("en-US", {
    maximumFractionDigits: 6,
  });
}

function formatCurrencyRate(value) {
  return Number(value.toFixed(8)).toLocaleString("en-US", {
    maximumFractionDigits: 8,
  });
}

function convertColorExpression(expression) {
  const match = expression.match(/^(#[0-9a-f]{6})\s+(?:to|as)\s+(rgb|hsl)$/i);
  if (!match) return null;

  const rgb = hexToRgb(match[1]);
  if (match[2].toLowerCase() === "rgb") {
    return {
      output: `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`,
      detail: match[1].toUpperCase(),
    };
  }

  const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
  return {
    output: `hsl(${hsl.h}, ${hsl.s}%, ${hsl.l}%)`,
    detail: match[1].toUpperCase(),
  };
}

function convertUnitExpression(expression) {
  const match = expression.match(/^(.+?)\s+(?:to|in)\s+([a-zA-Z]+)$/);
  if (!match) return null;

  const left = match[1].trim();
  const targetUnit = normalizeUnit(match[2]);
  const valueMatch = left.match(/^(.+?)\s*([a-zA-Z]+)$/);
  if (!valueMatch) return null;

  const amount = evaluateMathExpression(valueMatch[1].trim());
  const sourceUnit = normalizeUnit(valueMatch[2]);
  const converted = convertUnits(amount, sourceUnit, targetUnit);
  if (!converted) return null;

  return {
    output: `${formatNumber(converted.value)} ${converted.unit}`,
    detail: `${formatNumber(amount)} ${converted.sourceUnit}`,
  };
}

const UNIT_ALIASES = {
  centimeter: "cm",
  centimeters: "cm",
  metre: "m",
  meter: "m",
  metres: "m",
  meters: "m",
  kilometer: "km",
  kilometers: "km",
  inch: "in",
  inches: "in",
  foot: "ft",
  feet: "ft",
  yard: "yd",
  yards: "yd",
  mile: "mi",
  miles: "mi",
  gram: "g",
  grams: "g",
  kilogram: "kg",
  kilograms: "kg",
  pound: "lb",
  pounds: "lb",
  ounce: "oz",
  ounces: "oz",
  second: "s",
  seconds: "s",
  minute: "min",
  minutes: "min",
  hour: "h",
  hours: "h",
  day: "d",
  days: "d",
  byte: "b",
  bytes: "b",
};

const UNIT_GROUPS = {
  length: { mm: 0.001, cm: 0.01, m: 1, km: 1000, in: 0.0254, ft: 0.3048, yd: 0.9144, mi: 1609.344 },
  mass: { mg: 0.000001, g: 0.001, kg: 1, oz: 0.028349523125, lb: 0.45359237 },
  time: { ms: 0.001, s: 1, min: 60, h: 3600, d: 86400 },
  data: { b: 1, kb: 1024, mb: 1048576, gb: 1073741824, tb: 1099511627776 },
};

function normalizeUnit(unit) {
  const normalized = unit.toLowerCase();
  return UNIT_ALIASES[normalized] || normalized;
}

function convertUnits(amount, sourceUnit, targetUnit) {
  if (["c", "f", "k"].includes(sourceUnit) && ["c", "f", "k"].includes(targetUnit)) {
    return {
      value: convertTemperature(amount, sourceUnit, targetUnit),
      unit: targetUnit.toUpperCase(),
      sourceUnit: sourceUnit.toUpperCase(),
    };
  }

  for (const units of Object.values(UNIT_GROUPS)) {
    if (units[sourceUnit] && units[targetUnit]) {
      return {
        value: amount * units[sourceUnit] / units[targetUnit],
        unit: targetUnit,
        sourceUnit,
      };
    }
  }

  return null;
}

function convertTemperature(amount, sourceUnit, targetUnit) {
  let celsius = amount;
  if (sourceUnit === "f") celsius = (amount - 32) * 5 / 9;
  if (sourceUnit === "k") celsius = amount - 273.15;
  if (targetUnit === "f") return celsius * 9 / 5 + 32;
  if (targetUnit === "k") return celsius + 273.15;
  return celsius;
}

function evaluateMathExpression(expression) {
  const parser = new MathParser(expression);
  const value = parser.parse();
  if (!Number.isFinite(value)) throw new Error("Invalid result");
  return value;
}

class MathParser {
  constructor(expression) {
    this.expression = expression.replace(/\s+/g, "");
    this.index = 0;
  }

  parse() {
    const value = this.parseExpression();
    if (this.index !== this.expression.length) throw new Error("Unexpected input");
    return value;
  }

  parseExpression() {
    let value = this.parseTerm();
    while (this.match("+") || this.match("-")) {
      const op = this.expression[this.index - 1];
      const right = this.parseTerm();
      value = op === "+" ? value + right : value - right;
    }
    return value;
  }

  parseTerm() {
    let value = this.parsePower();
    while (this.match("*") || this.match("/") || this.match("%")) {
      const op = this.expression[this.index - 1];
      const right = this.parsePower();
      if (op === "*") value *= right;
      if (op === "/") value /= right;
      if (op === "%") value %= right;
    }
    return value;
  }

  parsePower() {
    let value = this.parseUnary();
    if (this.match("^")) {
      value = Math.pow(value, this.parsePower());
    }
    return value;
  }

  parseUnary() {
    if (this.match("+")) return this.parseUnary();
    if (this.match("-")) return -this.parseUnary();
    return this.parsePrimary();
  }

  parsePrimary() {
    if (this.match("(")) {
      const value = this.parseExpression();
      if (!this.match(")")) throw new Error("Missing parenthesis");
      return value;
    }

    if (/[a-z]/i.test(this.peek())) {
      const name = this.readName().toLowerCase();
      if (name === "pi") return Math.PI;
      if (name === "e") return Math.E;
      if (!this.match("(")) throw new Error("Expected function call");
      const args = [];
      if (!this.match(")")) {
        do {
          args.push(this.parseExpression());
        } while (this.match(","));
        if (!this.match(")")) throw new Error("Missing function parenthesis");
      }
      return this.callFunction(name, args);
    }

    return this.readNumber();
  }

  readNumber() {
    const start = this.index;
    while (/[0-9.]/.test(this.peek())) this.index++;
    if (this.peek().toLowerCase() === "e") {
      const exponentStart = this.index;
      this.index++;
      if (this.peek() === "+" || this.peek() === "-") this.index++;
      const digitStart = this.index;
      while (/[0-9]/.test(this.peek())) this.index++;
      if (digitStart === this.index) this.index = exponentStart;
    }

    if (start === this.index) throw new Error("Expected number");
    const value = Number(this.expression.slice(start, this.index));
    if (!Number.isFinite(value)) throw new Error("Invalid number");
    return value;
  }

  readName() {
    const start = this.index;
    while (/[a-z]/i.test(this.peek())) this.index++;
    return this.expression.slice(start, this.index);
  }

  callFunction(name, args) {
    const functions = {
      abs: Math.abs,
      acos: Math.acos,
      asin: Math.asin,
      atan: Math.atan,
      ceil: Math.ceil,
      cos: Math.cos,
      floor: Math.floor,
      ln: Math.log,
      log: Math.log10,
      max: Math.max,
      min: Math.min,
      pow: Math.pow,
      round: Math.round,
      sin: Math.sin,
      sqrt: Math.sqrt,
      tan: Math.tan,
    };

    if (!functions[name]) throw new Error("Unknown function");
    return functions[name](...args);
  }

  match(char) {
    if (this.expression[this.index] !== char) return false;
    this.index++;
    return true;
  }

  peek() {
    return this.expression[this.index] || "";
  }
}

function formatNumber(value) {
  if (Math.abs(value) >= 1e12 || (Math.abs(value) > 0 && Math.abs(value) < 1e-6)) {
    return value.toExponential(6).replace(/\.?0+e/, "e");
  }

  return Number(value.toFixed(10)).toLocaleString("en-US", {
    maximumFractionDigits: 10,
  });
}

function renderQrCanvas(text) {
  const qr = createQrCode(text);
  const quietZone = 4;
  const scale = 8;
  const size = qr.size + quietZone * 2;
  const canvas = document.createElement("canvas");
  canvas.width = size * scale;
  canvas.height = size * scale;
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#0f172a";

  for (let y = 0; y < qr.size; y++) {
    for (let x = 0; x < qr.size; x++) {
      if (qr.modules[y][x]) {
        ctx.fillRect((x + quietZone) * scale, (y + quietZone) * scale, scale, scale);
      }
    }
  }

  return canvas;
}

function createQrCode(text) {
  const bytes = new TextEncoder().encode(text);
  const versions = [
    { version: 1, size: 21, dataCodewords: 19, eccCodewords: 7, align: [] },
    { version: 2, size: 25, dataCodewords: 34, eccCodewords: 10, align: [6, 18] },
    { version: 3, size: 29, dataCodewords: 55, eccCodewords: 15, align: [6, 22] },
    { version: 4, size: 33, dataCodewords: 80, eccCodewords: 20, align: [6, 26] },
  ];
  const config = versions.find(item => bytes.length <= Math.floor((item.dataCodewords * 8 - 12) / 8));
  if (!config) throw new Error("QR text is too long. Use 78 bytes or less.");

  const data = buildQrData(bytes, config.dataCodewords);
  const ecc = reedSolomonRemainder(data, config.eccCodewords);
  const codewords = [...data, ...ecc];
  const base = makeEmptyQrMatrix(config);

  placeQrData(base.modules, base.reserved, codewords);

  let best = null;
  for (let mask = 0; mask < 8; mask++) {
    const modules = base.modules.map(row => row.slice());
    applyQrMask(modules, base.reserved, mask);
    drawFormatBits(modules, mask);
    const penalty = getQrPenalty(modules);
    if (!best || penalty < best.penalty) best = { modules, penalty };
  }

  return { size: config.size, modules: best.modules };
}

function buildQrData(bytes, dataCodewords) {
  const bits = [];
  appendBits(bits, 0b0100, 4);
  appendBits(bits, bytes.length, 8);
  for (const byte of bytes) appendBits(bits, byte, 8);

  const capacity = dataCodewords * 8;
  appendBits(bits, 0, Math.min(4, capacity - bits.length));
  while (bits.length % 8) bits.push(0);

  const data = [];
  for (let i = 0; i < bits.length; i += 8) {
    data.push(Number.parseInt(bits.slice(i, i + 8).join(""), 2));
  }

  const pads = [0xec, 0x11];
  let padIndex = 0;
  while (data.length < dataCodewords) {
    data.push(pads[padIndex % 2]);
    padIndex++;
  }
  return data;
}

function appendBits(bits, value, length) {
  for (let i = length - 1; i >= 0; i--) bits.push((value >>> i) & 1);
}

function makeEmptyQrMatrix(config) {
  const modules = Array.from({ length: config.size }, () => Array(config.size).fill(false));
  const reserved = Array.from({ length: config.size }, () => Array(config.size).fill(false));

  drawFinder(modules, reserved, 0, 0);
  drawFinder(modules, reserved, config.size - 7, 0);
  drawFinder(modules, reserved, 0, config.size - 7);

  for (let i = 0; i < config.size; i++) {
    if (!reserved[i][6]) setQrModule(modules, reserved, 6, i, i % 2 === 0, true);
    if (!reserved[6][i]) setQrModule(modules, reserved, i, 6, i % 2 === 0, true);
  }

  for (const y of config.align) {
    for (const x of config.align) {
      if (reserved[y]?.[x]) continue;
      drawAlignment(modules, reserved, x - 2, y - 2);
    }
  }

  setQrModule(modules, reserved, 8, config.size - 8, true, true);
  reserveFormat(modules, reserved);
  return { modules, reserved };
}

function drawFinder(modules, reserved, left, top) {
  for (let y = -1; y <= 7; y++) {
    for (let x = -1; x <= 7; x++) {
      const xx = left + x;
      const yy = top + y;
      if (yy < 0 || xx < 0 || yy >= modules.length || xx >= modules.length) continue;
      const dark = x >= 0 && x <= 6 && y >= 0 && y <= 6 && (x === 0 || x === 6 || y === 0 || y === 6 || (x >= 2 && x <= 4 && y >= 2 && y <= 4));
      setQrModule(modules, reserved, xx, yy, dark, true);
    }
  }
}

function drawAlignment(modules, reserved, left, top) {
  for (let y = 0; y < 5; y++) {
    for (let x = 0; x < 5; x++) {
      const dark = x === 0 || x === 4 || y === 0 || y === 4 || (x === 2 && y === 2);
      setQrModule(modules, reserved, left + x, top + y, dark, true);
    }
  }
}

function reserveFormat(modules, reserved) {
  const size = modules.length;
  for (let i = 0; i < 9; i++) {
    if (i !== 6) {
      reserved[8][i] = true;
      reserved[i][8] = true;
    }
  }
  for (let i = 0; i < 8; i++) {
    reserved[8][size - 1 - i] = true;
    reserved[size - 1 - i][8] = true;
  }
}

function setQrModule(modules, reserved, x, y, dark, isReserved = false) {
  if (y < 0 || x < 0 || y >= modules.length || x >= modules.length) return;
  modules[y][x] = Boolean(dark);
  if (isReserved) reserved[y][x] = true;
}

function placeQrData(modules, reserved, codewords) {
  const bits = codewords.flatMap(byte => Array.from({ length: 8 }, (_, i) => (byte >>> (7 - i)) & 1));
  const size = modules.length;
  let bitIndex = 0;
  let upward = true;

  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right--;
    for (let vertical = 0; vertical < size; vertical++) {
      const y = upward ? size - 1 - vertical : vertical;
      for (let dx = 0; dx < 2; dx++) {
        const x = right - dx;
        if (reserved[y][x]) continue;
        modules[y][x] = Boolean(bits[bitIndex++] || 0);
      }
    }
    upward = !upward;
  }
}

function applyQrMask(modules, reserved, mask) {
  const rules = [
    (x, y) => (x + y) % 2 === 0,
    (x, y) => y % 2 === 0,
    (x) => x % 3 === 0,
    (x, y) => (x + y) % 3 === 0,
    (x, y) => (Math.floor(y / 2) + Math.floor(x / 3)) % 2 === 0,
    (x, y) => ((x * y) % 2 + (x * y) % 3) === 0,
    (x, y) => (((x * y) % 2 + (x * y) % 3) % 2) === 0,
    (x, y) => (((x + y) % 2 + (x * y) % 3) % 2) === 0,
  ];

  for (let y = 0; y < modules.length; y++) {
    for (let x = 0; x < modules.length; x++) {
      if (!reserved[y][x] && rules[mask](x, y)) modules[y][x] = !modules[y][x];
    }
  }
}

function drawFormatBits(modules, mask) {
  const size = modules.length;
  const format = getQrFormatBits(mask);

  for (let i = 0; i <= 5; i++) modules[i][8] = Boolean((format >>> i) & 1);
  modules[7][8] = Boolean((format >>> 6) & 1);
  modules[8][8] = Boolean((format >>> 7) & 1);
  modules[8][7] = Boolean((format >>> 8) & 1);
  for (let i = 9; i < 15; i++) modules[8][14 - i] = Boolean((format >>> i) & 1);

  for (let i = 0; i < 8; i++) modules[8][size - 1 - i] = Boolean((format >>> i) & 1);
  for (let i = 8; i < 15; i++) modules[size - 15 + i][8] = Boolean((format >>> i) & 1);
  modules[size - 8][8] = true;
}

function getQrFormatBits(mask) {
  let data = (1 << 3) | mask;
  let value = data << 10;
  const generator = 0b10100110111;
  for (let i = 14; i >= 10; i--) {
    if ((value >>> i) & 1) value ^= generator << (i - 10);
  }
  return ((data << 10) | value) ^ 0b101010000010010;
}

function getQrPenalty(modules) {
  const size = modules.length;
  let penalty = 0;

  for (let y = 0; y < size; y++) penalty += getRunPenalty(modules[y]);
  for (let x = 0; x < size; x++) penalty += getRunPenalty(modules.map(row => row[x]));

  for (let y = 0; y < size - 1; y++) {
    for (let x = 0; x < size - 1; x++) {
      const color = modules[y][x];
      if (modules[y][x + 1] === color && modules[y + 1][x] === color && modules[y + 1][x + 1] === color) penalty += 3;
    }
  }

  const dark = modules.flat().filter(Boolean).length;
  penalty += Math.floor(Math.abs(dark * 20 - size * size * 10) / (size * size)) * 10;
  return penalty;
}

function getRunPenalty(line) {
  let penalty = 0;
  let runColor = line[0];
  let runLength = 1;

  for (let i = 1; i <= line.length; i++) {
    if (line[i] === runColor) {
      runLength++;
    } else {
      if (runLength >= 5) penalty += runLength - 2;
      runColor = line[i];
      runLength = 1;
    }
  }

  return penalty;
}

function reedSolomonRemainder(data, degree) {
  const generator = reedSolomonGenerator(degree);
  const result = Array(degree).fill(0);

  for (const byte of data) {
    const factor = byte ^ result.shift();
    result.push(0);
    for (let i = 0; i < degree; i++) {
      result[i] ^= gfMultiply(generator[i], factor);
    }
  }

  return result;
}

function reedSolomonGenerator(degree) {
  const result = Array(degree).fill(0);
  result[degree - 1] = 1;
  let root = 1;

  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < degree; j++) {
      result[j] = gfMultiply(result[j], root);
      if (j + 1 < degree) result[j] ^= result[j + 1];
    }
    root = gfMultiply(root, 0x02);
  }

  return result;
}

function gfMultiply(a, b) {
  let result = 0;
  for (let i = 0; i < 8; i++) {
    if (b & 1) result ^= a;
    const carry = a & 0x80;
    a = (a << 1) & 0xff;
    if (carry) a ^= 0x1d;
    b >>>= 1;
  }
  return result;
}

function setStatus(message, isLoading = false, isError = false) {
  if (!results || !searchBar) return;

  searchBar.style.borderRadius = "30px 30px 0 0";
  filterMenu.hidden = true;
  results.style.display = "block";

  if (isLoading) {
    results.innerHTML = `
      <div class="status-message">
        <span>${escapeHtml(message)}</span>
        <div class="progress">
          <div class="progress-value"></div>
        </div>
      </div>
    `;
    return;
  }

  results.innerHTML = `
    <div class="status-message ${isError ? "is-error" : "is-success"}">
      <span>${escapeHtml(message)}</span>
    </div>
  `;

  setTimeout(() => {
    searchBar.style.borderRadius = "30px";
    results.style.display = "none";
  }, 2500);
}

async function executeAiCommand(prompt) {
  if (!prompt) return;

  setStatus("Asking AI...", true);

  const windows = await chrome.windows.getAll({ windowTypes: ["normal"] });
  const focusedWin = windows.find(window => window.focused) || windows[0];

  if (!focusedWin) {
    setStatus("No browser window found.", false, true);
    return;
  }

  const tabs = await chrome.tabs.query({ windowId: focusedWin.id });
  const tabGroups = await chrome.tabGroups.query({ windowId: focusedWin.id });
  const groupedTabs = buildGroupedTabContext(tabs, tabGroups);
  const clientId = await getClientId();

  try {
    const response = await fetch(`${BACKEND_URL}/agent`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt,
        context: { tabs: groupedTabs, client_id: clientId },
      }),
    });

    if (!response.ok) {
      console.error("Backend error:", await response.text());
      setStatus("AI request failed.", false, true);
      return;
    }

    const aiResults = await response.json();
    const resultList = Array.isArray(aiResults) ? aiResults : [aiResults];

    for (const result of resultList) {
      await handleAgentResponse(result, tabs, focusedWin);
    }
  } catch (error) {
    console.error("AI request error:", error);
    setStatus("AI request failed.", false, true);
  }
}

function buildGroupedTabContext(tabs, tabGroups) {
  const groupedTabs = [];

  for (const group of tabGroups) {
    const groupTabs = tabs.filter(tab => tab.groupId === group.id);
    if (!groupTabs.length) continue;

    groupedTabs.push({
      group_name: group.title || "Unnamed Group",
      tabs: groupTabs.map(tab => ({
        title: tab.title || "",
        url: tab.url || "",
        description: tab.title || "",
      })),
    });
  }

  const ungroupedTabs = tabs.filter(tab => tab.groupId === -1);
  if (ungroupedTabs.length) {
    groupedTabs.push({
      group_name: "Ungrouped",
      tabs: ungroupedTabs.map(tab => ({
        title: tab.title || "",
        url: tab.url || "",
        description: tab.title || "",
      })),
    });
  }

  return groupedTabs;
}

async function handleAgentResponse(result, tabs, focusedWin) {
  switch (result.action) {
    case "answer_question":
      showAiAnswer(result.output);
      break;

    case "organize_tabs":
      setStatus("Organizing tabs...", true);
      await organizeTabsFrontend(tabs, result.output?.tabs || [], focusedWin);
      setStatus("Tabs organized.");
      break;

    case "generate_tabs":
      setStatus("Opening tabs...", true);
      await openGeneratedTabs(result.output.group_name, result.output.tabs, focusedWin);
      setStatus(`Opened: ${result.output.group_name}`);
      break;

    case "search_tabs":
      setStatus("Finding tab...", true);
      await switchToTab(result.output.title);
      setStatus("Tab found.");
      break;

    case "close_tabs":
      setStatus("Closing tabs...", true);
      await handleTabClosures(result.output.tabs);
      setStatus("Tabs closed.");
      break;

    default:
      console.warn("Unknown action from backend:", result.action);
      setStatus("Unknown AI action.", false, true);
      break;
  }
}

function showAiAnswer(answer = "") {
  const text = typeof answer === "string" ? answer : JSON.stringify(answer, null, 2);
  searchBar.style.borderRadius = "30px 30px 0 0";
  filterMenu.hidden = true;
  results.style.display = "block";
  results.innerHTML = `
    <section class="tool-panel ai-answer-panel" aria-label="AI answer">
      <div class="tool-panel-header">
        <span class="result-glyph ai"><i class="fa-solid fa-wand-magic-sparkles"></i></span>
        <span>
          <span class="tool-panel-title">Answer</span>
          <span class="tool-panel-subtitle">One-off AI response</span>
        </span>
      </div>
      <div class="ai-answer-text">${escapeHtml(text)}</div>
      <div class="tool-actions">
        <button class="tool-button" id="ai-answer-copy" type="button"><i class="fa-regular fa-copy"></i>Copy Answer</button>
      </div>
    </section>
  `;

  document.getElementById("ai-answer-copy")?.addEventListener("click", async event => {
    markToolButton(event.currentTarget, await copyText(text));
  });
}

async function organizeTabsFrontend(tabs, groups, targetWin) {
  for (const group of groups) {
    const groupName = group.group_name;

    if (groupName === "Ungrouped") {
      const tabIds = tabs
        .filter(tab => group.tabs.some(groupTab => groupTab.title === tab.title))
        .map(tab => tab.id);

      for (const id of tabIds) {
        try {
          await chrome.tabs.ungroup(id);
        } catch (error) {
          console.warn("Failed to ungroup tab:", id, error);
        }
      }
      continue;
    }

    const tabIds = tabs
      .filter(tab => group.tabs.some(groupTab => groupTab.title === tab.title))
      .map(tab => tab.id);

    if (tabIds.length > 0) {
      const groupId = await chrome.tabs.group({
        tabIds,
        createProperties: { windowId: targetWin.id },
      });
      await chrome.tabGroups.update(groupId, {
        title: groupName,
        color: getGroupColor(groupName),
        collapsed: true,
      });
    }
  }
}

async function openGeneratedTabs(groupName, tabs, targetWin) {
  const newTabIds = [];

  for (const tab of tabs) {
    if (!tab.url) continue;

    const newTab = await chrome.tabs.create({
      url: tab.url,
      active: false,
    });
    newTabIds.push(newTab.id);
  }

  if (newTabIds.length > 0) {
    const groupId = await chrome.tabs.group({
      tabIds: newTabIds,
      createProperties: { windowId: targetWin.id },
    });
    await chrome.tabGroups.update(groupId, {
      title: groupName,
      color: getGroupColor(groupName),
      collapsed: true,
    });
  }
}

async function switchToTab(title) {
  return new Promise(resolve => {
    chrome.runtime.sendMessage({ type: "SWITCH_TAB", title }, response => {
      resolve(response);
    });
  });
}

async function handleTabClosures(toCloseTabs = []) {
  const tabs = await chrome.tabs.query({});

  const tabIdsToClose = tabs
    .filter(tab =>
      typeof toCloseTabs[0] === "string"
        ? toCloseTabs.includes(tab.title)
        : toCloseTabs.some(closeTab => closeTab.title === tab.title)
    )
    .map(tab => tab.id);

  if (tabIdsToClose.length > 0) {
    await chrome.tabs.remove(tabIdsToClose);
  }
}

function getGroupColor(name) {
  const colors = ["blue", "red", "yellow", "green", "pink", "purple", "cyan", "orange"];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

async function getClientId() {
  const { client_id } = await chrome.storage.local.get("client_id");

  if (!client_id) {
    const newId = crypto.randomUUID();
    await chrome.storage.local.set({ client_id: newId });
    return newId;
  }

  return client_id;
}

function setActiveFilter(nextFilter) {
  activeFilter = nextFilter;
  const filter = FILTERS.find(item => item.value === activeFilter) || FILTERS[0];
  filterButton.innerHTML = `<i class="fa-solid ${filter.icon}"></i><span>${filter.label}</span>`;
  filterButton.setAttribute("aria-label", `Search ${filter.label}`);
  filterButton.title = `Search ${filter.label}`;
  filterMenu.querySelectorAll("button").forEach(button => {
    button.classList.toggle("is-active", button.dataset.filter === activeFilter);
  });
  selectedIndex = 0;
  renderResults();
}

function renderFilterMenu() {
  filterMenu.innerHTML = FILTERS.map(filter => `
    <button type="button" data-filter="${filter.value}">
      <i class="fa-solid ${filter.icon}"></i>
      <span>${filter.label}</span>
    </button>
  `).join("");

  filterMenu.querySelectorAll("button").forEach(button => {
    button.addEventListener("mousedown", event => {
      event.preventDefault();
      filterMenu.hidden = true;
      setActiveFilter(button.dataset.filter);
      input.focus();
    });
  });
}

function handleKeyboard(event) {
  if (renameState) {
    if (event.key === "Enter") {
      event.preventDefault();
      commitRename();
    }

    if (event.key === "Escape") {
      event.preventDefault();
      cancelRename();
    }

    return;
  }

  if (event.key === "ArrowDown") {
    event.preventDefault();
    selectedIndex = visibleResults.length ? (selectedIndex + 1) % visibleResults.length : 0;
    renderResults();
  }

  if (event.key === "ArrowUp") {
    event.preventDefault();
    selectedIndex = visibleResults.length ? (selectedIndex - 1 + visibleResults.length) % visibleResults.length : 0;
    renderResults();
  }

  if (event.key === "Enter") {
    event.preventDefault();
    selectCurrentResult();
  }

  if (event.key === "Escape") {
    event.preventDefault();
    window.parent.postMessage({ type: "TABI_CLOSE" }, "*");
  }
}

function init() {
  if (!input) return;

  renderFilterMenu();
  setActiveFilter(DEFAULT_FILTER);
  input.placeholder = "Search tabs, bookmarks, or the web...";
  input.addEventListener("input", () => {
    if (renameState) return;
    selectedIndex = 0;
    renderResults();
  });
  input.addEventListener("keydown", handleKeyboard);

  filterButton.addEventListener("mousedown", event => {
    event.preventDefault();
    filterMenu.hidden = !filterMenu.hidden;
    updatePanelShape();
  });

  document.addEventListener("mousedown", event => {
    if (!filterMenu.contains(event.target) && !filterButton.contains(event.target)) {
      filterMenu.hidden = true;
      updatePanelShape();
    }
  });

  loadResults();
  input.focus();
  input.select();
}

window.addEventListener("message", event => {
  if (event.data?.type === "FOCUS_SEARCH") {
    loadResults();
    input.focus();
    input.select();
  }
});

chrome.runtime.onMessage.addListener(message => {
  if (message?.type !== "TABI_SCREENSHOT_PROGRESS") return;
  if (message.captureId !== activeScreenshotCaptureId) return;
  updateScreenshotProgress(message.current, message.total);
});

document.addEventListener("DOMContentLoaded", init);
