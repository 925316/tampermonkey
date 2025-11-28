// ==UserScript==
// @name         Microsoft Bing Rewards
// @version      2025-11-28
// @description  自动完成任务
// @author       Bela & Deepseek & Gemini
// @match        https://cn.bing.com/*
// @match        https://www.bing.com/*
// @license      AGPL-3.0
// @icon         https://www.bing.com/favicon.ico
// @run-at       document-end
// @grant        GM_registerMenuCommand
// @grant        GM_addStyle
// @grant        GM_setValue
// @grant        GM_getValue
// ==/UserScript==

(function () {
  "use strict";

  /**
   * ==============================
   * 配置与常量 (Config)
   * ==============================
   */
  const CONFIG = {
    MAX_REWARDS: 175,
    BASE_PAUSE_TIME: 9, //16 * 60 * 1000, // 16分钟
    HOT_WORDS_API: "https://api.gmya.net/Api/",
    KEYWORDS_SOURCES: ["WeiBoHot", "TouTiaoHot", "DouYinHot", "BaiduHot"],
    DEFAULT_WORDS: [
      "盛年不重来，一日难再晨",
      "千里之行，始于足下",
      "少年易学老难成",
      "敏而好学，不耻下问",
      "海内存知已，天涯若比邻",
      "三人行，必有我师焉",
      "天生我材必有用",
      "海纳百川有容乃大",
      "穷则独善其身，达则兼济天下",
      "读书破万卷，下笔如有神",
      "一寸光阴一寸金",
      "近朱者赤，近墨者黑",
      "学无止境",
      "己所不欲，勿施于人",
      "鞠躬尽瘁，死而后已",
      "天下兴亡，匹夫有责",
      "为中华之崛起而读书",
      "人生自古谁无死",
      "生于忧患，死于安乐",
      "言必信，行必果",
      "淡泊以明志，宁静而致远",
      "卧龙跃马终黄土",
    ],
  };

  const CSS = `
        .range-task-status, .range-message-container {
            position: fixed; background: linear-gradient(135deg, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.8) 100%);
            box-shadow: 0 8px 32px rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.15);
            backdrop-filter: blur(12px); color: white; padding: 8px 12px; border-radius: 6px;
            font-size: 12px; z-index: 10000; display: none; transition: opacity 0.3s ease; opacity: 0;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        }
        .range-message-container:empty {
            padding: 0 !important; border: none !important; background: none !important;
            box-shadow: none !important; display: none !important;
        }
        .range-task-status { top: 10px; right: 10px; min-width: 280px; }
        .range-message-container {
            top: 10px; left: 10px; width: 300px; max-height: 400px; overflow-y: auto;
            display: flex; flex-direction: column; gap: 5px;
        }
        .range-task-show { display: block !important; opacity: 1 !important; }
        .range-message-container.range-task-show { display: flex !important; }
        .range-message-item {
            background: rgba(255,255,255,0.1); border-radius: 4px; padding: 8px 10px;
            animation: messageSlideIn 0.3s ease forwards; border-left: 3px solid #4CAF50;
            word-wrap: break-word; line-height: 1.4;
        }
        @keyframes messageSlideIn { from { transform: translateX(-100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
        .range-message-item.fade-out { animation: messageFadeOut 0.3s ease forwards; }
        @keyframes messageFadeOut { to { opacity: 0; transform: translateX(-100%); max-height: 0; margin: 0; padding: 0; } }
        .range-message-header { display: flex; justify-content: space-between; margin-bottom: 4px; font-size: 10px; opacity: 0.8; }
        .range-task-progress { height: 4px; background: rgba(255,255,255,0.2); border-radius: 2px; margin-top: 6px; overflow: hidden; }
        .range-task-progress-bar { height: 100%; background: linear-gradient(90deg, #4CAF50, #45a049); transition: width 0.3s ease; }
        .range-task-icon { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 6px; }
        .range-task-icon-running { background: #4CAF50; } .range-task-icon-paused { background: #FF9800; }
        .range-task-icon-waiting { background: #2196F3; } .range-task-icon-completed { background: #9C27B0; }
        .range-task-detail { margin-top: 8px; font-size: 10px; line-height: 1.4; opacity: 0.8; }
        .range-task-detail-label { display: inline-block; min-width: 80px; color: #ccc; }
        
        .range-task-decision, .range-task-behavior {
            margin-top: 8px; padding-top: 8px; border-top: 1px solid rgba(255,255,255,0.1);
            font-size: 11px; line-height: 1.3;
        }
        .range-task-decision div:first-child, .range-task-behavior div:first-child {
            font-size: 10px; opacity: 0.8; margin-bottom: 4px;
        }
        #rt-decision-text, #rt-behavior-text {
            background: rgba(255,255,255,0.05); padding: 4px 6px; border-radius: 3px; 
            border-left: 2px solid #2196F3; word-wrap: break-word; white-space: pre-wrap !important;
        }
        #rt-behavior-text { border-left-color: #4CAF50; }
        
        .range-message-container::-webkit-scrollbar { width: 4px; }
        .range-message-container::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.3); border-radius: 2px; }
    `;

  /**
   * ==============================
   * 工具类 (Utils)
   * ==============================
   */
  class Utils {
    static sleep(ms) {
      return new Promise((resolve) => setTimeout(resolve, ms));
    }
    static random(min, max) {
      return Math.floor(Math.random() * (max - min + 1)) + min;
    }
    static shuffle(array) {
      return array.sort(() => Math.random() - 0.5);
    }

    static formatTime(ms) {
      if (!ms || ms < 0) return "-";
      const s = Math.floor(ms / 1000),
        m = Math.floor(s / 60),
        h = Math.floor(m / 60);
      return h > 0 ? `${h}h ${m % 60}m` : m > 0 ? `${m}m ${s % 60}s` : `${s}s`;
    }

    static generateString(len = 4) {
      const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
      let result = "";
      for (let i = 0; i < len; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      return result;
    }

    // 搜索词随机变形
    static autoStrTrans(str) {
      let res = "",
        pre = 0;
      if (Math.random() < 0.3) return str;

      for (let i = 0; i < str.length; ) {
        let step = Utils.random(1, 5);
        if (Math.random() < 0.1) {
          res += str.substring(pre, i);
          pre = i;
          if (Math.random() < 0.05) {
            res += " ";
          }
        }
        i += step;
      }
      return pre < str.length ? res + str.substring(pre) : res;
    }

    static getRandomDomain() {
      return Math.random() > 0.5 ? "www.bing.com" : "cn.bing.com";
    }

    // 模拟鼠标移动轨迹
    static generateMouseTrajectory(steps = 10) {
      const points = [];
      let x = Utils.random(100, window.innerWidth - 100);
      let y = Utils.random(100, window.innerHeight - 100);

      for (let i = 0; i < steps; i++) {
        x += (Math.random() - 0.5) * Utils.random(50, 200);
        y += (Math.random() - 0.5) * Utils.random(20, 100);

        x = Math.max(0, Math.min(window.innerWidth, x));
        y = Math.max(0, Math.min(window.innerHeight, y));
        points.push({
          x,
          y,
        });
      }
      return points;
    }
  }

  /**
   * ==============================
   * 数据存储 (Storage)
   * ==============================
   */
  class Storage {
    static get(key, def) {
      return GM_getValue(key, def);
    }
    static set(key, val) {
      GM_setValue(key, val);
    }

    static get State() {
      return {
        startTime: this.get("taskStartTime", Date.now()),
        currTaskStart: this.get("currentTaskStartTime", Date.now()),
        prevDuration: this.get("previousTaskDuration", 0),
        pauseCounter: this.get("pause_counter", 0),
        pauseLimit: this.get("search_count_before_pause", Utils.random(3, 6)),
        words: this.get("search_words", []),
        count: this.get("Cnt", CONFIG.MAX_REWARDS + 10),
        recentDurations: this.get("recentDurations", []),
        avgDuration: this.get("avgDuration", 0),
      };
    }

    static updateState(updates) {
      for (const [k, v] of Object.entries(updates)) {
        if (k === "count") this.set("Cnt", v);
        else if (k === "words") this.set("search_words", v);
        else if (k === "startTime") this.set("taskStartTime", v);
        else if (k === "currTaskStart") this.set("currentTaskStartTime", v);
        else if (k === "prevDuration") this.set("previousTaskDuration", v);
        else if (k === "pauseCounter") this.set("pause_counter", v);
        else if (k === "pauseLimit") this.set("search_count_before_pause", v);
        else if (k === "recentDurations") this.set("recentDurations", v);
        else if (k === "avgDuration") this.set("avgDuration", v);
      }
    }

    static reset() {
      this.set("Cnt", 0);
      this.set("taskStartTime", Date.now());
      this.set("currentTaskStartTime", Date.now());
      this.set("pause_counter", 0);
      this.set("search_words", []);
      this.set("recentDurations", []);
      this.set("avgDuration", 0);
    }

    static stop() {
      this.set("Cnt", CONFIG.MAX_REWARDS + 10);
    }
  }

  /**
   * ==============================
   * 界面管理 (UI) - 增强信息展示
   * ==============================
   */
  class UIManager {
    constructor() {
      this.els = {};
      this.initStyles();
      this.createElements();
    }

    initStyles() {
      if (!document.getElementById("range-task-style")) {
        const style = document.createElement("style");
        style.id = "range-task-style";
        style.textContent = CSS;
        document.head.appendChild(style);
      }
    }

    createElements() {
      if (document.getElementById("range-task-status")) return;

      const status = document.createElement("div");
      status.id = "range-task-status";
      status.className = "range-task-status";
      status.innerHTML = `
                <div><span class="range-task-icon range-task-icon-waiting"></span><span id="rt-status">等待开始</span></div>
                <div class="range-task-timer" id="rt-timer">进度: 0/0</div>
                <div class="range-task-progress"><div class="range-task-progress-bar" id="rt-bar" style="width: 0%"></div></div>
                
                <div class="range-task-detail" id="rt-detail"></div>

                <div class="range-task-decision" id="rt-decision"><div style="font-size: 10px; opacity: 0.8; margin-bottom: 4px;">当前决策</div><div id="rt-decision-text" style="font-size: 11px; line-height: 1.3;">-</div></div>

                <div class="range-task-behavior" id="rt-behavior"><div style="font-size: 10px; opacity: 0.8; margin-bottom: 4px;">当前行为</div><div id="rt-behavior-text" style="font-size: 11px; line-height: 1.3;">-</div></div>
            `;

      const msgContainer = document.createElement("div");
      msgContainer.id = "range-message-container";
      msgContainer.className = "range-message-container";

      document.body.append(status, msgContainer);

      this.els = {
        status,
        msgContainer,
        statusText: status.querySelector("#rt-status"),
        timer: status.querySelector("#rt-timer"),
        bar: status.querySelector("#rt-bar"),
        detail: status.querySelector("#rt-detail"),
        icon: status.querySelector(".range-task-icon"),
      };
    }

    toggle(show) {
      const cls = "range-task-show";
      this.els.status?.classList.toggle(cls, show);
      this.els.msgContainer?.classList.toggle(cls, show);
    }

    setStatus(text, type = "waiting") {
      if (!this.els.statusText) return;
      this.els.statusText.textContent = text;
      this.els.icon.className = `range-task-icon range-task-icon-${type}`;
    }

    setDecision(text) {
      const el = document.getElementById("rt-decision-text");
      if (el) el.textContent = text;
    }

    setBehavior(text) {
      const el = document.getElementById("rt-behavior-text");
      if (el) el.textContent = text;
    }

    setProgress(curr, total) {
      if (!this.els.bar) return;
      const pct = Math.min(100, Math.round((curr / total) * 100));
      this.els.bar.style.width = `${pct}%`;
      this.els.timer.textContent = `进度: ${curr}/${total} (${pct}%)`;
      if (curr <= total)
        document.title = `[${curr}/${total}] ${document.title.replace(
          /^\[\d+\/\d+\]\s*/,
          ""
        )}`;
    }

    updateDetails(info) {
      if (!this.els.detail) return;
      const labels = {
        startTime: "开始时间",
        endTime: "预计结束",
        currentWord: "当前搜索",
        nextWord: "下一个",
        currentDuration: "当前耗时",
        previousDuration: "上个耗时",
        totalDuration: "累计耗时",
        wordsCount: "当前词库",
        nextPause: "下次暂停",
        pauseTimer: "暂停倒计时",
      };
      this.els.detail.innerHTML = Object.entries(info)
        .map(([k, v]) =>
          v
            ? `<div><span class="range-task-detail-label">${labels[k]}:</span> ${v}</div>`
            : ""
        )
        .join("");
    }

    addMessage(text, duration = 5000) {
      if (!this.els.msgContainer) return;

      const item = document.createElement("div");
      item.className = "range-message-item";
      item.innerHTML = `
                <div class="range-message-header"><span style="color:#ccc">${new Date().toLocaleTimeString(
                  "zh-CN",
                  { hour12: false }
                )}</span></div>
                <div style="font-size:11px">${text}</div>
            `;
      this.els.msgContainer.prepend(item);

      if (this.els.msgContainer.children.length > 8) {
        this.els.msgContainer.lastElementChild.remove();
      }

      setTimeout(() => {
        item.classList.add("fade-out");
        setTimeout(() => item.remove(), 300);
      }, duration);
    }
  }

  /**
   * ==============================
   * 增强行为模拟类 (Enhanced Behavior Simulation)
   * ==============================
   */
  class BehaviorSimulator {
    /**
     * 增强滚动行为 - 多种滚动策略
     */
    static async enhancedScrollBehavior(ui) {
      const strategies = {
        smoothScrollToBottom: this.smoothScrollToBottom,
        instantScrollToBottom: this.instantScrollToBottom,
        randomPositionJump: this.randomPositionJump,
        stepwiseScrolling: this.stepwiseScrolling,
        oscillatingScroll: this.oscillatingScroll,
        readingPatternScroll: this.readingPatternScroll,
      };

      const strategyName = this.getCurrentStrategy();
      const strategyFunc = strategies[strategyName];
      const behaviorDesc = this.getBehaviorDescription(strategyName);

      ui.setBehavior(`🖱️ ${behaviorDesc}`);

      await strategyFunc.call(this);
    }

    /** 策略1: 平滑滚动到底部 */
    static async smoothScrollToBottom() {
      window.scrollTo({
        top: document.body.scrollHeight,
        behavior: "smooth",
      });
      await Utils.sleep(Utils.random(1500, 4000));
    }

    /** 策略2: 直接跳转到底部（无平滑效果） */
    static async instantScrollToBottom() {
      window.scrollTo(0, document.body.scrollHeight);
      await Utils.sleep(Utils.random(800, 2000));
    }

    /** 策略3: 随机位置跳转 */
    static async randomPositionJump() {
      const randomPos = Math.random() * document.body.scrollHeight;
      window.scrollTo({
        top: randomPos,
        behavior: "smooth",
      });
      await Utils.sleep(Utils.random(1000, 3000));
    }

    /** 策略4: 逐步滚动（模拟阅读模式） */
    static async stepwiseScrolling() {
      const viewportHeight = window.innerHeight;
      const totalHeight = document.body.scrollHeight;
      const steps = Utils.random(3, 8);

      for (let i = 0; i < steps; i++) {
        const direction = Math.random() < 0.8 ? 1 : -1;
        const scrollDistance =
          viewportHeight * (Math.random() * 0.3 + 0.7) * direction;
        const currentScroll = window.scrollY;
        const targetScroll = Math.max(
          0,
          Math.min(totalHeight - viewportHeight, currentScroll + scrollDistance)
        );

        window.scrollTo({
          top: targetScroll,
          behavior: "smooth",
        });
        await Utils.sleep(Utils.random(1500, 3000));
      }
    }

    /** 策略5: 振荡滚动（上下浏览） */
    static async oscillatingScroll() {
      const oscillations = Utils.random(2, 5);
      for (let i = 0; i < oscillations; i++) {
        const downDistance = window.innerHeight * Utils.random(0.3, 0.7);
        window.scrollBy({
          top: downDistance,
          behavior: "smooth",
        });
        await Utils.sleep(Utils.random(1000, 2500));

        const upDistance = window.innerHeight * Utils.random(0.1, 0.4);
        window.scrollBy({
          top: -upDistance,
          behavior: "smooth",
        });
        await Utils.sleep(Utils.random(800, 2000));
      }
    }

    /** 策略6: 阅读模式滚动（快速滚动+慢速阅读） */
    static async readingPatternScroll() {
      const sections = Utils.random(2, 4);
      for (let i = 0; i < sections; i++) {
        const scrollPos = Math.random() * document.body.scrollHeight * 0.8;
        window.scrollTo({
          top: scrollPos,
          behavior: "smooth",
        });
        await Utils.sleep(Utils.random(2000, 5000));

        const smallScrolls = Utils.random(1, 3);
        for (let j = 0; j < smallScrolls; j++) {
          window.scrollBy({
            top: window.innerHeight * Utils.random(0.1, 0.3),
            behavior: "smooth",
          });
          await Utils.sleep(Utils.random(1000, 3000));
        }
      }
    }

    static getBehaviorDescription(strategyName) {
      const descriptions = {
        smoothScrollToBottom: "平滑滚动到底部 - 模拟自然浏览",
        instantScrollToBottom: "快速跳转到底部 - 模拟快速浏览",
        randomPositionJump: "随机位置跳转 - 模拟查找内容",
        stepwiseScrolling: "逐步滚动 - 模拟深度阅读",
        oscillatingScroll: "上下振荡滚动 - 模拟对比查看",
        readingPatternScroll: "阅读模式滚动 - 模拟分段阅读",
      };
      return descriptions[strategyName] || "未知行为模式";
    }

    static getCurrentStrategy() {
      const strategies = [
        "smoothScrollToBottom",
        "instantScrollToBottom",
        "randomPositionJump",
        "stepwiseScrolling",
        "oscillatingScroll",
        "readingPatternScroll",
      ];
      return strategies[Utils.random(0, strategies.length - 1)];
    }

    // 模拟异常但自然的行为
    static async simulateAbnormalBehavior() {
      const abnormalBehaviors = [
        // 快速回滚
        async () => {
          const currentScroll = window.scrollY;
          const rollbackDistance = window.innerHeight * Utils.random(0.5, 1.5);
          window.scrollTo({
            top: Math.max(0, currentScroll - rollbackDistance),
            behavior: "auto",
          });
          await Utils.sleep(Utils.random(500, 1500));
        },
        // 重复滚动同一区域
        async () => {
          const scrollDistance = window.innerHeight * 0.3;
          for (let i = 0; i < 2; i++) {
            window.scrollBy({
              top: scrollDistance,
              behavior: "smooth",
            });
            await Utils.sleep(800);
            window.scrollBy({
              top: -scrollDistance,
              behavior: "smooth",
            });
            await Utils.sleep(800);
          }
        },
        // 随机跳转
        async () => {
          const randomPositions = [
            0,
            document.body.scrollHeight * 0.3,
            document.body.scrollHeight * 0.7,
            document.body.scrollHeight,
          ];
          const targetPos =
            randomPositions[Utils.random(0, randomPositions.length - 1)];
          window.scrollTo({
            top: targetPos,
            behavior: "smooth",
          });
          await Utils.sleep(Utils.random(1000, 3000));
        },
      ];

      const behavior =
        abnormalBehaviors[Utils.random(0, abnormalBehaviors.length - 1)];
      await behavior();
    }

    // 模拟鼠标移动（视觉增强）
    static async simulateMouseMovement() {
      if (Math.random() < 0.3) {
        const trajectory = Utils.generateMouseTrajectory(Utils.random(5, 15));

        for (const point of trajectory) {
          const mouseMoveEvent = new MouseEvent("mousemove", {
            clientX: point.x,
            clientY: point.y,
            bubbles: true,
            screenX: point.x,
            screenY: point.y,
          });
          (
            document.elementFromPoint(point.x, point.y) || document.body
          )?.dispatchEvent(mouseMoveEvent);
          await Utils.sleep(Utils.random(50, 150));
        }
      }
    }

    // 增强的用户行为模拟
    static async enhancedUserBehavior(ui) {
      const totalStayTime = Utils.random(15000, 45000);
      let elapsedTime = 0;

      const behaviors = ["scroll", "pause", "microScroll", "randomAction"];

      // 在主要循环开始前设置一个初始行为模式，避免 UI 为空
      ui.setBehavior("⌛ 准备开始模拟...");

      while (elapsedTime < totalStayTime) {
        const behavior = behaviors[Utils.random(0, behaviors.length - 1)];
        let actionTime = 0;

        if (Math.random() < 0.5) {
          await this.simulateMouseMovement();
        }

        switch (behavior) {
          case "scroll":
            // 滚动时调用增强策略，并让它负责更新 UI 的行为描述
            await this.enhancedScrollBehavior(ui);
            actionTime = Utils.random(3000, 8000);
            break;

          case "pause":
            const pauseTime = Utils.random(2000, 6000);
            ui.setBehavior(`⏸️ 模拟阅读停顿 (${Utils.formatTime(pauseTime)})`);
            await Utils.sleep(pauseTime);
            actionTime = pauseTime;
            break;

          case "microScroll":
            window.scrollBy({
              top: window.innerHeight * Utils.random(-0.2, 0.2),
              behavior: "smooth",
            });
            ui.setBehavior("🤏 小幅微调滚动");
            await Utils.sleep(Utils.random(1000, 3000));
            actionTime = Utils.random(1500, 4000);
            break;

          case "randomAction":
            if (Math.random() < 0.1) {
              ui.setBehavior("⚠️ 模拟异常/自然行为: 快速回滚");
              await this.simulateAbnormalBehavior();
            } else {
              ui.setBehavior("🧠 思考中/无操作");
            }
            actionTime = Utils.random(1000, 3000);
            break;
        }

        elapsedTime += actionTime;
        if (elapsedTime >= totalStayTime) break;
      }
    }
  }

  /**
   * ==============================
   * 核心逻辑 (Core)
   * ==============================
   */
  class RewardsBot {
    constructor() {
      this.ui = new UIManager();
      this.scrollTimer = null;
      this.monitorInterval = null;

      this.runtimeCache = {
        nextWord: "-",
        currentWord: "-",
        pauseEndTime: 0,
      };
    }

    async init() {
      const count = Storage.State.count;
      if (count > CONFIG.MAX_REWARDS) return;

      this.ui.toggle(true);
      this.ui.setStatus("初始化中...", "waiting");

      this.startMonitor();

      await this.runLoop();
    }

    // 实时UI刷新器
    startMonitor() {
      if (this.monitorInterval) {
        clearInterval(this.monitorInterval);
        this.monitorInterval = null;
      }
      if (this.scrollTimer) {
        clearTimeout(this.scrollTimer);
        this.scrollTimer = null;
      }

      this.monitorInterval = setInterval(() => {
        const state = Storage.State;
        if (state.count > CONFIG.MAX_REWARDS) {
          clearInterval(this.monitorInterval);
          return;
        }

        const now = Date.now();
        const totalTime = now - state.startTime;
        const predictedTime = this.calculateTimePrediction();
        // 如果预测时间大于0，则使用预测时间，否则使用简单平均时间
        const estEnd =
          predictedTime > 0
            ? now + predictedTime
            : state.startTime +
              (totalTime / Math.max(state.count, 1)) * CONFIG.MAX_REWARDS;

        let pauseInfo = null;
        if (this.runtimeCache.pauseEndTime > now) {
          pauseInfo = Utils.formatTime(this.runtimeCache.pauseEndTime - now);
        }

        this.ui.updateDetails({
          startTime: new Date(state.startTime).toLocaleTimeString("zh-CN", {
            hour12: false,
          }),
          endTime: new Date(estEnd).toLocaleTimeString("zh-CN", {
            hour12: false,
          }),
          currentDuration: Utils.formatTime(now - state.currTaskStart),
          previousDuration: Utils.formatTime(state.prevDuration),
          totalDuration: Utils.formatTime(totalTime),
          wordsCount: state.words.length,
          nextPause:
            state.pauseCounter >= state.pauseLimit - 1
              ? "即将暂停"
              : `${state.pauseLimit - state.pauseCounter - 1}次后`,
          pauseTimer: pauseInfo,
          currentWord: this.runtimeCache.currentWord,
          nextWord: this.runtimeCache.nextWord,
        });

        this.updateDecisionInfo();
      }, 1000);
    }

    async fetchWords() {
      this.ui.setStatus("获取词库...", "waiting");
      this.ui.addMessage("正在从网络获取热门搜索词...");

      if (
        location.href.includes("bing.com") &&
        !location.href.includes("search")
      ) {
        this.startRandomScroll();
      }

      for (const source of Utils.shuffle([...CONFIG.KEYWORDS_SOURCES])) {
        try {
          this.ui.addMessage(`尝试从 ${source} 获取...`, 2000);
          const res = await fetch(`${CONFIG.HOT_WORDS_API}${source}`);
          const json = await res.json();
          if (json.data && json.data.length) {
            const words = Utils.shuffle(json.data.map((i) => i.title));
            Storage.updateState({
              words,
            });
            this.stopScroll();
            return words;
          }
        } catch (e) {
          console.error(e);
        }
      }

      this.ui.addMessage("网络获取失败，使用默认词库");
      const defaults = Utils.shuffle(CONFIG.DEFAULT_WORDS);
      Storage.updateState({
        words: defaults,
      });
      this.stopScroll();
      return defaults;
    }

    calculateTimePrediction() {
      const state = Storage.State;
      const remaining = CONFIG.MAX_REWARDS - state.count;

      if (state.recentDurations.length === 0) {
        return state.avgDuration > 0 ? state.avgDuration * remaining : 0;
      }

      // 使用加权平均：最近的任务权重更高
      let totalWeight = 0;
      let weightedSum = 0;

      state.recentDurations.forEach((duration, index) => {
        const weight = Math.pow(0.8, state.recentDurations.length - 1 - index);
        weightedSum += duration * weight;
        totalWeight += weight;
      });

      const predictedDurationPerTask = weightedSum / totalWeight;
      // 预测时间以毫秒计
      return predictedDurationPerTask * remaining;
    }

    // 更新历史记录（保持最近10个记录）
    updateDurationHistory(duration) {
      const state = Storage.State;
      const recentDurations = [...state.recentDurations];

      if (recentDurations.length >= 10) {
        recentDurations.shift();
      }
      recentDurations.push(duration);

      const avgDuration =
        recentDurations.reduce((sum, d) => sum + d, 0) / recentDurations.length;

      Storage.updateState({
        recentDurations,
        avgDuration,
      });
    }

    // 仅用于首页的随机滚动
    startRandomScroll() {
      const scroll = () => {
        window.scrollTo({
          top: Math.random() * document.body.scrollHeight,
          behavior: "smooth",
        });
        this.scrollTimer = setTimeout(scroll, Utils.random(2000, 4000));
      };
      scroll();
    }

    stopScroll() {
      clearTimeout(this.scrollTimer);
    }

    /**
     * 替代旧的模拟方法，调用增强的行为模拟器
     */
    async simulateUserBehavior() {
      this.ui.addMessage(`启动行为模拟...`, 3000);
      await BehaviorSimulator.enhancedUserBehavior(this.ui);
    }

    async runLoop() {
      let state = Storage.State;

      if (state.count > CONFIG.MAX_REWARDS) {
        this.ui.setStatus("任务已完成", "completed");
        this.ui.setProgress(CONFIG.MAX_REWARDS, CONFIG.MAX_REWARDS);
        this.ui.addMessage("所有任务已完成！", 5000);
        this.ui.setDecision("✅ 所有任务已完成");
        this.ui.setBehavior("🎉 任务结束");
        setTimeout(() => this.ui.toggle(false), 5000);
        Storage.set("search_words", null);
        return;
      }

      this.ui.setStatus("搜索进行中", "running");
      Storage.updateState({
        currTaskStart: Date.now(),
      });

      let words = Storage.State.words;
      if (!words || words.length === 0 || state.count >= words.length) {
        this.ui.addMessage("词库已用完，重新获取新词库...");
        words = await this.fetchWords();
      }

      if (!words || !words.length) {
        this.ui.addMessage("词库为空，刷新重试...");
        await Utils.sleep(2000);
        location.reload();
        return;
      }

      const wordIdx = state.count % words.length;
      const rawWord = words[wordIdx];
      const searchWord = Utils.autoStrTrans(rawWord);

      this.runtimeCache.currentWord =
        (rawWord || "").substring(0, 15) +
        (rawWord && rawWord.length > 15 ? "..." : "");
      this.runtimeCache.nextWord =
        (words[(wordIdx + 1) % words.length] || "").substring(0, 15) +
        (words[(wordIdx + 1) % words.length] &&
        words[(wordIdx + 1) % words.length].length > 15
          ? "..."
          : "");

      this.ui.setProgress(state.count, CONFIG.MAX_REWARDS);
      this.ui.addMessage(`第 ${state.count} 次搜索 - 浏览中...`);
      this.updateDecisionInfo(); // 立即更新决策信息

      // 模拟用户行为
      await this.simulateUserBehavior();

      // 随机跳过
      if (Math.random() < 0.1) {
        const skip = Utils.random(1, 3);
        Storage.updateState({
          count: state.count + skip,
        });
        this.ui.addMessage(
          `跳过 ${skip} 个词，当前计数: ${state.count + skip}`
        );
      }

      state = Storage.State;
      Storage.updateState({
        pauseCounter: state.pauseCounter + 1,
      });

      // 长暂停逻辑
      if (state.pauseCounter >= state.pauseLimit) {
        await this.handleLongPause();
        Storage.updateState({
          pauseCounter: 0,
          pauseLimit: Utils.random(3, 6),
        });
      } else {
        // 普通间隔
        const delay = Utils.random(20000, 90000);
        this.ui.addMessage(`等待 ${Math.round(delay / 1000)}秒 后继续...`);
        await Utils.sleep(delay);

        if (Math.random() < 0.05) await this.extraPause();
      }

      // 在跳转前计算并记录本次任务耗时，确保记录准确且不重复
      const taskDuration = Date.now() - state.currTaskStart;
      this.updateDurationHistory(taskDuration); // 更新历史记录

      this.performSearch(searchWord);
    }

    updateDecisionInfo() {
      const state = Storage.State;
      const predictedTime = this.calculateTimePrediction();

      const decisions = [];

      if (state.pauseCounter >= state.pauseLimit - 1) {
        decisions.push(`💤 下次搜索后将暂停`);
      }

      if (state.recentDurations.length > 0) {
        const avgTime = state.avgDuration / 1000;
        decisions.push(`📊 平均耗时: ${avgTime.toFixed(1)}秒`);
      }

      if (predictedTime > 0) {
        decisions.push(`⏱️ 预计剩余: ${Utils.formatTime(predictedTime)}`);
      }

      decisions.push(`⏸️ 随机阈值: ${state.pauseCounter}/${state.pauseLimit}`);

      this.ui.setDecision(decisions.join("\n"));
    }

    async handleLongPause() {
      const pauseTime = CONFIG.BASE_PAUSE_TIME + Utils.random(-300000, 300000);
      this.runtimeCache.pauseEndTime = Date.now() + pauseTime;

      this.ui.setStatus("暂停休息中", "paused");
      this.ui.addMessage(
        `触发长暂停，休息 ${Math.round(pauseTime / 60000)} 分钟`
      );

      await Utils.sleep(pauseTime);

      this.runtimeCache.pauseEndTime = 0;
      if (Math.random() < 0.05) await this.extraPause();
    }

    async extraPause() {
      const extra = Utils.random(30000, 150000);
      this.ui.addMessage(`随机额外暂停 ${Math.round(extra / 1000)} 秒`, 7000);
      await Utils.sleep(extra);
    }

    performSearch(text) {
      this.ui.addMessage(`开始搜索: ${text.substring(0, 15)}...`, 2000);
      const domain = Utils.getRandomDomain();
      const form = Utils.generateString(4);
      const cvid = Utils.generateString(32);
      // 使用增强的随机参数进行跳转
      location.href = `https://${domain}/search?q=${encodeURIComponent(
        text
      )}&form=${form}&cvid=${cvid}`;
    }
  }

  /**
   * ==============================
   * 入口点 (Main)
   * ==============================
   */
  const bot = new RewardsBot();

  GM_registerMenuCommand("▶ 开始任务", () => {
    Storage.reset();
    bot.ui.toggle(true);
    bot.ui.addMessage("任务已手动启动...");
    location.href = "https://www.bing.com/";
  });

  GM_registerMenuCommand("⏹ 停止任务", () => {
    Storage.stop();
    bot.stopScroll();
    if (bot.monitorInterval) {
      clearInterval(bot.monitorInterval);
      bot.monitorInterval = null;
    }
    bot.ui.setStatus("已手动停止", "completed");
    bot.ui.setProgress(Storage.State.count, CONFIG.MAX_REWARDS);
    bot.ui.setDecision("🛑 任务已手动停止");
    bot.ui.setBehavior("⏹️ 已停止");
    bot.ui.addMessage("任务已手动停止");
    setTimeout(() => bot.ui.toggle(false), 5000);
  });

  bot.init();
})();
