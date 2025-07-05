// ==UserScript==
// @name         Douyin Tools - Quick Profile & Smart Block
// @namespace    http://tampermonkey.net/
// @version      2.4
// @description  Q keyboard opens author profile + Auto block author and close page (with auto_block parameter)|Q键盘打开当前推荐视频作者主页 + 支持自动拉黑作者并关闭页面（带auto_block参数）|关键词:抖音拉黑，推荐页面一键拉黑
// @author       Bela Proinsias
// @match        *://www.douyin.com/*
// @icon         https://www.douyin.com/favicon.ico
// @grant        GM_openInTab
// @license      GPLv3
// @downloadURL https://update.greasyfork.org/scripts/537297/Douyin%20Tools%20-%20Quick%20Profile%20%20Smart%20Block.user.js
// @updateURL https://update.greasyfork.org/scripts/537297/Douyin%20Tools%20-%20Quick%20Profile%20%20Smart%20Block.meta.js
// ==/UserScript==

(function () {
    'use strict';

    // ---------- Handle Q key press to open author profile ----------
    let current_video = null;
    const intersection_observer = new IntersectionObserver(entries => {
        entries.forEach(entry => {
            if (entry.isIntersecting) current_video = entry.target;
        });
    }, { threshold: 0.5 });

    new MutationObserver(mutations => {
        mutations.forEach(m => m.addedNodes.forEach(node => {
            if (node.nodeType === 1 && node.matches('[data-e2e*="feed"]')) {
                intersection_observer.observe(node);
            }
        }));
    }).observe(document.body, { childList: true, subtree: true });

    document.addEventListener('keydown', e => {
        if (e.key.toLowerCase() === 'q' && !e.ctrlKey && !e.altKey && !e.metaKey) {
            const profile_link = current_video?.querySelector('a[href*="/user/"]')?.href.match(/user\/([\w-]+)/)?.[1];
            if (profile_link) {
                GM_openInTab(`https://www.douyin.com/user/${profile_link}?auto_block=true`, { active: false });
            }
        }
    });

    // ---------- Auto-block functionality based on URL's auto_block parameter ----------
    if (location.href.includes('/user/') && new URLSearchParams(location.search).get('auto_block')) {
        window.addEventListener('load', () => setTimeout(run_auto_block, 1200));
    }

    // Simulate mouse click with hover sequence
    async function click_element(element, delay = 200) {
        const { left, top, width, height } = element.getBoundingClientRect();
        const create_event = type => new MouseEvent(type, {
            bubbles: true,
            cancelable: true,
            clientX: left + width / 2,
            clientY: top + height / 2
        });
        ['mouseover', 'mousedown', 'click', 'mouseup'].forEach(type => element.dispatchEvent(create_event(type)));
        await new Promise(r => setTimeout(r, delay));
    }

    // Main auto-block sequence
    async function run_auto_block() {
        try {
            const menu_button = document.querySelector('#tooltip button');
            if (!menu_button) return finish_and_close();

            await click_element(menu_button);
            await new Promise(r => setTimeout(r, 800));

            const block_button = [...document.querySelectorAll('.semi-dropdown-item')]
                .find(e => e.textContent.includes('拉黑'));
            if (!block_button) return finish_and_close();

            await click_element(block_button);
            await new Promise(r => setTimeout(r, 500));

            const confirm_button = [...document.querySelectorAll('button.semi-button-primary')]
                .find(e => e.textContent.includes('确认拉黑'));
            if (confirm_button) await click_element(confirm_button, 300);

            finish_and_close();
        } catch (e) {
            finish_and_close();
        }
    }

    // Close current tab after completion
    function finish_and_close() {
        window.open('about:blank', '_self');
        window.close();
    }
})();