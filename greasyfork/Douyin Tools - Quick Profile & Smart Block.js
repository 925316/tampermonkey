// ==UserScript==
// @name         Douyin Tools - Quick Profile & Smart Block
// @namespace    http://tampermonkey.net/
// @version      2.7
// @description  Q keyboard opens author profile + Auto block author and close page (with auto_block parameter)|Q键盘打开当前推荐视频作者主页 + 支持自动拉黑作者并关闭页面（带auto_block参数）|关键词:抖音拉黑，推荐页面一键拉黑
// @author       Bela Proinsias
// @match        *://www.douyin.com/*
// @icon         https://www.douyin.com/favicon.ico
// @grant        GM_openInTab
// @grant        GM_notification
// @license      GPLv3
// @downloadURL  https://update.greasyfork.org/scripts/537297/Douyin%20Tools%20-%20Quick%20Profile%20%20Smart%20Block.user.js
// @updateURL    https://update.greasyfork.org/scripts/537297/Douyin%20Tools%20-%20Quick%20Profile%20%20Smart%20Block.meta.js
// ==/UserScript==

(function () {
  "use strict";

  const BLOCK_TIMEOUT = 15000;
  const BASE_DELAY = 1000;
  const MIN_DELAY = 200;
  const WAIT_TIMEOUT = 8000;
  const CLICK_DELAY = 200;
  const CONFIRM_DELAY = 600;

  let g_taskQueue = [];
  let g_isProcessing = false;
  let g_statusDiv = null;
  let g_messageDiv = null;
  let g_messageTimer = null;

  let g_statusUserIdSpan = null;
  let g_statusCountSpan = null;

  if (!document.getElementById("block-task-style")) {
    const style = document.createElement("style");
    style.id = "block-task-style";
    style.textContent = `
            .block-task-status, .block-task-message {
                position: fixed;
                top: 10px;
                background: rgba(0,0,0,0.8);
                color: white;
                padding: 8px 12px;
                border-radius: 6px;
                font-size: 12px;
                z-index: 10000;
                backdrop-filter: blur(10px);
                border: 1px solid rgba(255,255,255,0.1);
                display: none;
                opacity: 0;
                transition: opacity 0.3s ease;
            }
            .block-task-status {
                left: 10px;
                width: 200px;
                cursor: pointer;
            }
            .block-task-status.block-task-show, .block-task-message.block-task-show {
                display: flex !important;
                opacity: 1 !important;
            }
            .block-task-status {
                align-items: center;
                gap: 4px;
            }
            .block-task-userid {
                flex: 1 1 auto;
                min-width: 0;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
            }
            .block-task-count {
                flex-shrink: 0;
                white-space: nowrap;
            }
            .block-task-message {
                left: 220px;
                width: 200px;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }
        `;
    document.head.appendChild(style);
  }

  function createFloatingDiv(className, clickHandler) {
    const div = document.createElement("div");
    div.className = className;
    if (clickHandler) div.addEventListener("click", clickHandler);
    document.body.appendChild(div);
    return div;
  }

  function initUI() {
    if (!g_statusDiv) {
      g_statusDiv = createFloatingDiv("block-task-status", () => {
        if (g_taskQueue.length) {
          const url = `https://www.douyin.com/user/${g_taskQueue[0].user_id}`;
          navigator.clipboard
            .writeText(url)
            .then(() => showMessage("Copy Success"))
            .catch(() => showMessage("Copy Failed"));
        }
      });
      g_statusUserIdSpan = document.createElement("span");
      g_statusUserIdSpan.className = "block-task-userid";
      g_statusCountSpan = document.createElement("span");
      g_statusCountSpan.className = "block-task-count";
      g_statusDiv.appendChild(g_statusUserIdSpan);
      g_statusDiv.appendChild(g_statusCountSpan);
    }
    if (!g_messageDiv) {
      g_messageDiv = createFloatingDiv("block-task-message");
    }
  }

  function updateStatus() {
    if (!g_statusDiv) initUI();
    if (g_taskQueue.length === 0) {
      g_statusDiv.classList.remove("block-task-show");
      return;
    }
    const current = g_taskQueue[0];
    g_statusUserIdSpan.textContent = current.user_id;
    g_statusUserIdSpan.title = current.user_id;
    g_statusCountSpan.textContent =
      g_taskQueue.length > 1 ? ` (+${g_taskQueue.length - 1})` : "";
    g_statusDiv.classList.add("block-task-show");
  }

  function showMessage(text, duration = 2000) {
    if (!g_messageDiv) initUI();
    g_messageDiv.textContent = text;
    g_messageDiv.classList.add("block-task-show");
    if (g_messageTimer) clearTimeout(g_messageTimer);
    g_messageTimer = setTimeout(() => {
      g_messageDiv.classList.remove("block-task-show");
    }, duration);
  }

  function addToQueue(userId) {
    if (g_taskQueue.some((t) => t.user_id === userId)) {
      showMessage(`User ${userId} already in queue`);
      return false;
    }
    g_taskQueue.push({ user_id: userId, timestamp: Date.now() });
    updateStatus();
    showMessage(
      `Added block task: ${userId}, ${g_taskQueue.length} tasks in queue`,
    );
    if (!g_isProcessing) processQueue();
    return true;
  }

  function getNextDelay() {
    return Math.max(MIN_DELAY, BASE_DELAY - g_taskQueue.length * 100);
  }

  async function processQueue() {
    if (g_isProcessing || g_taskQueue.length === 0) return;
    g_isProcessing = true;

    while (g_taskQueue.length) {
      const task = g_taskQueue[0];
      updateStatus();
      try {
        await executeBlockTask(task);
      } catch (err) {
        console.error("Block task failed:", err);
        showMessage(`Task failed: ${task.user_id}`, 3000);
      }
      g_taskQueue.shift();
      updateStatus();
      if (g_taskQueue.length) {
        await new Promise((r) => setTimeout(r, getNextDelay()));
      }
    }
    g_isProcessing = false;
    showMessage("All block tasks completed");
  }

  function executeBlockTask(task) {
    return new Promise((resolve, reject) => {
      const tab = GM_openInTab(
        `https://www.douyin.com/user/${task.user_id}?auto_block=true`,
        { active: false, insert: true, setParent: true },
      );

      let resolved = false;
      const cleanup = () => {
        resolved = true;
        clearTimeout(timeout);
      };

      try {
        if (tab.contentWindow) {
          tab.contentWindow.addEventListener("beforeunload", () => {
            if (!resolved) {
              cleanup();
              resolve();
            }
          });
        }
      } catch (e) {}

      const interval = setInterval(() => {
        if (resolved) return;
        if (tab.closed) {
          clearInterval(interval);
          cleanup();
          resolve();
        }
      }, 300);

      const timeout = setTimeout(() => {
        if (!resolved && !tab.closed) {
          clearInterval(interval);
          tab.close();
          reject(new Error("Task timeout"));
        }
      }, BLOCK_TIMEOUT);
    });
  }

  let currentVideo = null;
  const intersectionObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) currentVideo = e.target;
      });
    },
    { threshold: 0.5 },
  );

  new MutationObserver((mutations) => {
    mutations.forEach((m) => {
      m.addedNodes.forEach((node) => {
        if (node.nodeType === 1 && node.matches('[data-e2e*="feed"]')) {
          intersectionObserver.observe(node);
        }
      });
    });
  }).observe(document.body, { childList: true, subtree: true });

  document.addEventListener("keydown", (e) => {
    if (e.key.toLowerCase() === "q" && !e.ctrlKey && !e.altKey && !e.metaKey) {
      const userId = currentVideo
        ?.querySelector('a[href*="/user/"]')
        ?.href.match(/user\/([\w-]+)/)?.[1];
      if (userId) addToQueue(userId);
    }
  });

  if (
    location.pathname.includes("/user/") &&
    new URLSearchParams(location.search).get("auto_block")
  ) {
    window.addEventListener("load", () => setTimeout(runAutoBlock, 1200));
  }

  async function clickElement(el, delay = CLICK_DELAY) {
    if (!el) return;
    el.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
    const rect = el.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    ["mouseover", "mousedown", "click", "mouseup"].forEach((type) => {
      el.dispatchEvent(
        new MouseEvent(type, {
          bubbles: true,
          cancelable: true,
          clientX: x,
          clientY: y,
        }),
      );
    });
    await new Promise((r) => setTimeout(r, delay));
  }

  function waitForElement(selector, timeout = WAIT_TIMEOUT) {
    const start = Date.now();
    return new Promise((resolve, reject) => {
      const check = () => {
        const el = document.querySelector(selector);
        if (el) return resolve(el);
        if (Date.now() - start >= timeout) {
          reject(new Error(`Element ${selector} timeout`));
        } else {
          setTimeout(check, 200);
        }
      };
      check();
    });
  }

  async function runAutoBlock() {
    try {
      const menuBtn = await waitForElement("#tooltip button", 8000);
      await clickElement(menuBtn);

      await waitForElement('.semi-dropdown-item, [role="menuitem"]', 4000);

      const blockBtn = Array.from(
        document.querySelectorAll(
          '.semi-dropdown-item, [role="menuitem"], [class*="dropdown-item"]',
        ),
      ).find((el) => el.textContent.includes("拉黑"));

      if (!blockBtn) {
        return finishAndClose();
      }

      await clickElement(blockBtn);
      await new Promise((r) => setTimeout(r, CONFIRM_DELAY));

      const confirmBtn = Array.from(document.querySelectorAll("button")).find(
        (el) => el.textContent.includes("确认拉黑"),
      );

      if (confirmBtn) {
        await clickElement(confirmBtn);
        await new Promise((r) => setTimeout(r, 500));
      }

      finishAndClose();
    } catch {
      finishAndClose();
    }
  }

  function finishAndClose() {
    window.open("about:blank", "_self");
    window.close();
  }

  initUI();
})();
