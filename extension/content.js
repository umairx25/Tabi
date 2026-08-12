/*
content.js
Injects the extension UI into the current webpage/DOM. Responsible for all
script injection, including displaying and removing the overlay.
*/


(() => {
  if (window.__tabi_content_injected__) return;
  window.__tabi_content_injected__ = true;

  let overlayOpen = false;
  let overlayEl = null;
  let shadow = null;
  let overlayTemporarilyHidden = false;
  let titleObserver = null;
  let activeAlias = "";
  let lastNaturalTitle = document.title;

  function normalizeUrlForAlias(url = "") {
    try {
      const parsed = new URL(url);
      parsed.hash = "";
      return parsed.href;
    } catch {
      return url;
    }
  }

  async function applyStoredAlias() {
    const aliasKey = normalizeUrlForAlias(window.location.href);
    const { tabAliasesByUrl = {} } = await chrome.storage.local.get("tabAliasesByUrl");
    const alias = tabAliasesByUrl[aliasKey]?.alias || "";
    applyAlias(alias);
  }

  function applyAlias(alias, fallbackTitle = "") {
    if (activeAlias && document.title !== activeAlias) {
      lastNaturalTitle = document.title;
    } else if (!activeAlias && document.title) {
      lastNaturalTitle = document.title;
    }

    activeAlias = alias || "";

    if (titleObserver) {
      titleObserver.disconnect();
      titleObserver = null;
    }

    if (!activeAlias) {
      const restoredTitle = fallbackTitle || lastNaturalTitle;
      if (restoredTitle) document.title = restoredTitle;
      return;
    }

    document.title = activeAlias;
    titleObserver = new MutationObserver(() => {
      if (activeAlias && document.title !== activeAlias) {
        document.title = activeAlias;
      }
    });
    titleObserver.observe(document.documentElement, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  }

  applyStoredAlias();

/* Creates the overlay injected into the DOM*/
  function createOverlay() {
    overlayEl = document.createElement("div");
    overlayEl.id = "tabi-overlay-host";
    overlayEl.style.cssText = [
      "position: fixed",
      "top: 47%",
      "left: 52%",
      "transform: translate(-50%, -50%)",
      "width: 600px",
      "height: 620px", 
      "z-index: 2147483647",
      "display: flex",
      "align-items: stretch",
      "justify-content: stretch",
      "pointer-events: none",
    ].join(";");

    // Remove overlay if mouse click detected outside
    overlayEl.addEventListener("mousedown", (e) => {
    if (e.target === overlayEl) {
      destroyOverlay();
    }
  });

    document.documentElement.appendChild(overlayEl);
    shadow = overlayEl.attachShadow({ mode: "open" });

    // Shadow DOM wrapper so transparent background can be achieved
    const wrapper = document.createElement("div");
    wrapper.style.cssText = [
      "all: initial",
      "position: relative",
      "width: 100%",
      "height: 100%",
      "pointer-events: auto",
      "border-radius: 0px",
      "overflow: hidden",
      "box-shadow: 0 12px 34px rgba(0,0,0,0.35)",
      "box-shadow: none",
      "background: transparent"
    ].join(";");

    // Close button
    const header = document.createElement("div");
    header.style.cssText = [
      "position: absolute",
      "top: 6px",
      "right: 6px",
      "z-index: 2",
      "display: flex",
      "gap: 6px"
    ].join(";");

    const closeBtn = document.createElement("button");
    closeBtn.textContent = "×";
    closeBtn.title = "Close";
    closeBtn.style.cssText = [
      "all: initial",
      "cursor: pointer",
      "font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
      "font-size: 16px",
      "line-height: 1",
      "padding: 6px 10px",
      "color: #eee",
      "background: #2b2b2b",
      "border-radius: 10px",
      "border: 1px solid #3a3a3a",
      "box-shadow: 0 1px 2px rgba(0,0,0,0.25)",
      "display: none"
    ].join(";");
    closeBtn.addEventListener("click", destroyOverlay);

    header.appendChild(closeBtn);
    wrapper.appendChild(header);

    // Iframe that loads extension UI
    const iframe = document.createElement("iframe");
    iframe.src = chrome.runtime.getURL("popup.html");
    iframe.title = "tabi";

    iframe.style.cssText = [
      "position: absolute",
      "inset: 0",
      "width: 100%",
      "height: 100%",
      "border: 0",
      "background: transparent",
      "color-scheme: none",          // prevent dark reader theme injection
      "allowtransparency: true",     // important for iframe bg
    ].join(";");

    iframe.setAttribute("allowtransparency", "true");
    iframe.setAttribute("allow", "clipboard-write");
    iframe.setAttribute("data-darkreader-ignore", "");


    wrapper.appendChild(iframe);
    iframe.onload = () => {
        iframe.contentWindow.postMessage({ type: "FOCUS_SEARCH" }, "*");
    };


    shadow.appendChild(wrapper);

    // Esc closes overlay
    window.addEventListener("keydown", escListener, true);
    window.addEventListener("message", messageListener, true);

    // Click outside to close
    const backdrop = document.createElement("div");
    backdrop.style.cssText = [
      "position: fixed",
      "inset: 0",
      "pointer-events: auto",
      "background: transparent"
    ].join(";");

    // Close overlay if click detected outside
    backdrop.addEventListener("mousedown", () => {
    destroyOverlay();
  });

    document.documentElement.insertBefore(backdrop, overlayEl);
    overlayEl.__backdrop = backdrop;

    overlayOpen = true;
  }

  // Destroy the current overlay
  function destroyOverlay() {
    if (!overlayEl) return;
    window.removeEventListener("keydown", escListener, true);
    window.removeEventListener("message", messageListener, true);
    overlayEl.__backdrop?.remove();
    overlayEl.remove();
    overlayEl = null;
    shadow = null;
    overlayOpen = false;
  }

  function escListener(e) {
    if (e.key === "Escape") {
      destroyOverlay();
      e.stopPropagation();
    }
  }

  function messageListener(e) {
    if (e.data?.type === "TABI_CLOSE") {
      destroyOverlay();
    }

    if (e.data?.type === "TABI_TEMP_HIDE") {
      setOverlayTemporarilyHidden(true);
    }

    if (e.data?.type === "TABI_TEMP_SHOW") {
      setOverlayTemporarilyHidden(false);
    }
  }

  function setOverlayTemporarilyHidden(hidden) {
    if (!overlayEl) return;
    overlayTemporarilyHidden = hidden;
    overlayEl.style.opacity = hidden ? "0" : "1";
    overlayEl.style.visibility = hidden ? "hidden" : "visible";
    overlayEl.style.pointerEvents = "none";
  }

  function getPageCaptureMetrics() {
    const doc = document.documentElement;
    const body = document.body;
    const fullHeight = Math.max(
      doc.scrollHeight,
      doc.offsetHeight,
      doc.clientHeight,
      body?.scrollHeight || 0,
      body?.offsetHeight || 0,
      body?.clientHeight || 0,
    );

    return {
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      fullHeight,
      pixelRatio: window.devicePixelRatio || 1,
      title: document.title || "tabi-screenshot",
    };
  }

  async function captureFullPage(captureId) {
    const metrics = getPageCaptureMetrics();
    const maxCanvasSide = 32767;
    const maxCanvasPixels = 80_000_000;
    const canvasWidth = Math.floor(metrics.viewportWidth * metrics.pixelRatio);
    const canvasHeight = Math.floor(metrics.fullHeight * metrics.pixelRatio);

    if (!metrics.viewportWidth || !metrics.viewportHeight || !metrics.fullHeight) {
      throw new Error("Could not measure this page.");
    }

    if (canvasWidth > maxCanvasSide || canvasHeight > maxCanvasSide || canvasWidth * canvasHeight > maxCanvasPixels) {
      throw new Error("Page is too large to capture safely.");
    }

    const originalScrollX = window.scrollX;
    const originalScrollY = window.scrollY;
    const originalScrollBehavior = document.documentElement.style.scrollBehavior;
    const positions = getCaptureScrollPositions(metrics.fullHeight, metrics.viewportHeight);
    const canvas = document.createElement("canvas");
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
    const context = canvas.getContext("2d");

    document.documentElement.style.scrollBehavior = "auto";
    setOverlayTemporarilyHidden(true);

    try {
      for (let index = 0; index < positions.length; index++) {
        const y = positions[index];
        window.scrollTo(originalScrollX, y);
        await waitForCaptureFrame();

        chrome.runtime.sendMessage({
          type: "TABI_SCREENSHOT_PROGRESS",
          captureId,
          current: index + 1,
          total: positions.length,
        });

        const capture = await captureVisibleViewport();
        if (!capture.success) throw new Error(capture.error || "Failed to capture page.");
        const image = await loadImage(capture.dataUrl);
        const sourceHeight = Math.min(metrics.viewportHeight, metrics.fullHeight - y) * metrics.pixelRatio;
        context.drawImage(
          image,
          0,
          0,
          image.width,
          Math.min(image.height, sourceHeight),
          0,
          Math.floor(y * metrics.pixelRatio),
          canvasWidth,
          Math.min(image.height, sourceHeight),
        );
      }

      return {
        dataUrl: canvas.toDataURL("image/png"),
        width: canvasWidth,
        height: canvasHeight,
        title: metrics.title,
      };
    } finally {
      window.scrollTo(originalScrollX, originalScrollY);
      document.documentElement.style.scrollBehavior = originalScrollBehavior;
      setOverlayTemporarilyHidden(false);
    }
  }

  function getCaptureScrollPositions(fullHeight, viewportHeight) {
    if (fullHeight <= viewportHeight) return [0];
    const positions = [];
    for (let y = 0; y < fullHeight; y += viewportHeight) {
      positions.push(Math.min(y, fullHeight - viewportHeight));
    }
    return [...new Set(positions)];
  }

  function waitForCaptureFrame() {
    return new Promise(resolve => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setTimeout(resolve, 160));
      });
    });
  }

  function captureVisibleViewport() {
    return new Promise(resolve => {
      chrome.runtime.sendMessage({ type: "TABI_CAPTURE_VISIBLE" }, response => {
        resolve(response || { success: false, error: chrome.runtime.lastError?.message });
      });
    });
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("Failed to load screenshot slice."));
      image.src = src;
    });
  }

  // Toggle the overlay
  function toggleOverlay() {
    if (overlayOpen) destroyOverlay();
    else createOverlay();
  }

  // Message from background.js to toggle
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg?.type === "tabi_TOGGLE") {
      toggleOverlay();
    }

    if (msg?.type === "TABI_APPLY_ALIAS") {
      applyAlias(msg.alias || "", msg.originalTitle || "");
    }

    if (msg?.type === "TABI_CAPTURE_FULL_PAGE") {
      captureFullPage(msg.captureId)
        .then(result => sendResponse({ success: true, ...result }))
        .catch(error => sendResponse({
          success: false,
          error: error?.message || "Full page screenshot failed.",
        }));
      return true;
    }
  });

  window.__tabi_toggle__ = toggleOverlay;
})();
