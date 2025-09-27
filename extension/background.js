// background.js
let uiWindowId = null;
var WIDTH = 420;
var HEIGHT = 210;
var CMD_HEIGHT = 100;
var left;
var right;
var height;

async function openOrFocusUI(filename, center) {
    if (uiWindowId !== null) {
        try {
            const win = await chrome.windows.get(uiWindowId);
            // If we got here, the window still exists -> focus it.
            await chrome.windows.update(uiWindowId, { focused: true, drawAttention: true });
            return;
        } catch {
            uiWindowId = null;
        }
    }

    const [wind] = await chrome.windows.getAll({ windowTypes: ["normal"], populate: false });
    focusListenerAttached = false;

    if (center){
        left = Math.round(wind.left + (wind.width - WIDTH) / 2);
        top = Math.round(wind.top + (wind.height - HEIGHT) / 2);
        height = CMD_HEIGHT;
    }

    else{
        left = wind.left + wind.width - 420 - 16;
        top = wind.top + 75;
        height = HEIGHT;
    }


    // Create a fresh popup window with your extension page
    const win = await chrome.windows.create({
        url: chrome.runtime.getURL(filename), // rename if you like
        type: "popup",
        width: WIDTH,
        height: height,
        focused: true,
        left: left,
        top: top
    });

    uiWindowId = win.id;
    panelWindowId = win.id;

    if (!focusListenerAttached) {
        chrome.windows.onFocusChanged.addListener(async (focusedId) => {
            // Ignore transient "no window" state
            if (focusedId === chrome.windows.WINDOW_ID_NONE) return;
            // If our panel is open and some other window gained focus -> close panel
            if (panelWindowId !== null && focusedId !== panelWindowId) {
                try { await chrome.windows.remove(panelWindowId); } catch { }
                panelWindowId = null;
            }
        });
        focusListenerAttached = true;
    }


    chrome.runtime.onMessage.addListener((msg) => {
        if (!panelWindowId) return;

        if (msg?.type === "EXPAND" && msg?.expand === true) {
            const height = 180; // clamp a bit
            chrome.windows.update(panelWindowId, { height }).catch(() => { });
        }

        if (msg?.type === "EXPAND" && msg?.expand === false) {
            const height = 240; // clamp a bit
            chrome.windows.update(panelWindowId, { height }).catch(() => { });
        }
    });
}


// Reset the cached window id if the user closes it
chrome.windows.onRemoved.addListener((closedId) => {
    if (closedId === uiWindowId) {
        uiWindowId = null;
    }
});

// Click on toolbar icon -> open/focus window
chrome.action.onClicked.addListener(async () => {
    await openOrFocusUI("popup.html", false);
});

// // pass in custom values inside params of openorfocusui, display only the searchbar and enter
chrome.commands.onCommand.addListener(async() => {
     await openOrFocusUI("popup.html", true);
});


// Switch to browser window when message is received from popup.html
chrome.runtime.onMessage.addListener(async (msg, sender, sendResponse) => {
  if (msg.type === "SWITCH_TAB" && msg.title) {
    const targetTitle = msg.title.trim().toLowerCase();

    // Search across *normal* browser windows, not extension windows
    const allWindows = await chrome.windows.getAll({ populate: true, windowTypes: ["normal"] });
    const tabs = allWindows.flatMap(w => w.tabs || []);

    // Try exact, then substring match
    const norm = t => (t.title || "").toLowerCase();
    let candidates = tabs.filter(t => norm(t) === targetTitle);
    if (!candidates.length) {
      candidates = tabs.filter(t => norm(t).includes(targetTitle));
    }

    // Pick most recent tab
    candidates.sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0));
    const target = candidates[0];

    if (target) {
      await chrome.windows.update(target.windowId, { focused: true });
      await chrome.tabs.update(target.id, { active: true });
      console.log(`Switched to tab: ${target.title}`);
      sendResponse({ success: true, tab: target });
    } else {
      console.log(`No tab found for "${msg.title}"`);
      sendResponse({ success: false });
    }
    return true; // keep channel open for async
  }
});
