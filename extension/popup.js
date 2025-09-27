const input = document.getElementById("main-input");
const results = document.getElementById("results");
const search_btn = document.getElementById("search-btn");

import { BACKEND_URL } from "./config.js";

let search_suggestion;

/**
 * Sets the status UI in the popup
 */
function setStatus(message, isLoading = false, isError = false) {
  if (!results) return;

  results.style.display = "flex";
  results.style.justifyContent = "center";
  results.style.alignItems = "center";

  if (isLoading) {
    results.innerHTML = `
      <div style="display:flex;flex-direction:column;align-items:center;gap:4px;padding:4px;">
        <span style="color:#cbd5e1;font-size:0.75rem;border:none">${message}</span>
        <div class="progress">
          <div class="progress-value"></div>
        </div>
      </div>
    `;
  } else {
    results.innerHTML = `
      <div style="font-size:0.8rem;color:${isError ? "#f87171" : "#86efac"};text-align:center;padding:6px 0;">
        ${message}
      </div>
    `;
  }
}


/**
 * Core function to execute the agent
 */
async function execute_cmd() {
  const userPrompt = input.value.trim();

  if (!userPrompt) return;
  setStatus("Executing command…", true);

  // Get currently open tabs to send as context
  // const focusedWin = await chrome.windows.getLastFocused();

  const windows = await chrome.windows.getAll({ windowTypes: ['normal'] });
  const focusedWin = windows.find(w => w.focused) || windows[0];

  if (!focusedWin) {
    console.error("No normal browser window found.");
    return;
  }


  const tabs = await chrome.tabs.query({ windowId: focusedWin.id });
  const tabData = tabs.map(tab => ({
    id: tab.id,
    title: tab.title,
    url: tab.url,
  }));

  try {
    const response = await fetch(`${BACKEND_URL}/agent`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: userPrompt,
        context: { tabs: tabData },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Backend error:", errorText);
      setStatus("Backend error. Response was fucked.", false, true);
      return;
    }


    const result = await response.json();
    console.warn("Agent result:", result);
    console.warn("Agent result of type", typeof(result))

    await handleAgentResponse(result, tabs, focusedWin);
  } catch (err) {
    console.error("Fetch error:", err);
    setStatus("Failed to execute command.", false, true);
  }
}

/**
 * Handle actions returned by the backend agent
 */
async function handleAgentResponse(result, tabs, focusedWin) {

  const msg_map = {"organize_tabs": "Organizing tabs…", "generate_tabs": "Generating tabs…",
    "search_tabs": "Searching tabs…", "close_tabs":"Cleaning up your tabs…"
  }

  setStatus(msg_map[result.action], true);

  switch (result.action) {
    case "organize_tabs":
      // setStatus("Organizing tabs…", true);
      await organizeTabsFrontend(tabs, result.output.tabs, focusedWin);
      setStatus("Tabs organized successfully!");
      break;

    case "generate_tabs":
      // setStatus("Generating tabs…", true);
      await openGeneratedTabs(result.output.group_name, result.output.tabs, focusedWin);
      setStatus(`Your tabs are saved in: ${result.output.group_name}`);
      break;

    case "search_tabs":
      // setStatus("Searching tabs…", true);

      await switchToTab(result.output.title);
      setStatus("Your tab was found!");
      break;
    
    case "close_tabs":
      // setStatus("Cleaning up your tabs…", true);

      await handleTabClosures(result.output.tabs);
      setStatus("Your tab have been cleaned up!");
      break;

    default:
      console.warn("Unknown action from backend:", result.action);
      setStatus("Unknown action returned from agent.", false, true);
      break;
  }
}

/**
 * Group existing tabs by category
 */
async function organizeTabsFrontend(tabs, groups, targetWin) {
  for (const group of groups) {
    const groupName = group.group_name;

    // Skip ungrouped tabs
    if (groupName === "Ungrouped") {
      console.log("Leaving these tabs ungrouped:", group.tabs);
      continue;
    }

    // Map tabs by matching title
    const tabIds = tabs
      .filter(tab => group.tabs.some(gTab => gTab.title === tab.title))
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


/**
 * Open generated tabs in a new tab group
 */
async function openGeneratedTabs(groupName, tabs, targetWin) {
  const newTabIds = [];

  for (const tab of tabs) {
    if (tab.url) {
      const newTab = await chrome.tabs.create({
        url: tab.url,
        active: false,
      });
      newTabIds.push(newTab.id);
    }
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

/**
 * Switch to a tab with a matching title
 */
async function switchToTab(title) {
  return new Promise(resolve => {
    chrome.runtime.sendMessage({ type: "SWITCH_TAB", title }, response => {
      if (response?.success) {
        console.log("Switched successfully:", response.tab);
      } else {
        console.warn("No tab matched:", title);
      }
      resolve(response);
    });
  });
}


/**
 * Close tabs that match the given list of titles or objects
 */
async function handleTabClosures(toCloseTabs) {
  // 1. Get all normal browser windows
  const windows = await chrome.windows.getAll({ windowTypes: ["normal"] });
  const focusedWin = windows.find(w => w.focused) || windows[0];

  if (!focusedWin) {
    console.error("No normal browser window found.");
    return;
  }

  // 2. Get all tabs for that window
  const tabs = await chrome.tabs.query({ windowId: focusedWin.id });
  const tabData = tabs.map(tab => ({
    id: tab.id,
    title: tab.title,
    url: tab.url,
  }));
  console.warn(tabData)

  // 3. Match tabs to close
  const tabIdsToClose = tabData
    .filter(tab =>
      // If backend returns list of titles
      typeof toCloseTabs[0] === "string"
        ? toCloseTabs.includes(tab.title)
        // If backend returns list of objects { title, url }
        : toCloseTabs.some(closeTab => closeTab.title === tab.title)
    )
    .map(tab => tab.id);

  // 4. Close matched tabs
  if (tabIdsToClose.length > 0) {
    await chrome.tabs.remove(tabIdsToClose);
    console.log("Closed tabs:", tabIdsToClose);
  } else {
    console.warn("No matching tabs found to close.");
  }
}



/**
 * Deterministic color assignment for tab groups
 */
function getGroupColor(name) {
  const colors = [
    "blue",
    "red",
    "yellow",
    "green",
    "pink",
    "purple",
    "cyan",
    "orange",
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

/**
 * Generate rotating suggestions for the input placeholder
 */
function cycle_suggestions() {
  const start = "Ask Tabi to... ";
  const suggestions_lst = [
    "organize my tabs",
    "create a calculus study guide",
    "setup tabs for buying a PC",
    "toggle dark mode",
    "find the CNN article I opened",
  ];
  const index = Math.floor(Math.random() * suggestions_lst.length);
  return start + suggestions_lst[index];
}

// === Event Bindings ===
if (search_btn) {
  search_btn.addEventListener("click", execute_cmd);
  input.addEventListener("keydown", e => {
    if (e.key === "Enter") execute_cmd();
  });
}

// When popup loads, focus the input and set placeholder
document.addEventListener("DOMContentLoaded", () => {
  if (!input) return;
  search_suggestion = cycle_suggestions();
  input.placeholder = search_suggestion;
  input.focus();
  input.select();
});
