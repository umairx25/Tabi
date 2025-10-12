/*
popup.js
Handles the main javascript functions, including communicating with the backend API
and carrying out in-browser actions (like modifying/creating/switching tabs).
*/

const input = document.getElementById("search-input");
const results = document.getElementById("results");
const BACKEND_URL = "http://127.0.0.1:8000";

let search_suggestion;

/**
 * Sets the status UI in the popup
 */

function setStatus(message, isLoading = false, isError = false) {
  if (!results) return;

  const searchBar = document.querySelector('.search-bar');
  searchBar.style.borderRadius = '30px 30px 0 0';

  results.style.display = "block";

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

    // Reset border radius after a delay
    setTimeout(() => {
      searchBar.style.borderRadius = '30px';
      results.style.display = 'none';
    }, 10000);
  }
}

/**
 * Return all the bookmarks TITLES, cleaned and formatted
 */
async function getAllBookmarkTitles() {

  return new Promise((resolve, reject) => {
    chrome.bookmarks.getTree((nodes) => {
      try {
        const bookmarks = [];

        const walk = (arr) => {
          for (const n of arr) {
            if (n.url) {
              // push directly in the format show_results expects
              bookmarks.push({
                label: n.title, // first 2 words
                type: "bookmark",
              });
            }
            if (n.children) walk(n.children);
          }
        };

        walk(nodes);
        resolve(bookmarks);
      } catch (e) {
        reject(e);
      }
    });
  });
}


/**
 * Core function to execute the agent. Retrieve data using an http request, and 
 * execute corresponding function.
 */
async function execute_cmd() {
  const userPrompt = input.value.trim();

  if (!userPrompt) return;
  setStatus("Executing command…", true);

  // Get currently open tabs to send as context
  const windows = await chrome.windows.getAll({ windowTypes: ['normal'] });
  const focusedWin = windows.find(w => w.focused) || windows[0];

  if (!focusedWin) {
    console.error("No normal browser window found.");
    return;
  }


  const tabs = await chrome.tabs.query({ windowId: focusedWin.id });
  const tabGroups = await chrome.tabGroups.query({ windowId: focusedWin.id });
  const bookmark_tree = await getBookmarkTree();

  console.warn("Tabs:", tabs)
  console.warn("Groups: ", tabGroups)

  const groupedTabs = [];

  // Add real tab groups
  for (const group of tabGroups) {
    const groupTabs = tabs.filter(t => t.groupId === group.id);
    if (groupTabs.length === 0) continue;

    groupedTabs.push({
      group_name: group.title || "Unnamed Group",
      tabs: groupTabs.map(t => ({
        title: t.title || "",
        url: t.url || "",
        description: t.title || "", // fallback
      })),
    });
  }

  // Add ungrouped tabs
  const ungroupedTabs = tabs.filter(t => t.groupId === -1);
  if (ungroupedTabs.length > 0) {
    groupedTabs.push({
      group_name: "Ungrouped",
      tabs: ungroupedTabs.map(t => ({
        title: t.title || "",
        url: t.url || "",
        description: t.title || "",
      })),
    });
  }

  console.warn(groupedTabs)

  // Send all the tabs, organized in tab groups, to the agent as context
  try {
    const response = await fetch(`${BACKEND_URL}/agent`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: userPrompt,
        context: { tabs: groupedTabs, bookmarks: bookmark_tree},
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Backend error:", errorText);
      setStatus("Backend error", false, true);
      return;
    }


    const result = await response.json();
    console.warn("Agent result:", result);
    console.warn("Agent result of type", typeof (result))

    // Execute function based on agent's response
    if (result.action === "organize_tabs") {
      setStatus("Organizing tabs…", true);
    } else if (result.action === "generate_tabs") {
      setStatus("Generating tabs…", true);
    } else if (result.action === "search_tabs") {
      setStatus("Searching tabs…", true);
    } else if (result.action === "close_tabs") {
      setStatus("Cleaning up your tabs…", true);
    }

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

  switch (result.action) {
    case "organize_tabs":
      await organizeTabsFrontend(tabs, result.output?.tabs || [], focusedWin);
      setStatus("Tabs organized successfully!");
      break;

    case "generate_tabs":
      await openGeneratedTabs(result.output.group_name, result.output.tabs, focusedWin);
      setStatus(`Your tabs are saved in: ${result.output.group_name}`);
      break;

    case "search_tabs":
      await switchToTab(result.output.title);
      setStatus("Your tab was found!");
      break;

    case "close_tabs":
      await handleTabClosures(result.output.tabs);
      setStatus("Your tab have been cleaned up!");
      break;
    
    case "remove_bookmarks":
      await handleBookmarkRemovals(result.output.bookmarks);
      setStatus("Removed requested bookmarks!");
      break;
    
    case "search_bookmarks":
      const lst_bookmarks = result.output.bookmarks
      await openBookmark(lst_bookmarks[0]);
      setStatus("Your bookmark was found!");
      break;
    
    case "organize_bookmarks":
        await organizeBookmarksFrontend(result.output.reorganized_bookmarks);
        if (result.output.tabs_to_add?.length > 0)
          await saveTabsToBookmarkFolders(result.output.tabs_to_add);
        setStatus("Bookmarks and tabs organized!");
        break;


    default:
      console.warn("Unknown action from backend:", result.action);
      setStatus("Sorry, Tabi can't do that yet!", false, true);
      break;
  }
}

/**
 * Group existing tabs by category
 */
async function organizeTabsFrontend(tabs, groups, targetWin) {
  for (const group of groups) {
    const groupName = group.group_name;


    if (groupName === "Ungrouped") {
      // Find tab IDs that should be ungrouped
      const tabIds = tabs
        .filter(t => group.tabs.some(gTab => gTab.title === t.title))
        .map(t => t.id);

      for (const id of tabIds) {
        try {
          await chrome.tabs.ungroup(id);
        } catch (e) {
          console.warn("Failed to ungroup tab:", id, e);
        }
      }
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

  const windows = await chrome.windows.getAll({ windowTypes: ["normal"] });
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
  console.warn(tabData)

  // Match tabs to close
  const tabIdsToClose = tabData
    .filter(tab =>
      // If backend returns list of titles
      typeof toCloseTabs[0] === "string"
        ? toCloseTabs.includes(tab.title)
        // If backend returns list of objects { title, url }
        : toCloseTabs.some(closeTab => closeTab.title === tab.title)
    )
    .map(tab => tab.id);

  // Close matched tabs
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
    "close all distracting tabs",
    "find the CNN article I opened",
  ];
  const index = Math.floor(Math.random() * suggestions_lst.length);

  return start + suggestions_lst[index];
}

// === Pressing enter triggers the backend ===
if (input) {
  input.addEventListener("keydown", e => {
    if (e.key === "Enter") execute_cmd();
  });
}


document.addEventListener("DOMContentLoaded", () => {
  if (!input) return;

  search_suggestion = cycle_suggestions();
  input.placeholder = search_suggestion;
  input.focus();
  input.select();

});


/**
 * Return all the bookmarks as a cleaned tree object
 */
async function getBookmarkTree() {
  return new Promise((resolve, reject) => {
    chrome.bookmarks.getTree((nodes) => {
      try {
        const simplify = (arr) => {
          return arr.map((node) => ({
            id: node.id,
            title: node.title || "",
            url: node.url || null,
            children: node.children ? simplify(node.children) : [],
          }));
        };

        resolve(simplify(nodes));
      } catch (e) {
        reject(e);
      }
    });
  });
}


window.addEventListener("message", async (event) => {
  if (event.data?.type === "FOCUS_SEARCH") {
    const input = document.getElementById("search-input");

    const windows = await chrome.windows.getAll({ windowTypes: ["normal"] });
    const focusedWin = windows.find(w => w.focused) || windows[0];

    if (!focusedWin) {
      console.error("No normal browser window found.");
      return;
    }

    const tabs = await chrome.tabs.query({ windowId: focusedWin.id });

    const tabTitles = tabs.map(t => ({
      label: t.title.split(/\s+/).slice(0, 2).join(" ").replace(/[#\-_|\\/\.><,!`$%^&*()+=]/g, ""),
      type: "tab"
    }));

    const bookmark_titles = await getAllBookmarkTitles();  // returns array of strings
    const bookmark_titles_formatted = bookmark_titles.map(b => ({
          label: b.label.split(/\s+/).slice(0, 2).join(" ").replace(/[#\-_|\\/\><,!`$%^&*()+=]/g, ""),
          type: "bookmark"
        }));


    // Combine both lists into one
    const all_tabs = [...tabTitles, ...bookmark_titles_formatted];

    show_results(all_tabs)

    if (input) {
      input.focus();
      input.select();
    }
  }
});


/**
 * Uses autocompleteJS to determine a list of strings matching user input, and display them
 * in an appropriate format.
 * Expect: list = [{ label: "Khan Academy", type: "bookmark" }, { label: "GitHub", type: "tab" }, ...]
 */
function show_results(list) {

  if (!Array.isArray(list) || list.length === 0) {
    console.warn("No results to show:", list);
    return;
  }

  // Destroy any old dropdowns to prevent duplicates
  document.querySelectorAll(".autoComplete_wrapper ul").forEach(el => el.remove());

  // Create the autocomplete instance
  const autoCompleteJS = new autoComplete({
    selector: "#search-input",
    placeHolder: cycle_suggestions(),
    data: {
      src: list,
      keys: ["label"],
    },
    resultsList: {
      maxResults: 5,
      class: "auto-results",
    },
    resultItem: {
      highlight: false,
      element: (item, data) => {
        item.innerHTML = "";

        // Text (render match markup properly)
        const text = document.createElement("span");
        text.innerHTML = data.match; 
        text.className = "result-text";

        // Icon (differentiate bookmarks and tabs)
        const icon = document.createElement("i");
        icon.className =
          data.value.type === "bookmark"
            ? "fa-solid fa-bookmark result-icon bookmark"
            : "fa-solid fa-globe result-icon tab";

        // Layout container
        const wrapper = document.createElement("div");
        wrapper.className = "result-item-wrapper";
        wrapper.style.display = "flex";
        wrapper.style.justifyContent = "space-between";
        wrapper.style.alignItems = "center";
        wrapper.style.width = "100%";

        wrapper.appendChild(text);
        wrapper.appendChild(icon);
        item.appendChild(wrapper);
      },
    },

    events: {
      input: {
        selection: async (event) => {
          const value = event.detail.selection.value;
          console.log("Selected:", value);

          // Handle based on type, find and activate tab by title
          if (value.type === "tab") {
            const tabs = await chrome.tabs.query({});
            const target = tabs.find(t => t.title.includes(value.label));
            if (target) {
              await chrome.tabs.update(target.id, { active: true });
              await chrome.windows.update(target.windowId, { focused: true });
            } else {
              console.warn("Tab not found:", value.label);
            }
          }

          // Open bookmark in a new tab
          if (value.type === "bookmark") {
            const bookmarks = await chrome.bookmarks.search(value.label);
            if (bookmarks.length > 0 && bookmarks[0].url) {
              await chrome.tabs.create({ url: bookmarks[0].url, active: true });
            } else {
              console.warn("Bookmark not found:", value.label);
            }
          }
        },
      },
    },

  });
}

/**
 * Deletes bookmarks returned by the backend (BookmarkTree schema)
 */
async function handleBookmarkRemovals(bookmarks) {
  for (const bk of bookmarks) {
    try {
      await chrome.bookmarks.removeTree(bk.id); // removes folder or single bookmark
    } catch (e) {
      console.warn(`Failed to remove bookmark ${id}`, e);
    }
  }
}


/**
 * Opens a bookmark purely using its Chrome ID (no URL field required).
 * - If it's a single bookmark → open directly.
 * - If it's a folder → open all contained bookmarks in new tabs.
 */
/**
 * Opens a tab by switching to it if it exists, or creating it if it doesn't
 */
async function openBookmark(tab) {
  if (!tab || !tab.url) {
    console.warn("Invalid tab object:", tab);
    return;
  }

  try {
    // First, try to find if this tab is already open
    const allTabs = await chrome.tabs.query({});
    const existingTab = allTabs.find(t => t.url === tab.url);

    if (existingTab) {
      // Tab exists, switch to it
      await chrome.tabs.update(existingTab.id, { active: true });
      await chrome.windows.update(existingTab.windowId, { focused: true });
      console.log(`Switched to existing tab: ${tab.title}`);
    } else {
      // Tab doesn't exist, create it
      await chrome.tabs.create({ url: tab.url, active: true });
      console.log(`Opened new tab: ${tab.title}`);
    }
  } catch (err) {
    console.error("Failed to open tab:", err);
  }
}


/**
 * Reorganizes bookmarks by moving them into specified folders.
 * Expects a flat list of {id, children: [...]}, etc.
 */
async function organizeBookmarksFrontend(bookmarkTree) {
  try {
    const moveRecursively = async (nodes, parentId = null) => {
      for (const node of nodes) {
        if (node.children && node.children.length > 0) {
          // Move this node under new parent (if applicable)
          if (parentId && node.id !== parentId) {
            try {
              await chrome.bookmarks.move(node.id, { parentId });
            } catch (e) {
              console.warn("Failed to move folder:", node.title, e);
            }
          }
          // Recurse into children
          await moveRecursively(node.children, node.id);
        } else if (parentId) {
          try {
            await chrome.bookmarks.move(node.id, { parentId });
          } catch (e) {
            console.warn("Failed to move bookmark:", node.title, e);
          }
        }
      }
    };

    await moveRecursively(bookmarkTree);
  } catch (err) {
    console.error("Failed to organize bookmarks:", err);
  }
}


/**
 * Creates bookmarks for given tabs into the specified folders.
 * Expects output = [{ tab_title, tab_url, folder_title }]
 */
async function saveTabsToBookmarkFolders(mappings) {
  try {
    const allBookmarks = await chrome.bookmarks.getTree();

    for (const { tab_title, tab_url, folder_title } of mappings) {
      const folderNode = findFolderByTitle(allBookmarks, folder_title);
      if (folderNode && folderNode.id && tab_url) {
        await chrome.bookmarks.create({
          parentId: folderNode.id,
          title: tab_title,
          url: tab_url,
        });
        console.log(`Bookmarked "${tab_title}" under "${folder_title}"`);
      } else {
        console.warn(`Could not find folder "${folder_title}" or invalid URL`);
      }
    }
  } catch (err) {
    console.error("Failed to save tabs as bookmarks:", err);
  }
}

/** Helper: Recursively find a folder by title */
function findFolderByTitle(nodes, title) {
  for (const node of nodes) {
    if (node.title === title && !node.url) return node;
    if (node.children) {
      const found = findFolderByTitle(node.children, title);
      if (found) return found;
    }
  }
  return null;
}
