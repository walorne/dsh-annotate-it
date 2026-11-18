/**
 * Annotate it — annotate chats and documents for the Harness Web UI.
 *
 * Forked from `dsh-quote-reply` v1.0.2 (MIT, github.com/gf691271/dsh-quote-reply)
 * and adapted to the review workflow: a selection opens a quick-action bar
 * (yes / no / prove it / what else / think it over / custom reply / quote),
 * every action becomes one compact quote+reply block above the composer, and
 * Enter sends the collected review as ONE message.
 *
 * Flow:
 *   1. Select text inside the transcript -> the quick-action bar appears.
 *   2. Click a preset -> the quote+preset-reply pair becomes one block above the
 *      composer. Repeat for as many passages as needed.
 *   3. Enter in the composer (or Send) turns all blocks into one message:
 *      quote lines followed by the chosen reply for each passage.
 *
 * Sections, in order:
 *   1. Copy            — dictionaries + the host-bound translator (ctx.locale)
 *   2. Selection       — rect geometry, text normalisation, readSelection()
 *   3. Host coupling   — send-button detection + the quote-bar composer
 *   4. Manager         — the whole state machine (selection, popover, blocks,
 *                        per-session queues, send)
 *   5. React glue      — useSnapshot over the manager
 *   6. Styles          — one static stylesheet, host theme tokens only
 *   7. Components      — quick bar, popover, tile, strip, transcript renderer
 *   8. apply()         — slot registrations and the locale wiring
 *
 * Why one file: a plain Client plugin is loaded through
 * `window.__ModuleLoader__.load({ factory(require) })`, where `require` resolves
 * only declared external modules (React here) — relative imports do not exist
 * at runtime. Splitting this into modules would need a bundler step, which buys
 * nothing for a plugin DSH installs straight from a directory or a git URL.
 * Keep the sections in this order and the file stays navigable.
 */
window.__ModuleLoader__.load({
  id: 'dsh-annotate-it',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const FRAG = React.Fragment;

    const POPOVER_WIDTH = 392;

    const I18N = {
      zh: {
        quote: '引用',
        placeholder: '对此段落写下批注…',
        add: '加入',
        send: '发送',
        sending: '发送中…',
        sendFailed: '未发送成功，已退回',
        sendFileBlocked: '文件附件无法随引用发送，请先移除',
        showMore: '显示更多（还有 {count} 组）',
        save: '保存',
        hintAdd: 'Enter 加入 · Shift+Enter 换行 · Esc 取消',
        hintSave: 'Enter 添加 · Shift+Enter 换行 · Esc 取消',
        edit: '编辑',
        remove: '删除',
        comments: '批注',
        addComment: '添加批注',
        commentPlaceholder: '再写一条批注…',
        deleteNote: '删除批注',
        close: '关闭',
        pending: '未发送',
        emptyComments: '还没有批注',
        addAction: '添加动作',
        actionLabel: '按钮文字',
        actionPhrase: '插入的短语',
        cancel: '取消',
        deleteActionConfirm: '删除这个动作？',
        yes: '是',
        no: '否',
        clearField: '清空输入框',
        dictate: '语音输入',
        dictateUnavailable: '此客户端不支持语音输入 — 请使用系统听写',
        documentHeading: '文档：{path}',
        enterReview: '批注',
        exitReview: '退出批注',
        clearAll: '全部清除',
        clearAllConfirm: '删除所有批注和评论？',
        clearAllSure: '确定删除？',
        hintCard: 'Enter 添加 · 点击空白处保存 · Esc 关闭',
        commentDelete: '删除此评论',
        toolbar: '快速评审回复',
        custom: '自定义回复',
        labelYes: '是',
        replyYes: '是',
        labelNo: '不是',
        replyNo: '不是',
        labelProve: '证明一下',
        replyProve: '证明一下',
        labelMore: '还有别的吗？',
        replyMore: '还有别的吗？',
        labelThink: '再想想',
        replyThink: '需要再想想这个任务。',
      },
      en: {
        quote: 'Quote',
        placeholder: 'Comment on this passage…',
        add: 'Add',
        send: 'Send',
        sending: 'Sending…',
        sendFailed: 'Not sent — restored',
        sendFileBlocked: 'A file attachment cannot be sent with a quote',
        showMore: 'Show {count} more',
        save: 'Save',
        hintAdd: 'Enter to add · Shift+Enter for newline · Esc to cancel',
        hintSave: 'Enter to add · Shift+Enter for newline · Esc to cancel',
        edit: 'Edit',
        remove: 'Remove',
        comments: 'Comments',
        addComment: 'Add comment',
        commentPlaceholder: 'Another comment…',
        deleteNote: 'Delete note',
        close: 'Close',
        pending: 'Not sent',
        emptyComments: 'No comments yet',
        addAction: 'Add action',
        actionLabel: 'Button label',
        actionPhrase: 'Inserted phrase',
        cancel: 'Cancel',
        deleteActionConfirm: 'Delete this action?',
        yes: 'Yes',
        no: 'No',
        clearField: 'Clear field',
        dictate: 'Dictate (microphone)',
        dictateUnavailable: 'Speech input unavailable here — use the system dictation',
        documentHeading: 'Document: {path}',
        enterReview: 'Review',
        exitReview: 'Exit review',
        clearAll: 'Clear all',
        clearAllConfirm: 'Delete all notes and comments?',
        clearAllSure: 'Sure?',
        hintCard: 'Enter to add · click away to save · Esc to close',
        commentDelete: 'Delete comment',
        toolbar: 'Quick review replies',
        custom: 'Custom reply',
        labelYes: 'Yes',
        replyYes: 'Yes',
        labelNo: 'No',
        replyNo: 'No',
        labelProve: 'Prove it',
        replyProve: 'Prove it',
        labelMore: 'What else?',
        replyMore: 'What else?',
        labelThink: 'Think it over',
        replyThink: 'Need to think about the task.',
      },
      ru: {
        quote: 'Цитата',
        placeholder: 'Комментарий к фрагменту…',
        add: 'Добавить',
        send: 'Отправить',
        sending: 'Отправка…',
        sendFailed: 'Не отправлено — возвращено',
        sendFileBlocked: 'Файл нельзя отправить вместе с цитатой',
        showMore: 'Показать ещё {count}',
        save: 'Сохранить',
        hintAdd: 'Enter — добавить · Shift+Enter — новая строка · Esc — отмена',
        hintSave: 'Enter — добавить · Shift+Enter — новая строка · Esc — отмена',
        edit: 'Изменить',
        remove: 'Удалить',
        comments: 'Комментарии',
        addComment: 'Добавить комментарий',
        commentPlaceholder: 'Ещё один комментарий…',
        deleteNote: 'Удалить заметку',
        close: 'Закрыть',
        pending: 'Не отправлено',
        emptyComments: 'Комментариев пока нет',
        addAction: 'Добавить действие',
        actionLabel: 'Надпись на кнопке',
        actionPhrase: 'Фраза для вставки',
        cancel: 'Отмена',
        deleteActionConfirm: 'Удалить это действие?',
        yes: 'Да',
        no: 'Нет',
        clearField: 'Очистить поле',
        dictate: 'Диктовка (микрофон)',
        dictateUnavailable: 'Здесь нет распознавания речи — используйте системную диктовку (macOS: 2×Fn)',
        documentHeading: 'Документ: {path}',
        enterReview: 'Рецензировать',
        exitReview: 'Выйти из рецензирования',
        clearAll: 'Очистить всё',
        clearAllConfirm: 'Удалить все заметки и комментарии?',
        clearAllSure: 'Точно?',
        hintCard: 'Enter — добавить · клик мимо — сохранить · Esc — закрыть',
        commentDelete: 'Удалить комментарий',
        toolbar: 'Быстрые ответы для ревью',
        custom: 'Свой ответ',
        labelYes: 'Да',
        replyYes: 'Да',
        labelNo: 'Нет',
        replyNo: 'Нет',
        labelProve: 'Докажи',
        replyProve: 'Докажи',
        labelMore: 'Что-то ещё?',
        replyMore: 'Что-то ещё?',
        labelThink: 'Подумать',
        replyThink: 'Надо подумать над задачей.',
      },
    };

    /** One quick reply per button: `labelKey` is the chip, `replyKey` the block. */
    const QUICK_REPLIES = [
      { labelKey: 'labelYes', replyKey: 'replyYes' },
      { labelKey: 'labelNo', replyKey: 'replyNo' },
      { labelKey: 'labelProve', replyKey: 'replyProve' },
      { labelKey: 'labelMore', replyKey: 'replyMore' },
      { labelKey: 'labelThink', replyKey: 'replyThink' },
    ];

    /** The Harness locale service, captured in apply; null outside the app. */
    let localeService = null;
    /** The sessions service: `binding(id).session.prompt()` sends without the composer. */
    let sessionsService = null;
    /** Bound translator from the Client locale service, when it is available. */
    let translate = null;
    const NS = 'reviewQueue';

    /** Map one active locale id onto a local table; English is the fallback. */
    function langOf(tag) {
      if (typeof tag === 'string' && tag !== '') {
        if (/^ru/i.test(tag)) return 'ru';
        if (/^zh/i.test(tag)) return 'zh';
        if (/^en/i.test(tag)) return 'en';
      }
      return 'en';
    }

    function detectLang() {
      try {
        const snapshot = localeService ? localeService.getLocale() : null;
        const active = snapshot && snapshot.active;
        if (typeof active === 'string' && active !== '') return langOf(active);
      } catch (_error) {
        /* fall through to the document language */
      }
      try {
        const raw = document.documentElement.getAttribute('lang') || navigator.language || 'en';
        return langOf(raw);
      } catch (_error) {
        return 'en';
      }
    }

    /**
     * Copy for this plugin. The Harness dictionary owns the active language and
     * its fallback chain; the local table is only the fallback when the locale
     * service is missing (tests, a stripped-down profile).
     */
    function t(key, values) {
      let text;
      if (translate !== null) {
        try {
          const value = translate(key);
          if (typeof value === 'string' && value !== '' && value !== key) text = value;
        } catch (_error) {
          /* fall through to the local table */
        }
      }
      if (text === undefined) {
        const lang = detectLang();
        const table = I18N[lang] || I18N.en;
        text = table[key] || I18N.en[key] || key;
      }
      if (!values) return text;
      return text.replace(/\{(\w+)\}/g, (match, name) =>
        values[name] === undefined ? match : String(values[name]),
      );
    }

    // ---------------------------------------------------------------- selection

    /**
     * Geometry for a selection: the union box, plus the first *line* box. A line
     * can arrive as several rects (inline chips, styled spans), so the first line
     * is every rect sharing the topmost edge, unioned — centring on the first
     * fragment alone parks the pill at the left edge of the line.
     */
    function selectionRect(range) {
      const rects = Array.from(range.getClientRects()).filter(
        (rect) => rect.width > 0 && rect.height > 0,
      );
      const fallback = range.getBoundingClientRect();
      if (rects.length === 0) {
        if (fallback.width <= 0 || fallback.height <= 0) return null;
        rects.push(fallback);
      }
      let top = Infinity;
      let left = Infinity;
      let right = -Infinity;
      let bottom = -Infinity;
      let firstTop = Infinity;
      for (const rect of rects) {
        top = Math.min(top, rect.top);
        left = Math.min(left, rect.left);
        right = Math.max(right, rect.right);
        bottom = Math.max(bottom, rect.bottom);
        firstTop = Math.min(firstTop, rect.top);
      }
      if (!Number.isFinite(top) || right <= left) return null;
      const lineRects = rects.filter((rect) => Math.abs(rect.top - firstTop) <= 4);
      const lineLeft = Math.min(...lineRects.map((rect) => rect.left));
      const lineRight = Math.max(...lineRects.map((rect) => rect.right));
      const lineBottom = Math.max(...lineRects.map((rect) => rect.bottom));
      return {
        union: { top, left, right, bottom, width: right - left, height: bottom - top },
        first: {
          top: firstTop,
          left: lineLeft,
          bottom: lineBottom,
          width: Math.max(lineRight - lineLeft, 0),
          height: lineBottom - firstTop,
        },
      };
    }

    function normalizeQuote(text) {
      return String(text)
        .replace(/\r\n?/g, '\n')
        // Selecting part of an earlier quote-and-reply message carries that
        // message's own quote bars in; they would nest and read as old text.
        .replace(/^[ \t]*[│▌][ \t]*/gm, '')
        .replace(/[ \t]+\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
    }

    /** The right-sidebar document frame carries its file address as a contentId. */
    const FILE_ADDRESS_PREFIX = 'dsh-resource://file/';

    /** Human file path from a `dsh-resource://file/...` address, or null. */
    function docPathFromAddress(address) {
      const value = String(address || '');
      if (value.indexOf(FILE_ADDRESS_PREFIX) !== 0) return null;
      const end = value.search(/[?#]/);
      const rest = value.slice(FILE_ADDRESS_PREFIX.length, end === -1 ? undefined : end).split('/');
      const scope = rest[0];
      if (scope === 'session') {
        const [, id, ...segments] = rest;
        if (id === undefined || id === '' || segments.length === 0) return null;
        return segments.map(decodeURIComponent).join('/');
      }
      if (scope === 'absolute') {
        const unc = rest[1] === '' && rest.length > 1;
        const segments = (unc ? rest.slice(2) : rest.slice(1)).map(decodeURIComponent);
        if (segments.length === 0 || segments[0] === '') return null;
        return unc ? '//' + segments.join('/') : segments.join('/');
      }
      return null;
    }

    /** The file path when this element lives inside a right-sidebar document preview. */
    function documentPathOf(element) {
      if (!element || !element.closest) return null;
      const frame = element.closest('[data-textpreview-url]');
      if (!frame) return null;
      return docPathFromAddress(frame.getAttribute('data-textpreview-url'));
    }

    /** The live selection when it sits in transcript text and out of every control. */
    function readSelection() {
      let selection;
      try {
        selection = window.getSelection();
      } catch (_error) {
        return null;
      }
      if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return null;
      const range = selection.getRangeAt(0);
      const node = range.commonAncestorContainer;
      const element = node && node.nodeType === 1 ? node : node && node.parentElement;
      if (!element || !element.closest) return null;
      if (element.closest('[data-quote-reply-ui]')) return null;
      if (
        element.closest(
          'textarea, input, select, [contenteditable="true"], [contenteditable=""], [role="textbox"]',
        )
      ) {
        return null;
      }
      const inChat = element.closest('[data-conversation-region="chat"]');
      const documentPath = inChat ? null : documentPathOf(element);
      if (!inChat && !documentPath) return null;
      const source = documentPath ? { kind: 'document', path: documentPath } : { kind: 'chat' };
      const text = normalizeQuote(selection.toString());
      if (!text) return null;
      const box = selectionRect(range);
      if (!box) return null;
      return {
        text,
        rect: box.union,
        line: box.first,
        start: anchorRect(selection, box.first),
        range: range.cloneRange(),
        source,
      };
    }

    /**
     * The caret rectangle where the user began selecting. For a backward
     * selection the anchor is the bottom end, which is exactly where the review
     * surface should appear — not at the top of the union box.
     */
    function anchorRect(selection, fallback) {
      try {
        const node = selection.anchorNode;
        if (node) {
          const length =
            node.nodeType === 1 ? node.childNodes.length : String(node.nodeValue || '').length;
          const offset = Math.max(0, Math.min(selection.anchorOffset, length));
          const range = document.createRange();
          range.setStart(node, offset);
          range.collapse(true);
          const rect = range.getBoundingClientRect();
          if (rect && (rect.height > 0 || rect.width > 0)) {
            return { top: rect.top, left: rect.left, height: rect.height || 18, width: 0 };
          }
          const element = node.nodeType === 1 ? node : node.parentElement;
          const box = element && element.getBoundingClientRect ? element.getBoundingClientRect() : null;
          if (box) return { top: box.top, left: box.left, height: box.height || 18, width: 0 };
        }
      } catch (_error) {
        /* fall through to the selection box */
      }
      return { top: fallback.top, left: fallback.left, height: fallback.height || 18, width: 0 };
    }

    function sameTarget(a, b) {
      if (a === b) return true;
      if (!a || !b) return false;
      return (
        a.text === b.text &&
        Math.abs(a.rect.top - b.rect.top) < 1 &&
        Math.abs(a.rect.left - b.rect.left) < 1 &&
        Math.abs(a.rect.width - b.rect.width) < 1
      );
    }

    function classEndsWith(element, suffix) {
      for (const token of Array.from(element.classList || [])) {
        if (token === suffix || token.endsWith('_' + suffix) || token.endsWith('-' + suffix)) {
          return true;
        }
      }
      return false;
    }

    /** The composer's primary (send) button, without depending on its hashed class. */
    /**
     * True when this button is the composer's primary (send) button.
     *
     * The same element turns into Stop while a turn runs with an empty composer,
     * so the label guard runs first for every candidate: hijacking Stop would
     * both deny the interrupt and queue a message the user did not send.
     */
    function isSendButton(button, card) {
      const label = String(button.getAttribute('aria-label') || '').trim();
      if (label && /停止|中止|Stop|Cancel|取消/i.test(label)) return false;
      const primaries = Array.from(card.querySelectorAll('button')).filter((candidate) => {
        if (candidate.closest('[data-quote-reply-ui]')) return false;
        if (candidate.closest('[data-composer-overlay]')) return false;
        return classEndsWith(candidate, 'primary');
      });
      if (primaries.length > 0) return primaries[primaries.length - 1] === button;
      if (!label) return false;
      return /发送|排队|转向|Send|Queue|Steer/i.test(label);
    }

    /**
     * A quotation in the outgoing message. Markdown blockquote lines are the
     * shipped convention: the message-quotes plugin already renders them as
     * quote cards in the transcript, and the model reads a standard quote.
     */
    function quoteAsMarkdown(text) {
      const trimmed = String(text || '').trim();
      if (!trimmed) return '';
      return trimmed
        .split('\n')
        .map((line) => (line.trim() === '' ? '>' : '> ' + line))
        .join('\n');
    }

    // ----------------------------------------------------------- quick actions

    const ACTIONS_KEY = 'dsh-review-queue:actions:v1';

    function readStoredActions() {
      try {
        const raw = window.localStorage.getItem(ACTIONS_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return null;
        return parsed
          .filter((entry) => entry && typeof entry.text === 'string' && entry.text.trim() !== '')
          .map((entry) => ({
            id: String(entry.id || ''),
            label: typeof entry.label === 'string' && entry.label.trim() !== '' ? entry.label : '',
            text: entry.text,
          }));
      } catch (_error) {
        return null;
      }
    }

    function writeStoredActions(actions) {
      try {
        window.localStorage.setItem(ACTIONS_KEY, JSON.stringify(actions));
      } catch (_error) {
        /* storage may be unavailable: the dictionary then lasts the page */
      }
    }

    /** One font size per chip length, so a long phrase never shouts. */
    function chipFontSize(label) {
      const length = String(label || '').length;
      if (length <= 4) return '12.5px';
      if (length <= 7) return '12px';
      if (length <= 10) return '11px';
      if (length <= 14) return '10.25px';
      return '9.5px';
    }

    // --------------------------------------------------------------- highlights

    const CHAT_SELECTOR = '[data-conversation-region="chat"]';
    const HIGHLIGHT_PENDING = 'dqr-review-pending';
    const HIGHLIGHT_LOGGED = 'dqr-review-logged';
    const HIGHLIGHT_HOVER = 'dqr-review-hover';

    /** The Custom Highlight registry, created once per page and reused. */
    let highlights = null;

    function highlightSupported() {
      return (
        typeof window.Highlight === 'function' &&
        window.CSS &&
        window.CSS.highlights &&
        typeof window.CSS.highlights.set === 'function'
      );
    }

    function ensureHighlights() {
      if (highlights !== null) return highlights;
      if (!highlightSupported()) return null;
      try {
        highlights = {
          pending: new window.Highlight(),
          logged: new window.Highlight(),
          hover: new window.Highlight(),
        };
        window.CSS.highlights.set(HIGHLIGHT_PENDING, highlights.pending);
        window.CSS.highlights.set(HIGHLIGHT_LOGGED, highlights.logged);
        window.CSS.highlights.set(HIGHLIGHT_HOVER, highlights.hover);
      } catch (_error) {
        highlights = null;
      }
      return highlights;
    }

    /** Re-publish the ranges: pending notes burn brighter than sent ones. */
    function paintHighlights(blocks, hoveredId) {
      const api = ensureHighlights();
      if (!api) return;
      const pending = [];
      const logged = [];
      const hover = [];
      for (const block of blocks) {
        const range = block.range;
        if (!range || !range.startContainer || !range.startContainer.isConnected) continue;
        if (block.id === hoveredId) hover.push(range);
        if ((block.comments || []).some((comment) => comment.sent !== true)) pending.push(range);
        else if ((block.comments || []).length > 0) logged.push(range);
      }
      try {
        window.CSS.highlights.set(HIGHLIGHT_PENDING, new window.Highlight(...pending));
        window.CSS.highlights.set(HIGHLIGHT_LOGGED, new window.Highlight(...logged));
        window.CSS.highlights.set(HIGHLIGHT_HOVER, new window.Highlight(...hover));
      } catch (_error) {
        /* a missing registry only removes the decoration */
      }
    }

    function clearHighlights() {
      if (!highlightSupported() || !window.CSS.highlights) return;
      try {
        window.CSS.highlights.delete(HIGHLIGHT_PENDING);
        window.CSS.highlights.delete(HIGHLIGHT_LOGGED);
        window.CSS.highlights.delete(HIGHLIGHT_HOVER);
      } catch (_error) {
        /* ignore */
      }
      highlights = null;
    }

    /**
     * Concatenated transcript text plus the mapping back to its text nodes.
     * Annotations are anchored by their exact text and can be re-anchored after
     * the host re-renders or reloads the conversation.
     */
    function chatTextMap() {
      const root = document.querySelector(CHAT_SELECTOR);
      if (!root) return null;
      let text = '';
      const segments = [];
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
      let node = walker.nextNode();
      while (node) {
        const parent = node.parentElement;
        if (!parent || parent.closest('[data-quote-reply-ui], [contenteditable="true"], [contenteditable=""], [role="textbox"], textarea, input, [data-composer-card]')) {
          node = walker.nextNode();
          continue;
        }
        const value = node.nodeValue || '';
        if (value !== '') {
          segments.push({ node, start: text.length, end: text.length + value.length });
          text += value;
        }
        node = walker.nextNode();
      }
      if (text === '') return null;
      return { root, text, segments };
    }

    /**
     * Text map for one right-sidebar document (the body scrollport of the frame
     * whose file address resolves to `path`). Same shape as the chat map, so
     * re-anchoring a document quote works exactly like a transcript quote.
     */
    function documentTextMap(path) {
      if (!path) return null;
      const frames = document.querySelectorAll('[data-textpreview-url]');
      for (const frame of Array.from(frames)) {
        if (docPathFromAddress(frame.getAttribute('data-textpreview-url')) !== path) continue;
        const root = frame.querySelector('[data-textpreview-body]');
        if (!root) continue;
        let text = '';
        const segments = [];
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
        let node = walker.nextNode();
        while (node) {
          const parent = node.parentElement;
          if (
            !parent ||
            parent.closest('[data-quote-reply-ui], [contenteditable="true"], [contenteditable=""], textarea, input')
          ) {
            node = walker.nextNode();
            continue;
          }
          const value = node.nodeValue || '';
          if (value !== '') {
            segments.push({ node, start: text.length, end: text.length + value.length });
            text += value;
          }
          node = walker.nextNode();
        }
        if (text === '') return null;
        return { root, text, segments };
      }
      return null;
    }

    function textMapFor(source) {
      return source && source.kind === 'document' ? documentTextMap(source.path) : chatTextMap();
    }

    function rangeFromOffsets(map, start, end) {
      const locate = (offset) => {
        for (const segment of map.segments) {
          if (offset >= segment.start && offset <= segment.end) {
            return { node: segment.node, offset: Math.max(0, Math.min(offset - segment.start, segment.node.nodeValue.length)) };
          }
        }
        return null;
      };
      const from = locate(start);
      const to = locate(end);
      if (!from || !to) return null;
      try {
        const range = document.createRange();
        range.setStart(from.node, from.offset);
        range.setEnd(to.node, to.offset);
        return range;
      } catch (_error) {
        return null;
      }
    }

    /** Surrounding text, so a repeated quote re-anchors to the right occurrence. */
    function anchorFor(map, start, end) {
      return {
        prefix: map.text.slice(Math.max(0, start - 40), start),
        suffix: map.text.slice(end, end + 40),
      };
    }

    function findQuoteRange(quote, anchor, source) {
      const text = String(quote || '');
      if (text === '') return null;
      const map = textMapFor(source);
      if (!map) return null;
      const candidates = [];
      let index = map.text.indexOf(text);
      while (index >= 0 && candidates.length < 30) {
        candidates.push(index);
        index = map.text.indexOf(text, index + 1);
      }
      if (candidates.length === 0) return null;
      let chosen = candidates[0];
      if (anchor && (anchor.prefix || anchor.suffix)) {
        for (const candidate of candidates) {
          const before = map.text.slice(Math.max(0, candidate - 40), candidate);
          const after = map.text.slice(candidate + text.length, candidate + text.length + 40);
          if (
            (!anchor.prefix || before.endsWith(anchor.prefix)) &&
            (!anchor.suffix || after.startsWith(anchor.suffix))
          ) {
            chosen = candidate;
            break;
          }
        }
      }
      return rangeFromOffsets(map, chosen, chosen + text.length);
    }

    /** Which occurrence of `quote` the live selection starts at, as plain text offsets. */
    function anchorForRange(range, quote, source) {
      const map = textMapFor(source);
      const text = String(quote || '');
      if (!map || text === '') return null;
      const selectionRect = range && range.getBoundingClientRect ? range.getBoundingClientRect() : null;
      let chosen = -1;
      let index = map.text.indexOf(text);
      while (index >= 0) {
        const candidate = rangeFromOffsets(map, index, index + text.length);
        if (chosen < 0) chosen = index;
        if (candidate && selectionRect) {
          const rect = candidate.getBoundingClientRect();
          if (Math.abs(rect.top - selectionRect.top) < 2 && Math.abs(rect.left - selectionRect.left) < 2) {
            chosen = index;
            break;
          }
        }
        index = map.text.indexOf(text, index + 1);
      }
      if (chosen < 0) return null;
      return anchorFor(map, chosen, chosen + text.length);
    }

    // ------------------------------------------------------------------ manager

    const manager = {
      listeners: new Set(),
      snap: null,
      session: null,
      draft: '',
      blocks: [],
      /** Per-session quote queues, so a session switch never eats a draft. */
      queues: new Map(),
      /** Per-session review/standby mode, so each chat keeps its own state. */
      reviewing: false,
      reviewModes: new Map(),
      target: null,
      /** True between pointerdown and pointerup: the user is still drawing the
       *  selection, so the card must not pop up and steal the drag mid-way. */
      dragging: false,
      /** True while the selection card is open: scan must not clear it when the
       *  document selection collapses into the comment textarea. */
      cardOpen: false,
      /** Hovered annotation card: { blockId, x, y } plus its timers. */
      hover: null,
      /** A freshly added note must not pop its own card under the pointer. */
      hoverSuppressUntil: 0,
      hoverTimer: 0,
      hideTimer: 0,
      reanchorTimer: 0,
      observerTimer: 0,
      saveTimer: 0,
      observer: null,
      /** Editable quick-action dictionary (persisted separately from notes). */
      actions: null,
      chipMenu: null,
      actionEditor: null,
      cardDraft: '',
      hoverDrafts: new Map(),
      clearConfirm: false,
      clearConfirmTimer: 0,
      popover: null,
      mounted: null,
      seq: 0,
      scanTimer: 0,
      frame: 0,
      clearTimer: 0,
      sending: false,
      /** Whether the session currently has a running turn (Stop is the primary). */
      running: false,
      /** Send attempt counter and its watchdog timer. */
      sendSeq: 0,
      sendGuard: 0,
      /** Visible send state: '' | 'sending' | 'failed' | 'fileBlocked'. */
      status: '',
      statusTimer: 0,
      /** Comma-joined draft attachment ids the next send must carry. */
      attachmentIds: '',

      subscribe(listener) {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
      },

      buildSnapshot() {
        return {
          sessionId: this.session ? this.session.sessionId : null,
          hasSession: this.session !== null,
          reviewing: this.reviewing,
          blocks: this.blocks.slice(),
          target: this.target,
          popover: this.popover,
          hover: this.hover,
          actions: this.actions || [],
          chipMenu: this.chipMenu,
          actionEditor: this.actionEditor,
          clearConfirm: this.clearConfirm,
          status: this.status,
        };
      },

      snapshot() {
        if (this.snap === null) this.snap = this.buildSnapshot();
        return this.snap;
      },

      notify() {
        this.snap = this.buildSnapshot();
        for (const listener of Array.from(this.listeners)) {
          try {
            listener();
          } catch (error) {
            console.error('quote-reply: listener failed', error);
          }
        }
      },

      // ------------------------------------------------------------ quick actions

      /** Seed the dictionary on first use, then trust the stored copy. */
      initActions() {
        if (this.actions !== null) return;
        const stored = readStoredActions();
        if (stored !== null) {
          // An empty stored list is a deliberate "no actions", not a reset.
          this.actions = stored;
          return;
        }
        this.actions = QUICK_REPLIES.map((spec, index) => ({
          id: 'default-' + index,
          label: t(spec.labelKey),
          text: t(spec.replyKey),
        }));
        this.persistActions();
      },

      persistActions() {
        writeStoredActions(this.actions || []);
      },

      openChipMenu(actionId, x, y) {
        this.chipMenu = { actionId, x, y, confirming: false };
        this.actionEditor = null;
        this.notify();
      },

      closeChipMenu() {
        if (this.chipMenu === null) return;
        this.chipMenu = null;
        this.notify();
      },

      confirmChipDelete() {
        if (this.chipMenu === null) return;
        this.chipMenu.confirming = true;
        this.notify();
      },

      openActionEditor(actionId, x, y, presetText) {
        const action = actionId === null ? null : (this.actions || []).find((entry) => entry.id === actionId);
        this.actionEditor = {
          id: action ? action.id : null,
          label: action ? action.label : '',
          text: action ? action.text : String(presetText || ''),
          x: typeof x === 'number' ? x : window.innerWidth / 2,
          y: typeof y === 'number' ? y : window.innerHeight / 2,
        };
        this.chipMenu = null;
        this.notify();
      },

      closeActionEditor() {
        if (this.actionEditor === null) return;
        this.actionEditor = null;
        this.notify();
      },

      saveAction(id, label, text) {
        const phrase = String(text || '').trim();
        if (phrase === '') return false;
        const chip = String(label || '').trim() || phrase;
        if (!Array.isArray(this.actions)) this.actions = [];
        if (id) {
          const action = this.actions.find((entry) => entry.id === id);
          if (!action) return false;
          action.label = chip;
          action.text = phrase;
        } else {
          this.actions.push({ id: 'user-' + String(Date.now()), label: chip, text: phrase });
        }
        this.persistActions();
        this.actionEditor = null;
        this.notify();
        return true;
      },

      removeAction(id) {
        if (!Array.isArray(this.actions)) return;
        this.actions = this.actions.filter((entry) => entry.id !== id);
        this.persistActions();
        this.chipMenu = null;
        this.actionEditor = null;
        this.notify();
      },

      /** The selection card reports its draft so an outside click can save it. */
      setCardDraft(text) {
        this.cardDraft = typeof text === 'string' ? text : '';
      },

      commitCardDraft() {
        const text = String(this.cardDraft || '').trim();
        const target = this.target;
        this.cardDraft = '';
        if (text === '' || !target) return false;
        return this.addBlock(target.text, text);
      },

      setHoverDraft(blockId, text) {
        if (typeof text !== 'string' || text.trim() === '') this.hoverDrafts.delete(blockId);
        else this.hoverDrafts.set(blockId, text);
      },

      getHoverDraft(blockId) {
        return this.hoverDrafts.get(blockId) || '';
      },

      commitHoverDraft() {
        const hover = this.hover;
        if (!hover) return false;
        const text = String(this.hoverDrafts.get(hover.blockId) || '').trim();
        this.hoverDrafts.delete(hover.blockId);
        if (text === '') return false;
        return this.addComment(hover.blockId, text);
      },

      // ------------------------------------------------------------ review notes

      pendingComments(block) {
        return (block.comments || []).filter((comment) => comment.sent !== true);
      },

      hasPending(block) {
        return this.pendingComments(block).length > 0;
      },

      pendingBlocks() {
        return this.blocks.filter((block) => this.hasPending(block));
      },

      latestComment(block) {
        const list = block.comments || [];
        if (list.length > 0) return list[list.length - 1].text;
        return typeof block.reply === 'string' ? block.reply : '';
      },

      newBlock(quote, comment, range, anchor, source) {
        this.seq += 1;
        return {
          id: this.seq,
          quote,
          reply: String(comment || '').trim(),
          comments: [{ text: String(comment || '').trim(), sent: false }],
          range: range || null,
          anchor: anchor || null,
          source: source && source.kind === 'document' ? source : { kind: 'chat' },
        };
      },

      paint() {
        // The first note also starts watching the transcript (and any document
        // body) for re-renders, so a highlight is re-anchored instead of
        // silently disappearing.
        this.ensureObserver();
        this.observeDocumentBodies();
        paintHighlights(this.blocks, this.hover ? this.hover.blockId : null);
      },

      storageKey(sessionId) {
        return 'dsh-review-queue:v1:' + sessionId;
      },

      modeKey(sessionId) {
        return 'dsh-review-queue:mode:v1:' + sessionId;
      },

      loadReviewMode(sessionId) {
        try {
          return window.localStorage.getItem(this.modeKey(sessionId)) === '1';
        } catch (_error) {
          return false;
        }
      },

      saveReviewMode() {
        const session = this.session;
        if (!session) return;
        try {
          if (this.reviewing) window.localStorage.setItem(this.modeKey(session.sessionId), '1');
          else window.localStorage.removeItem(this.modeKey(session.sessionId));
        } catch (_error) {
          /* storage may be unavailable: the mode then lives in memory only */
        }
      },

      enterReviewMode() {
        if (!this.session) return;
        this.reviewing = true;
        this.reviewModes.set(this.session.sessionId, true);
        this.saveReviewMode();
        this.notify();
      },

      exitReviewMode() {
        this.reviewing = false;
        if (this.session) this.reviewModes.set(this.session.sessionId, false);
        this.saveReviewMode();
        this.target = null;
        this.cardDraft = '';
        this.notify();
      },

      persistSoon() {
        if (!this.session) return;
        if (this.saveTimer) return;
        this.saveTimer = window.setTimeout(() => {
          this.saveTimer = 0;
          this.writeStorage();
        }, 250);
      },

      writeStorage() {
        const session = this.session;
        if (!session) return;
        try {
          const list = this.blocks.map((block) => ({
            quote: block.quote,
            anchor: block.anchor || null,
            source: block.source && block.source.kind === 'document' ? block.source : null,
            comments: (block.comments || []).map((comment) => ({
              text: comment.text,
              sent: comment.sent === true,
            })),
          }));
          if (list.length === 0) window.localStorage.removeItem(this.storageKey(session.sessionId));
          else window.localStorage.setItem(this.storageKey(session.sessionId), JSON.stringify(list));
        } catch (_error) {
          /* storage may be unavailable: notes then live in memory only */
        }
      },

      readStorage(sessionId) {
        try {
          const raw = window.localStorage.getItem(this.storageKey(sessionId));
          if (!raw) return [];
          const parsed = JSON.parse(raw);
          if (!Array.isArray(parsed)) return [];
          return parsed
            .filter((entry) => entry && typeof entry.quote === 'string' && Array.isArray(entry.comments))
            .map((entry) => ({
              quote: entry.quote,
              anchor: entry.anchor || null,
              source:
                entry.source && entry.source.kind === 'document'
                  ? entry.source
                  : null,
              comments: entry.comments
                .map((comment) => ({
                  text: String((comment && comment.text) || ''),
                  sent: comment && comment.sent === true,
                }))
                .filter((comment) => comment.text !== ''),
            }))
            .filter((entry) => entry.comments.length > 0);
        } catch (_error) {
          return [];
        }
      },

      loadBlocks(sessionId) {
        return this.readStorage(sessionId).map((entry) => {
          this.seq += 1;
          return {
            id: this.seq,
            quote: entry.quote,
            reply: entry.comments[entry.comments.length - 1].text,
            comments: entry.comments,
            range: null,
            anchor: entry.anchor,
            source: entry.source && entry.source.kind === 'document' ? entry.source : { kind: 'chat' },
          };
        });
      },

      /** Re-anchor every note whose DOM range went stale, then repaint. */
      reanchorSoon(delay) {
        if (this.reanchorTimer) window.clearTimeout(this.reanchorTimer);
        this.reanchorTimer = window.setTimeout(() => {
          this.reanchorTimer = 0;
          this.reanchor();
          this.paint();
          this.notify();
        }, typeof delay === 'number' ? delay : 150);
      },

      reanchor() {
        if (!this.ensureObserver()) return;
        for (const block of this.blocks) {
          if (block.range && block.range.startContainer && block.range.startContainer.isConnected) continue;
          block.range = findQuoteRange(block.quote, block.anchor, block.source);
        }
      },

      ensureObserver() {
        if (this.observer) return true;
        if (typeof window.MutationObserver !== 'function') return false;
        const chat = document.querySelector(CHAT_SELECTOR);
        if (!chat) {
          // The transcript may not be mounted yet (another panel is open): retry
          // for a bounded while, then wait for the next note to start over.
          this.observerTries = (this.observerTries || 0) + 1;
          if (this.observerTries <= 40 && this.observerTimer === 0) {
            this.observerTimer = window.setTimeout(() => {
              this.observerTimer = 0;
              if (this.blocks.length > 0) this.reanchorSoon(0);
            }, 500);
          }
          return false;
        }
        this.observerTries = 0;
        this.observer = new window.MutationObserver(() => this.reanchorSoon(250));
        this.observedNodes = new Set();
        this.observer.observe(chat, { childList: true, subtree: true, characterData: true });
        this.observedNodes.add(chat);
        return true;
      },

      /** Watch any document preview body that holds a note, opened before or after. */
      observeDocumentBodies() {
        if (!this.observer || !this.observedNodes) return;
        const bodies = document.querySelectorAll('[data-textpreview-body]');
        for (const body of Array.from(bodies)) {
          if (this.observedNodes.has(body)) continue;
          this.observedNodes.add(body);
          this.observer.observe(body, { childList: true, subtree: true, characterData: true });
        }
      },

      dropObserver() {
        if (this.observer) this.observer.disconnect();
        this.observer = null;
        this.observedNodes = null;
        this.observerTries = 0;
        if (this.observerTimer) {
          window.clearTimeout(this.observerTimer);
          this.observerTimer = 0;
        }
      },

      /** A new comment stays pending until the next successful send. */
      appendComment(block, comment) {
        const body = String(comment || '').trim();
        if (!body) return false;
        if (!Array.isArray(block.comments)) block.comments = [];
        block.comments.push({ text: body, sent: false });
        block.reply = body;
        this.paint();
        this.persistSoon();
        this.ensureCarrier();
        return true;
      },

      markSent() {
        for (const block of this.blocks) {
          for (const comment of block.comments || []) comment.sent = true;
        }
        this.paint();
        this.persistSoon();
        this.ensureCarrier();
      },

      setSentFlags(flags) {
        const byId = new Map();
        for (const entry of flags || []) byId.set(entry.id, entry.flags);
        for (const block of this.blocks) {
          const row = byId.get(block.id);
          if (!row) continue;
          const comments = block.comments || [];
          for (let index = 0; index < comments.length && index < row.length; index += 1) {
            comments[index].sent = row[index] === true;
          }
        }
        this.paint();
        this.ensureCarrier();
      },

      addComment(blockId, comment) {
        const block = this.blocks.find((candidate) => candidate.id === blockId);
        if (!block) return false;
        if (!this.appendComment(block, comment)) return false;
        this.notify();
        return true;
      },

      removeComment(blockId, index) {
        const block = this.blocks.find((candidate) => candidate.id === blockId);
        if (!block || !Array.isArray(block.comments)) return;
        block.comments.splice(index, 1);
        if (block.comments.length === 0) {
          this.removeBlock(blockId);
          return;
        }
        block.reply = block.comments[block.comments.length - 1].text;
        this.paint();
        this.persistSoon();
        this.ensureCarrier();
        this.notify();
      },

      /** First click asks, the second one clears: no native dialog needed. */
      requestClearAll() {
        if (this.clearConfirm) {
          if (this.clearConfirmTimer) {
            window.clearTimeout(this.clearConfirmTimer);
            this.clearConfirmTimer = 0;
          }
          this.clearConfirm = false;
          this.clearAllNotes();
          return;
        }
        this.clearConfirm = true;
        if (this.clearConfirmTimer) window.clearTimeout(this.clearConfirmTimer);
        this.clearConfirmTimer = window.setTimeout(() => {
          this.clearConfirmTimer = 0;
          this.clearConfirm = false;
          this.notify();
        }, 4000);
        this.notify();
      },

      clearAllNotes() {
        if (this.clearConfirmTimer) {
          window.clearTimeout(this.clearConfirmTimer);
          this.clearConfirmTimer = 0;
        }
        this.clearConfirm = false;
        if (this.blocks.length === 0) return;
        this.blocks = [];
        this.target = null;
        this.hover = null;
        this.hoverDrafts.clear();
        this.cardDraft = '';
        this.paint();
        this.writeStorage();
        this.ensureCarrier();
        this.notify();
      },

      /** The block whose highlight the given selection overlaps, if any. */
      blockAtRange(range) {
        if (!range || !range.getBoundingClientRect) return null;
        let target = null;
        try {
          target = range.getBoundingClientRect();
        } catch (_error) {
          return null;
        }
        if (target.width <= 0 && target.height <= 0) return null;
        for (const block of this.blocks) {
          const existing = block.range;
          if (!existing || !existing.startContainer || !existing.startContainer.isConnected) continue;
          let rect = null;
          try {
            rect = existing.getBoundingClientRect();
          } catch (_error) {
            continue;
          }
          if (rect.width <= 0 && rect.height <= 0) continue;
          if (
            target.left < rect.right &&
            rect.left < target.right &&
            target.top < rect.bottom &&
            rect.top < target.bottom
          ) {
            return block;
          }
        }
        return null;
      },

      // ------------------------------------------------------------- hover card

      handlePointerMove(event) {
        if (Date.now() < this.hoverSuppressUntil) return;
        const target = event.target;
        if (target && target.closest && target.closest('[data-quote-reply-ui]')) {
          if (this.hover && target.closest('[data-review-queue-hover]')) this.keepHover();
          return;
        }
        if (this.target || this.popover) return;
        try {
          const selection = window.getSelection();
          if (selection && selection.isCollapsed === false) return;
        } catch (_error) {
          /* ignore */
        }
        if (!target || !target.closest || !target.closest(CHAT_SELECTOR)) {
          this.scheduleHoverHide();
          return;
        }
        const block = this.hoverAt(event.clientX, event.clientY);
        if (!block) {
          this.scheduleHoverHide();
          return;
        }
        this.showHover(block.id, event.clientX, event.clientY);
      },

      hoverAt(x, y) {
        let caret = null;
        try {
          caret = document.caretRangeFromPoint ? document.caretRangeFromPoint(x, y) : null;
        } catch (_error) {
          caret = null;
        }
        if (!caret || !caret.startContainer || caret.startContainer.nodeType !== 3) return null;
        const node = caret.startContainer;
        const offset = caret.startOffset;
        for (const block of this.blocks) {
          const range = block.range;
          if (!range || !range.startContainer || !range.startContainer.isConnected) continue;
          try {
            if (range.isPointInRange(node, offset)) return block;
          } catch (_error) {
            /* ignore */
          }
        }
        return null;
      },

      showHover(blockId, x, y) {
        if (this.hideTimer) {
          window.clearTimeout(this.hideTimer);
          this.hideTimer = 0;
        }
        if (this.hover && this.hover.blockId === blockId) return;
        if (this.hoverTimer) window.clearTimeout(this.hoverTimer);
        this.hoverTimer = window.setTimeout(() => {
          this.hoverTimer = 0;
          this.hover = { blockId, x, y };
          this.paint();
          this.notify();
        }, 70);
      },

      keepHover() {
        if (this.hideTimer) {
          window.clearTimeout(this.hideTimer);
          this.hideTimer = 0;
        }
      },

      scheduleHoverHide() {
        if (this.hoverTimer) {
          window.clearTimeout(this.hoverTimer);
          this.hoverTimer = 0;
        }
        if (!this.hover || this.hideTimer) return;
        this.hideTimer = window.setTimeout(() => {
          this.hideTimer = 0;
          this.hover = null;
          this.paint();
          this.notify();
        }, 220);
      },

      /** Open the annotation card for a strip tile (no pointer needed). */
      openAnnotation(blockId, rect) {
        const block = this.blocks.find((candidate) => candidate.id === blockId);
        if (!block || !rect) return;
        this.hover = { blockId, x: rect.left + rect.width / 2, y: rect.top };
        this.paint();
        this.notify();
      },

      closeHover() {
        if (this.hoverTimer) {
          window.clearTimeout(this.hoverTimer);
          this.hoverTimer = 0;
        }
        if (this.hideTimer) {
          window.clearTimeout(this.hideTimer);
          this.hideTimer = 0;
        }
        if (this.hover === null) return;
        this.hover = null;
        this.paint();
        this.notify();
      },

      attach(sessionId, actions) {
        if (typeof sessionId !== 'string' || sessionId === '') return;
        if (this.session && this.session.sessionId === sessionId && this.session.actions === actions) {
          return;
        }
        const changedSession = !this.session || this.session.sessionId !== sessionId;
        if (changedSession && this.session !== null) {
          // Each conversation keeps its own queue and mode: switching away must
          // not eat or leak either one.
          this.queues.set(this.session.sessionId, this.blocks);
          this.reviewModes.set(this.session.sessionId, this.reviewing);
          this.writeStorage();
        }
        this.session = { sessionId, actions };
        if (changedSession) {
          this.blocks = this.queues.get(sessionId) || this.loadBlocks(sessionId);
          this.reviewing = this.reviewModes.has(sessionId)
            ? this.reviewModes.get(sessionId)
            : this.loadReviewMode(sessionId);
          this.target = null;
          this.popover = null;
          this.hover = null;
          this.dropObserver();
          this.ensureCarrier();
          this.reanchorSoon(200);
        }
        // Bound the per-session cache; a long-lived app visits many sessions.
        while (this.queues.size > 20) {
          const oldest = this.queues.keys().next().value;
          if (oldest === sessionId) break;
          this.queues.delete(oldest);
        }
        this.notify();
      },

      detach(sessionId) {
        if (!this.session || this.session.sessionId !== sessionId) return;
        this.queues.set(sessionId, this.blocks);
        this.reviewModes.set(sessionId, this.reviewing);
        this.writeStorage();
        this.session = null;
        this.blocks = [];
        this.reviewing = false;
        this.target = null;
        this.dragging = false;
        this.cardOpen = false;
        this.popover = null;
        this.hover = null;
        this.sending = false;
        this.dropObserver();
        clearHighlights();
        this.notify();
      },

      /** Draft text, defensively stripped of the zero-width carrier older builds wrote. */
      cleanDraft() {
        return String(this.draft || '').replace(/\u200B/g, '');
      },

      /** Draft attachments reported by the composer (comma-joined ids). */
      setAttachments(value) {
        this.attachmentIds = typeof value === 'string' ? value : '';
      },

      /** Running-turn state: the composer's primary button becomes Stop. */
      setRunning(value) {
        this.running = value === true;
      },

      /**
       * Track the live draft. Nothing here writes back into the composer; the
       * only writes are the composed send (in the fallback) and clearing the
       * text a successful prompt already carried.
       */
      setDraft(text) {
        this.draft = typeof text === 'string' ? text : '';
        if (this.clearTimer) {
          window.clearTimeout(this.clearTimer);
          this.clearTimer = 0;
        }
      },

      // -------------------------------------------------------------- selection

      mount() {
        if (this.mounted) return this.mounted;
        const schedule = () => this.scheduleScan();
        const onPointerUp = () => {
          this.dragging = false;
          schedule();
        };
        const onKeyUp = (event) => {
          if (
            event.shiftKey ||
            event.key === 'Shift' ||
            event.key === 'ArrowUp' ||
            event.key === 'ArrowDown'
          ) {
            schedule();
          }
        };
        const onSelectionChange = () => {
          if (this.popover) return;
          schedule();
        };
        const onPointerDown = (event) => {
          // The mouse is down: a selection is still being drawn, so keep the
          // card away until the pointer is released.
          this.dragging = true;
          const target = event.target;
          const inUi = target && target.closest && target.closest('[data-quote-reply-ui]');
          if (inUi) {
            // A click elsewhere inside our own UI closes an open menu/editor.
            if (this.chipMenu !== null && !target.closest('[data-review-queue-menu]')) this.closeChipMenu();
            if (this.actionEditor !== null && !target.closest('[data-review-queue-editor]')) this.closeActionEditor();
            return;
          }
          if (this.chipMenu !== null) this.closeChipMenu();
          if (this.actionEditor !== null) this.closeActionEditor();
          // Clicking away saves what was typed, exactly like the send arrow.
          if (this.cardOpen) this.commitCardDraft();
          this.commitHoverDraft();
          if (this.hover) this.closeHover();
          if (this.popover) this.closePopover();
          else this.clearTarget();
        };
        /**
         * A streaming turn scrolls the transcript constantly. Clearing on scroll
         * pulled the pill away before it could be clicked, so scrolling only
         * re-measures the selection: the pill follows the text, and the reply
         * window (anchored to a fixed rect) is left alone.
         */
        const onViewportChange = () => {
          if (this.popover) return;
          this.scheduleScan();
        };
        const onKeyDown = (event) => this.handleKeyDown(event);
        const onClick = (event) => this.handleClick(event);
        const onPointerMove = (event) => this.handlePointerMove(event);
        // While the comment field owns focus, the transcript selection is
        // collapsed — but the review target still holds the passage. Redirect any
        // copy (Cmd/Ctrl+C, the field's context-menu Copy) to that passage, so a
        // plain mouse selection can still be copied without giving up dictation.
        const onCopy = (event) => {
          // In standby mode the selection is never stolen, so native copy works;
          // only review mode (field focused) needs the redirection.
          const text = this.reviewing && this.target ? this.target.text : null;
          if (!text) return;
          // If the user selected text inside the comment field itself, that is
          // what they mean to copy — leave it to the browser.
          const active = document.activeElement;
          if (
            active &&
            (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA') &&
            typeof active.selectionStart === 'number' &&
            typeof active.selectionEnd === 'number' &&
            active.selectionStart !== active.selectionEnd
          ) {
            return;
          }
          try {
            event.preventDefault();
            if (event.clipboardData && typeof event.clipboardData.setData === 'function') {
              event.clipboardData.setData('text/plain', text);
            }
          } catch (_error) {
            /* leave the native copy alone if the clipboard is unavailable */
          }
        };
        document.addEventListener('pointerup', onPointerUp, true);
        document.addEventListener('keyup', onKeyUp, true);
        document.addEventListener('selectionchange', onSelectionChange);
        document.addEventListener('pointerdown', onPointerDown, true);
        document.addEventListener('keydown', onKeyDown, true);
        document.addEventListener('click', onClick, true);
        document.addEventListener('copy', onCopy, true);
        document.addEventListener('pointermove', onPointerMove, { passive: true, capture: true });
        window.addEventListener('scroll', onViewportChange, true);
        window.addEventListener('resize', onViewportChange);
        this.ensureObserver();
        this.mounted = () => {
          document.removeEventListener('pointerup', onPointerUp, true);
          document.removeEventListener('keyup', onKeyUp, true);
          document.removeEventListener('selectionchange', onSelectionChange);
          document.removeEventListener('pointerdown', onPointerDown, true);
          document.removeEventListener('keydown', onKeyDown, true);
          document.removeEventListener('click', onClick, true);
          document.removeEventListener('copy', onCopy, true);
          document.removeEventListener('pointermove', onPointerMove, true);
          window.removeEventListener('scroll', onViewportChange, true);
          window.removeEventListener('resize', onViewportChange);
          if (this.scanTimer) window.clearTimeout(this.scanTimer);
          if (this.frame) window.cancelAnimationFrame(this.frame);
          if (this.clearTimer) window.clearTimeout(this.clearTimer);
          if (this.hoverTimer) window.clearTimeout(this.hoverTimer);
          if (this.hideTimer) window.clearTimeout(this.hideTimer);
          if (this.reanchorTimer) window.clearTimeout(this.reanchorTimer);
          if (this.saveTimer) window.clearTimeout(this.saveTimer);
          this.dropObserver();
          this.scanTimer = 0;
          this.frame = 0;
          this.clearTimer = 0;
          this.hoverTimer = 0;
          this.hideTimer = 0;
          this.reanchorTimer = 0;
          this.saveTimer = 0;
          this.hover = null;
          this.dragging = false;
          this.cardOpen = false;
          clearHighlights();
          this.mounted = null;
        };
        return this.mounted;
      },

      /**
       * Enter inside the composer sends the blocks together with any typed text.
       * A document-capture listener wins over the editor's own keymap, so the
       * composed draft is what the host submits.
       */
      handleKeyDown(event) {
        if (event.defaultPrevented) return;
        // Escape closes the compact bar from anywhere outside its own controls.
        if (event.key === 'Escape' && this.cardOpen) {
          const escapeTarget = event.target;
          if (escapeTarget && escapeTarget.closest && escapeTarget.closest('[data-quote-reply-ui]')) return;
          this.clearTarget();
          return;
        }
        // Shift+Enter inserts a line break; Alt+Enter belongs to the editor.
        // Ctrl/Cmd+Enter is the host's "send" too, so it takes the same detour
        // as a plain Enter — otherwise those blocks would be left behind.
        if (event.key !== 'Enter' || event.shiftKey || event.altKey) return;
        if (event.isComposing || event.keyCode === 229) return;
        if (this.sending || this.pendingBlocks().length === 0) return;
        const target = event.target;
        if (!target || !target.closest) return;
        if (target.closest('[data-quote-reply-ui]')) return;
        const card = target.closest('[data-composer-card]');
        if (!card) return;
        if (target.closest('textarea, input, select, [data-composer-overlay]')) return;
        event.preventDefault();
        event.stopPropagation();
        this.sendNow();
      },

      /** The send button takes the same detour while blocks are waiting. */
      handleClick(event) {
        if (event.defaultPrevented) return;
        if (this.sending || this.pendingBlocks().length === 0) return;
        const target = event.target;
        if (!target || !target.closest) return;
        if (target.closest('[data-quote-reply-ui]')) return;
        const card = target.closest('[data-composer-card]');
        if (!card) return;
        const button = target.closest('button');
        if (!button || !isSendButton(button, card)) return;
        // While a turn runs the primary button *is* Stop whenever the composer is
        // empty; that click belongs to the host's interrupt, never to this plugin.
        if (this.running && this.cleanDraft().trim() === '') return;
        event.preventDefault();
        event.stopPropagation();
        this.sendNow();
      },

      scheduleScan() {
        if (this.scanTimer) window.clearTimeout(this.scanTimer);
        this.scanTimer = window.setTimeout(() => {
          this.scanTimer = 0;
          if (this.frame) window.cancelAnimationFrame(this.frame);
          this.frame = window.requestAnimationFrame(() => {
            this.frame = 0;
            this.scan();
          });
        }, 60);
      },

      scan() {
        if (this.dragging || this.popover || this.cardOpen) return;
        const found = readSelection();
        if (!found) {
          this.clearTarget();
          return;
        }
        // Scrolled fully out of view: nothing left to click, so drop it. A
        // partially visible selection keeps its pill and gets re-measured.
        if (found.rect.bottom < 0 || found.rect.top > window.innerHeight) {
          this.clearTarget();
          return;
        }
        if (sameTarget(this.target, found)) return;
        if (this.hover !== null) {
          this.hover = null;
          this.paint();
        }
        this.target = found;
        this.notify();
      },

      clearTarget() {
        this.chipMenu = null;
        this.actionEditor = null;
        this.cardDraft = '';
        if (this.target === null) return;
        this.target = null;
        this.notify();
      },

      // ---------------------------------------------------------------- popover

      openPopover(options) {
        const source = options || {};
        if (!source.rect || !this.session) return;
        this.seq += 1;
        this.popover = {
          id: this.seq,
          quote: source.text || '',
          reply: source.reply || '',
          blockId: source.blockId || null,
          rect: source.rect,
        };
        this.target = null;
        this.notify();
      },

      closePopover() {
        if (this.popover === null) return;
        this.popover = null;
        this.notify();
      },

      // ----------------------------------------------------------------- blocks

      commit(value) {
        const popover = this.popover;
        if (!popover) return false;
        const reply = String(value || '').trim();
        if (!reply) return false;
        if (popover.blockId !== null) {
          const block = this.blocks.find((candidate) => candidate.id === popover.blockId);
          if (!block) {
            this.popover = null;
            this.notify();
            return false;
          }
          this.appendComment(block, reply);
          this.paint();
        } else {
          const source = this.target;
          const range =
            source && source.range && source.range.startContainer && source.range.startContainer.isConnected
              ? source.range
              : null;
          this.blocks.push(
            this.newBlock(
              popover.quote,
              reply,
              range,
              range ? anchorForRange(range, popover.quote, source && source.source) : null,
              source && source.source,
            ),
          );
          this.paint();
        }
        this.persistSoon();
        this.popover = null;
        try {
          const selection = window.getSelection();
          if (selection) selection.removeAllRanges();
        } catch (_error) {
          /* ignore */
        }
        this.notify();
        this.focusComposer();
        return true;
      },

      /**
       * Add one quick-action block without opening the custom-reply popover.
       * This is the one-click review path: the selected passage plus the preset
       * reply become a tile above the composer immediately.
       * @param quote - selected transcript text.
       * @param reply - localized reply sentence for the chosen quick action.
       * @returns whether the block was added.
       */
      addBlock(quote, reply) {
        const text = String(quote || '').trim();
        const body = String(reply || '').trim();
        if (!text || !body) return false;
        const source = this.target;
        const range =
          source && source.range && source.range.startContainer && source.range.startContainer.isConnected
            ? source.range
            : null;
        const existing = this.blockAtRange(range);
        if (existing) {
          // Commenting on an already-highlighted passage extends that note.
          if (!this.appendComment(existing, body)) return false;
        } else {
          this.blocks.push(
            this.newBlock(
              text,
              body,
              range,
              range ? anchorForRange(range, text, source && source.source) : null,
              source && source.source,
            ),
          );
          this.paint();
          this.persistSoon();
        }
        this.target = null;
        this.popover = null;
        this.cardDraft = '';
        this.chipMenu = null;
        this.actionEditor = null;
        this.hoverSuppressUntil = Date.now() + 450;
        this.ensureCarrier();
        if (this.hover !== null) this.closeHover();
        try {
          const selection = window.getSelection();
          if (selection) selection.removeAllRanges();
        } catch (_error) {
          /* ignore */
        }
        this.notify();
        this.focusComposer();
        return true;
      },

      removeBlock(id) {
        const index = this.blocks.findIndex((block) => block.id === id);
        if (index < 0) return;
        this.blocks.splice(index, 1);
        this.hoverDrafts.delete(id);
        if (this.hover !== null && this.hover.blockId === id) this.hover = null;
        this.paint();
        this.persistSoon();
        this.ensureCarrier();
        this.notify();
      },

      /**
       * The draft as it really is right now. The host's published value is the
       * authority whenever it has anything to say; the editor is only consulted
       * to catch a keystroke the store has not published yet, never to declare
       * the composer empty against the host.
       */
      liveDraft() {
        const tracked = this.cleanDraft();
        if (tracked.trim() !== '') return tracked;
        try {
          const root = document.querySelector('[data-composer-card] [contenteditable="true"]');
          if (root) {
            const inline = String(root.innerText || '').replace(/\u200B/g, '');
            if (inline.trim() !== '') return inline;
          }
        } catch (_error) {
          /* fall through to the tracked value */
        }
        return tracked;
      },

      compose() {
        const typed = this.liveDraft().trim();
        const renderBlock = (block) => {
          const quote = quoteAsMarkdown(block.quote);
          const comments = this.pendingComments(block)
            .map((comment) => comment.text)
            .join('\n\n');
          return quote ? quote + '\n\n' + comments : comments;
        };
        // Transcript passages first, then one group per reviewed document with a
        // path heading, so a mixed review stays scannable in the sent message.
        const chatParts = [];
        const documentParts = new Map();
        for (const block of this.pendingBlocks()) {
          const part = renderBlock(block);
          if (!part) continue;
          const source = block.source;
          if (source && source.kind === 'document') {
            if (!documentParts.has(source.path)) documentParts.set(source.path, []);
            documentParts.get(source.path).push(part);
          } else {
            chatParts.push(part);
          }
        }
        const groups = [];
        if (chatParts.length > 0) groups.push(chatParts.join('\n\n'));
        for (const [path, parts] of documentParts) {
          groups.push(t('documentHeading', { path }) + '\n\n' + parts.join('\n\n'));
        }
        const body = groups.join('\n\n');
        if (!typed) return body;
        if (!body) return typed;
        // The composer's own typing sits under the blocks on screen, so it
        // lands last in the message too.
        return body + '\n\n' + typed;
      },

      /**
       * Send the composed message — one path only.
       *
       * The Session prompt is the harness's own send API: the composer is never
       * written to (except to clear what this send carried), there is no submit
       * race to lose, and queueing during a running turn stays the host's job.
       * A draft the prompt cannot carry (a file attachment) is refused with a
       * notice rather than falling back to a second, racy path.
       */
      sendNow() {
        if (this.sending) return;
        const session = this.session;
        if (!session) return;
        const actions = session.actions || {};
        const typed = this.liveDraft().trim();
        const text = this.compose();
        if (!text) return;
        const flags = this.blocks.map((block) => ({
          id: block.id,
          flags: (block.comments || []).map((comment) => comment.sent === true),
        }));
        let binding = null;
        try {
          binding =
            sessionsService && typeof sessionsService.binding === 'function'
              ? sessionsService.binding(session.sessionId)
              : null;
        } catch (error) {
          // A binding is only borrowable while the session is retained; a throw
          // here just means this send cannot use the direct path.
          console.error('quote-reply: session binding unavailable', error);
          binding = null;
        }
        const prompt =
          binding && binding.session && typeof binding.session.prompt === 'function'
            ? binding.session.prompt.bind(binding.session)
            : null;
        if (prompt === null) {
          // Profile without the sessions service: hand the text over instead of
          // pretending to send it. Submitting here would need a second code path
          // whose timing we cannot observe.
          this.writeDraft(text);
          this.markSent();
          this.setStatus('');
          this.notify();
          return;
        }
        const attachmentIds = this.attachmentIds === '' ? [] : this.attachmentIds.split(',');
        const token = ++this.sendSeq;
        this.sending = true;
        this.setStatus('sending');
        this.notify();
        // A prompt that never settles must not lock the send button forever.
        this.sendGuard = window.setTimeout(() => {
          this.sendGuard = 0;
          if (this.sendSeq !== token) return;
          // Invalidate the attempt: a settle that arrives after the watchdog must
          // not clear blocks the user has already been told stayed.
          this.sendSeq += 1;
          this.sending = false;
          this.setStatus('failed');
          this.notify();
        }, 30000);
        this.collectAttachmentParts(binding.session, attachmentIds)
          .then((collected) => {
            if (collected.sentIds.length < attachmentIds.length) {
              // A file attachment cannot become a prompt part: refuse, keep
              // everything, and say why.
              this.sending = false;
              this.setStatus('fileBlocked');
              this.notify();
              return null;
            }
            return Promise.resolve(prompt([{ type: 'text', text }, ...collected.parts], 'queue')).then(
              (result) => ({ result, collected }),
            );
          })
          .then(
            (settled) => {
              if (settled === null) return;
              const { result, collected } = settled;
              if (this.sendGuard) {
                window.clearTimeout(this.sendGuard);
                this.sendGuard = 0;
              }
              if (this.sendSeq !== token) return;
              this.sending = false;
              if (!result || result.ok !== true) {
                this.setSentFlags(flags);
                this.setStatus('failed');
                this.notify();
                return;
              }
              this.markSent();
              // The typed text travelled with the message, so it leaves the
              // composer. Clearing is unconditional: the published draft rarely
              // equals the trimmed capture byte for byte (trailing paragraphs,
              // placeholders), and gating on that equality left the text in the
              // input after a successful send. A short retry covers a host that
              // publishes the clear a frame later.
              if (typed !== '') {
                this.writeDraft('');
                this.clearTimer = window.setTimeout(() => {
                  this.clearTimer = 0;
                  if (this.cleanDraft().trim() !== '') this.writeDraft('');
                }, 150);
              }
              for (const id of collected.sentIds) {
                try {
                  if (typeof actions.removeAttachment === 'function') actions.removeAttachment(id);
                } catch (_error) {
                  /* the attachment rail is the host's; failing to prune is cosmetic */
                }
              }
              this.setStatus('');
              this.notify();
            },
            (error) => {
              console.error('quote-reply: prompt failed', error);
              if (this.sendGuard) {
                window.clearTimeout(this.sendGuard);
                this.sendGuard = 0;
              }
              if (this.sendSeq !== token) return;
              this.sending = false;
              this.setSentFlags(flags);
              this.setStatus('failed');
              this.notify();
            },
          );
      },

      /**
       * Read draft images into prompt content parts. A draft attachment the
       * session cannot read (a file receipt, an expired upload) is left in the
       * composer instead of failing the whole send.
       */
      collectAttachmentParts(session, ids) {
        if (ids.length === 0 || typeof session.readAttachment !== 'function') {
          return Promise.resolve({ parts: [], sentIds: [] });
        }
        return Promise.all(
          ids.map((id) =>
            Promise.resolve(session.readAttachment(id)).then(
              (result) => {
                if (!result || result.ok !== true) return { part: null, id };
                const { attachment, data } = result.value;
                let binary = '';
                const bytes = data || new Uint8Array(0);
                for (let index = 0; index < bytes.length; index += 0x8000) {
                  binary += String.fromCharCode.apply(null, bytes.subarray(index, index + 0x8000));
                }
                return {
                  id,
                  part: {
                    type: 'image',
                    mediaType: attachment.mediaType,
                    data: window.btoa(binary),
                    ...(attachment.name === undefined ? {} : { name: attachment.name }),
                  },
                };
              },
              () => ({ part: null, id }),
            ),
          ),
        ).then((results) => ({
          parts: results.filter((entry) => entry.part !== null).map((entry) => entry.part),
          sentIds: results.filter((entry) => entry.part !== null).map((entry) => entry.id),
        }));
      },

      /** One guarded draft write; no other path writes to the composer. */
      writeDraft(next) {
        const actions = (this.session && this.session.actions) || {};
        if (typeof actions.setDraft !== 'function') return false;
        try {
          actions.setDraft(next);
          this.draft = next;
          return true;
        } catch (error) {
          console.error('quote-reply: draft write failed', error);
          return false;
        }
      },

      /**
       * The host disables Submit while the draft looks empty. A zero-width
       * carrier keeps the standard button (and Enter) able to send nothing but
       * the pending notes; compose() strips it, and it leaves with the last note.
       */
      ensureCarrier() {
        if (!this.session) return;
        const tracked = String(this.draft || '');
        const pending = this.pendingBlocks().length > 0;
        if (pending) {
          if (tracked === '' && this.liveDraft().trim() === '') this.writeDraft('\u200B');
        } else if (tracked.includes('\u200B')) {
          this.writeDraft(tracked.replace(/\u200B/g, ''));
        }
      },

      /** One short-lived visible status; notices clear themselves. */
      setStatus(status) {
        if (this.statusTimer) {
          window.clearTimeout(this.statusTimer);
          this.statusTimer = 0;
        }
        this.status = status;
        if (status === '' || status === 'sending') return;
        this.statusTimer = window.setTimeout(() => {
          this.statusTimer = 0;
          this.status = '';
          this.notify();
        }, 4000);
      },

      focusComposer() {
        try {
          const seat = document.querySelector('[data-composer-seat]');
          const editable = seat && seat.querySelector('[contenteditable="true"]');
          if (editable && typeof editable.focus === 'function') editable.focus({ preventScroll: true });
        } catch (_error) {
          /* focus is a convenience, never a failure */
        }
      },
    };

    // ---------------------------------------------------------------- react glue

    function useSnapshot() {
      const [, force] = React.useState(0);
      React.useEffect(() => manager.subscribe(() => force((value) => value + 1)), []);
      return manager.snapshot();
    }

    // ---------------------------------------------------------------------- CSS

    const CSS = `
/* The Harness brand token is monochrome (white in the dark theme), so the
   accent is this plugin's own terracotta: it stays legible on both surfaces. */
[data-quote-reply-ui]{--dqr-accent:#d97757;--dqr-accent-ink:#ffffff;}
.dqr-pill{position:fixed;z-index:2147482000;pointer-events:auto;display:inline-flex;align-items:center;
  height:32px;padding:0 12px;box-sizing:border-box;
  border:1px solid var(--dsw-alias-border-l2, rgba(0,0,0,.12));
  border-radius:10px;background:var(--dsw-alias-bg-overlay, #fff);
  color:var(--dsw-alias-label-primary);font-family:inherit;font-size:12.5px;font-weight:500;line-height:1;
  letter-spacing:.01em;cursor:pointer;-webkit-user-select:none;user-select:none;white-space:nowrap;
  box-shadow:0 12px 34px rgba(0,0,0,.18),0 2px 6px rgba(0,0,0,.10);
  animation:dqr-pop .13s cubic-bezier(.2,.8,.3,1) both;}
.dqr-pill:hover{background:var(--dsw-alias-bg-layer-1, #f7f7f5);}
/* Quick-review bar: the selection surface of this fork. One chip per preset
   plus the custom reply and the plain quote action. */
.dqr-qbar{position:fixed;z-index:2147482000;pointer-events:auto;display:flex;flex-wrap:wrap;
  align-items:center;gap:2px;box-sizing:border-box;max-width:calc(100vw - 16px);padding:4px;
  border:1px solid var(--dsw-alias-border-l2, rgba(0,0,0,.12));border-radius:12px;
  background:var(--dsw-alias-bg-overlay, #fff);color:var(--dsw-alias-label-primary);
  font-family:inherit;font-size:12.5px;font-weight:500;line-height:1;
  -webkit-user-select:none;user-select:none;
  box-shadow:0 12px 34px rgba(0,0,0,.18),0 2px 6px rgba(0,0,0,.10);
  animation:dqr-fade .13s cubic-bezier(.2,.8,.3,1) both;}
.dqr-qchip{display:inline-flex;align-items:center;height:28px;padding:0 9px;box-sizing:border-box;
  border:0;border-radius:8px;background:transparent;color:var(--dsw-alias-label-primary);
  font:inherit;cursor:pointer;white-space:nowrap;}
.dqr-qchip:hover{background:var(--dsw-alias-interactive-bg-hover, rgba(127,127,127,.12));}
.dqr-qchip:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px;}
.dqr-qsep{width:1px;align-self:stretch;margin:3px 2px;background:var(--dsw-alias-border-l1);}
.dqr-qchips{display:flex;flex-wrap:wrap;gap:2px;margin:-1px -4px 0;}
.dqr-ccard-actions{display:flex;align-items:center;justify-content:flex-end;margin:-4px -4px -3px;}
.dqr-ccard .dqr-quote{max-height:52px;}
.dqr-note{display:inline-flex;align-items:center;gap:6px;flex:0 0 auto;max-width:290px;height:26px;
  padding:0 4px 0 8px;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;
  background:color-mix(in srgb, var(--dsw-alias-label-primary) 6%,
    var(--dsw-specific-input-major, var(--dsw-alias-bg-layer-2)));
  color:var(--dsw-alias-label-primary);font-size:11.5px;line-height:1;cursor:pointer;}
.dqr-note:hover{border-color:var(--dsw-alias-border-l2);}
.dqr-note-quote{flex:0 0 auto;color:var(--dqr-accent);font-size:12px;line-height:1;}
.dqr-note-doc{flex:0 0 auto;max-width:110px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;
  padding:0 6px;height:16px;line-height:16px;border-radius:6px;font-size:10px;font-weight:600;
  background:color-mix(in srgb, var(--dqr-accent) 14%, transparent);color:var(--dqr-accent);}
.dqr-note-text{max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.dqr-note-comment{max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;
  color:var(--dsw-alias-label-secondary);}
.dqr-note-count{flex:0 0 auto;color:var(--dqr-accent);font-size:10px;font-weight:600;}
.dqr-note-del{width:16px;height:16px;flex:0 0 auto;opacity:.55;}
.dqr-note:hover .dqr-note-del{opacity:1;}
.dqr-strip-clear{flex:0 0 auto;height:22px;padding:0 6px;border:0;border-radius:6px;background:transparent;
  color:var(--dsw-alias-label-secondary);font:inherit;font-size:11px;cursor:pointer;white-space:nowrap;}
.dqr-strip-clear:hover{background:var(--dsw-alias-interactive-bg-hover, rgba(127,127,127,.12));
  color:var(--dsw-alias-label-primary);}
.dqr-mini{position:fixed;z-index:2147482000;pointer-events:auto;display:flex;flex-direction:column;gap:3px;
  box-sizing:border-box;width:max-content;min-width:280px;max-width:min(420px, calc(100vw - 16px));padding:5px;
  border:1px solid rgba(255,255,255,.22);border-radius:14px;background:#14171b;color:#f4f5f7;
  font-family:inherit;font-size:12.5px;font-weight:500;line-height:1;
  -webkit-user-select:none;user-select:none;
  box-shadow:0 12px 34px rgba(0,0,0,.5),0 2px 8px rgba(0,0,0,.25), inset 0 1px 0 rgba(255,255,255,.06);
  animation:dqr-fade .13s cubic-bezier(.2,.8,.3,1) both;}
.dqr-mini-row{display:flex;align-items:center;gap:2px;overflow-x:auto;overflow-y:hidden;scrollbar-width:thin;}
.dqr-mini .dqr-qchip{height:26px;padding:0 8px;background:rgba(255,255,255,.07);color:#f4f5f7;border-radius:7px;}
.dqr-mini .dqr-qchip:hover{background:rgba(255,255,255,.13);}
.dqr-mini .dqr-qchip-quote{width:26px;justify-content:center;padding:0;background:transparent;}
.dqr-mini-field{padding-top:4px;border-top:1px solid rgba(255,255,255,.1);overflow:visible;}
.dqr-mini-input{flex:1 1 auto;min-width:0;height:26px;padding:0 6px;border:0;outline:0;background:transparent;
  color:#f4f5f7;font:inherit;font-size:12.5px;font-weight:400;caret-color:var(--dqr-accent);}
.dqr-mini-input::placeholder{color:rgba(255,255,255,.45);opacity:1;}
.dqr-sendicon-sm{width:24px;height:24px;flex:0 0 auto;}
.dqr-mini .dqr-qchip-add{position:static;background:transparent;color:var(--dqr-accent);}
.dqr-mini .dqr-mic{width:26px;justify-content:center;padding:0;background:transparent;color:#f4f5f7;}
.dqr-mini .dqr-mic-live{color:var(--dsw-alias-state-error-primary);}
.dqr-mini .dqr-exit{color:rgba(255,255,255,.55);background:transparent;}
.dqr-mini .dqr-exit:hover{color:#f4f5f7;}
.dqr-mini .dqr-tool{color:rgba(255,255,255,.55);}
.dqr-mini .dqr-tool:hover{background:rgba(255,255,255,.12);color:#f4f5f7;}
.dqr-mini .dqr-sendicon:disabled{color:rgba(255,255,255,.28);}
.dqr-review-pill{position:fixed;z-index:2147482000;pointer-events:auto;display:grid;place-items:center;
  width:24px;height:24px;padding:0;box-sizing:border-box;border-radius:50%;
  background:#14171b;border:1px solid rgba(255,255,255,.22);color:#f4f5f7;
  cursor:pointer;opacity:.9;box-shadow:0 2px 10px rgba(0,0,0,.4), inset 0 1px 0 rgba(255,255,255,.07);
  transition:opacity .12s ease,border-color .12s ease,box-shadow .12s ease,transform .12s ease;
  -webkit-user-select:none;user-select:none;
  animation:dqr-fade .13s cubic-bezier(.2,.8,.3,1) both;}
.dqr-review-pill:hover{opacity:1;border-color:rgba(255,255,255,.42);
  box-shadow:0 4px 14px rgba(0,0,0,.5), inset 0 1px 0 rgba(255,255,255,.1);}
.dqr-review-pill:active{transform:scale(.94);}
.dqr-qchips-row{display:flex;flex-wrap:nowrap;gap:2px;overflow-x:auto;overflow-y:hidden;
  margin:-1px -4px 0;padding-bottom:2px;scrollbar-width:thin;}
.dqr-qchip-fixed{flex:0 0 auto;max-width:132px;min-width:0;overflow:hidden;}
.dqr-qchip-label{display:block;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.dqr-qchip-add{flex:0 0 auto;color:var(--dqr-accent);font-size:14px;font-weight:600;padding:0 8px;}
.dqr-field-clear{flex:0 0 auto;margin:0 0 6px 2px;color:var(--dsw-alias-label-secondary);}
.dqr-hcomment-del{flex:0 0 auto;width:16px;height:16px;margin-top:1px;opacity:.55;}
.dqr-hcomment:hover .dqr-hcomment-del{opacity:1;}
.dqr-menu{width:min(230px,calc(100vw - 24px));padding:6px;gap:2px;z-index:2147482002;}
.dqr-menu-title{font-size:11px;line-height:1.4;color:rgba(255,255,255,.55);padding:3px 7px 5px;
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.dqr-menu-item{display:flex;align-items:center;width:100%;height:28px;padding:0 8px;border:0;border-radius:7px;
  background:transparent;color:#f4f5f7;font:inherit;font-size:12.5px;text-align:left;cursor:pointer;}
.dqr-menu-item:hover{background:rgba(255,255,255,.1);}
.dqr-menu-danger{color:var(--dsw-alias-state-error-primary, #d9534f);}
.dqr-menu-confirm{padding:2px 7px 4px;font-size:12px;line-height:1.45;color:rgba(255,255,255,.55);}
.dqr-menu-row{display:flex;gap:4px;}
.dqr-menu-row .dqr-menu-item{justify-content:center;}
.dqr-editor{width:min(330px,calc(100vw - 24px));padding:11px 12px;gap:8px;}
.dqr-editor-field{display:flex;flex-direction:column;gap:3px;}
.dqr-editor-label{font-size:10.5px;color:rgba(255,255,255,.55);}
.dqr-editor-input{box-sizing:border-box;width:100%;height:28px;padding:0 8px;border:1px solid var(--dsw-alias-border-l1);
  border-radius:7px;background:rgba(255,255,255,.06);
  color:#f4f5f7;font:inherit;font-size:12.5px;outline:0;}
.dqr-editor-input:focus{border-color:var(--dqr-accent);}
.dqr-editor-actions{display:flex;justify-content:flex-end;gap:6px;padding-top:2px;}
.dqr-editor-btn{height:26px;padding:0 11px;border:0;border-radius:7px;background:var(--dqr-accent);color:#fff;
  font:inherit;font-size:12px;cursor:pointer;}
.dqr-editor-btn:disabled{opacity:.5;cursor:default;}
.dqr-editor-btn-ghost{background:transparent;color:rgba(255,255,255,.6);}
.dqr-editor-btn-ghost:hover{background:rgba(255,255,255,.08);color:#f4f5f7;}
.dqr-clear{flex:0 0 auto;align-self:center;height:26px;margin-left:auto;padding:0 10px;border:0;border-radius:7px;
  background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:11.5px;cursor:pointer;}
.dqr-clear:hover{background:var(--dsw-alias-interactive-bg-hover, rgba(127,127,127,.12));
  color:var(--dsw-alias-label-primary);}
.dqr-clear-armed{color:var(--dsw-alias-state-warn-primary, #b35309);
  background:color-mix(in srgb, var(--dqr-accent) 12%, transparent);}
.dqr-qchip-add{position:sticky;right:-2px;z-index:1;
  background:var(--dsw-alias-bg-overlay, var(--dsw-alias-bg-layer-1));}
.dqr-pop{position:fixed;z-index:2147482001;pointer-events:auto;box-sizing:border-box;display:flex;
  flex-direction:column;gap:10px;padding:13px 14px 11px;border:1px solid rgba(255,255,255,.22);
  border-radius:14px;background:#14171b;color:#f4f5f7;
  font-family:inherit;width:min(${POPOVER_WIDTH}px, calc(100vw - 24px));
  box-shadow:0 24px 60px rgba(0,0,0,.5),0 3px 10px rgba(0,0,0,.2), inset 0 1px 0 rgba(255,255,255,.06);
  animation:dqr-fade .12s ease-out both;}
.dqr-quote{position:relative;max-height:66px;overflow:hidden;padding-left:11px;
  color:rgba(255,255,255,.6);font-size:12.5px;line-height:1.6;white-space:pre-wrap;
  word-break:break-word;overflow-wrap:anywhere;
  display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;}
.dqr-quote::before{content:'';position:absolute;left:0;top:2px;bottom:2px;width:2px;border-radius:2px;
  background:var(--dqr-accent);opacity:.85;}
.dqr-row{display:flex;align-items:flex-end;gap:10px;padding-top:10px;
  border-top:1px solid rgba(255,255,255,.1);}
.dqr-input{box-sizing:border-box;flex:1 1 auto;width:100%;min-height:24px;max-height:200px;padding:2px 0;
  border:0;outline:0;resize:none;background:transparent;color:#f4f5f7;
  font-family:inherit;font-size:13.5px;line-height:1.6;overflow-y:auto;caret-color:var(--dqr-accent);}
.dqr-input::placeholder{color:rgba(255,255,255,.45);opacity:1;}
.dqr-sendicon{flex:0 0 auto;box-sizing:border-box;width:28px;height:28px;padding:0;border:0;border-radius:50%;
  display:grid;place-items:center;background:var(--dqr-accent);color:#fff;cursor:pointer;
  box-shadow:0 1px 2px rgba(0,0,0,.18);transition:filter .12s ease,background .12s ease;}
.dqr-sendicon:disabled{background:transparent;color:var(--dsw-alias-label-secondary);opacity:.45;
  box-shadow:none;cursor:default;}
.dqr-sendicon:not(:disabled):hover{filter:brightness(1.07);}
.dqr-hint{color:rgba(255,255,255,.55);font-size:11px;line-height:1.4;opacity:1;}
.dqr-strip{box-sizing:border-box;display:flex;flex-wrap:nowrap;align-items:center;gap:5px;
  width:calc(100% - var(--dsh-composer-side-clearance, 6px) * 2);
  max-width:var(--dsh-composer-card-max-width, 100%);
  margin:0 auto calc(-8px - var(--dsh-composer-stack-gap, 6px));padding:5px 7px;
  background:var(--dsw-specific-input-major, var(--dsw-alias-bg-layer-1));
  border-radius:var(--dsw-radius-panel, 14px) var(--dsw-radius-panel, 14px) 0 0;
  position:relative;z-index:2;overflow-x:auto;overflow-y:hidden;scrollbar-width:thin;}
/* 76 = 2 border + 7 top + 4 bottom padding + 30 quote + 3 gap + 30 answer.
   The gap is what separates a full quote from a full answer; the bottom keeps
   only the padding, so a two-line answer sits flush instead of floating. */
.dqr-tile{position:relative;flex:0 0 auto;box-sizing:border-box;width:76px;height:76px;padding:7px 7px 4px;
  border:1px solid rgba(255,255,255,.12);border-radius:12px;
  background:var(--dsw-alias-bg-layer-2, var(--dsw-alias-bg-layer-1));
  /* Lift whichever way the theme goes: 7% of the text colour over the card. */
  background:color-mix(in srgb, var(--dsw-alias-label-primary) 7%,
    var(--dsw-specific-input-major, var(--dsw-alias-bg-layer-2)));
  box-shadow:0 1px 2px rgba(0,0,0,.06);overflow:hidden;}
.dqr-tile:hover{border-color:var(--dsw-alias-border-l2);}
.dqr-tile-quote{box-sizing:border-box;height:30px;overflow:hidden;}
.dqr-tile-quote-text{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;
  padding-left:6px;border-left:2px solid var(--dqr-accent);color:var(--dsw-alias-label-secondary);
  font-size:10.5px;line-height:15px;word-break:break-word;overflow-wrap:anywhere;}
.dqr-tile-reply{box-sizing:border-box;height:30px;margin-top:3px;
  display:flex;flex-direction:column;justify-content:flex-end;
  overflow:hidden;color:var(--dsw-alias-label-primary);font-size:10.5px;line-height:15px;}
.dqr-tile-reply-text{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;
  word-break:break-word;overflow-wrap:anywhere;}
.dqr-tile-tools{position:absolute;top:2px;right:2px;display:flex;gap:1px;padding:1px;border-radius:6px;
  background:var(--dsw-alias-bg-layer-2, var(--dsw-alias-bg-overlay));opacity:0;
  transition:opacity .12s ease;box-shadow:0 1px 2px rgba(0,0,0,.10);}
.dqr-tile:hover .dqr-tile-tools,.dqr-tile:focus-within .dqr-tile-tools{opacity:1;}
.dqr-msg-quote{display:inline-block;box-sizing:border-box;width:100%;margin:1px 0;padding-left:10px;border-left:2px solid;
  border-color:var(--dsw-alias-border-l2, color-mix(in srgb, currentColor 35%, transparent));
  color:var(--dsw-alias-label-secondary);}
.dqr-more{display:inline-block;margin:2px 0 0;padding:0;border:0;background:none;
  color:var(--dqr-accent);font:inherit;font-size:12.5px;line-height:1.5;cursor:pointer;
  text-decoration:underline;text-underline-offset:2px;}
.dqr-more:hover{filter:brightness(1.1);}
.dqr-tool{width:18px;height:18px;display:grid;place-items:center;padding:0;border:0;border-radius:5px;
  background:transparent;color:rgba(255,255,255,.55);cursor:pointer;}
.dqr-tool:hover{background:rgba(255,255,255,.12);
  color:#f4f5f7;}
.dqr-send{flex:0 0 auto;align-self:center;margin-left:auto;height:28px;padding:0 13px;border:0;border-radius:8px;
  background:var(--dqr-accent);color:var(--dqr-accent-ink);font-family:inherit;font-size:12px;font-weight:500;
  line-height:1;cursor:pointer;box-shadow:0 1px 2px rgba(0,0,0,.16);}
.dqr-send:hover{filter:brightness(1.07);}
.dqr-send:disabled{opacity:.55;cursor:default;filter:none;}
.dqr-status{margin-left:auto;align-self:center;font-size:11.5px;line-height:1.4;
  color:var(--dsw-alias-label-secondary);}
.dqr-status-failed{color:var(--dsw-alias-state-warn-primary, var(--dsw-alias-label-secondary));}
.dqr-status + .dqr-send{margin-left:8px;}
::highlight(dqr-review-pending){background-color:rgba(217,119,87,.30);}
::highlight(dqr-review-logged){background-color:rgba(217,119,87,.13);}
::highlight(dqr-review-hover){background-color:rgba(217,119,87,.45);}
.dqr-hcard{gap:9px;}
.dqr-hcard-head{display:flex;align-items:flex-start;gap:6px;}
.dqr-hcard-quote{flex:1 1 auto;min-width:0;max-height:20px;overflow:hidden;text-overflow:ellipsis;
  white-space:nowrap;font-size:12px;color:rgba(255,255,255,.6);}
.dqr-hcard-close{flex:0 0 auto;width:20px;height:20px;margin:1px 0 0 auto;}
.dqr-hcard-comments{display:flex;flex-direction:column;gap:7px;max-height:168px;overflow-y:auto;
  padding:1px 2px 1px 0;scrollbar-width:thin;}
.dqr-hcomment{display:flex;align-items:flex-start;gap:7px;font-size:12.5px;line-height:1.55;
  color:#f4f5f7;}
.dqr-hcomment-mark{flex:0 0 auto;display:grid;place-items:center;width:15px;height:15px;margin-top:1px;
  border-radius:50%;background:color-mix(in srgb, var(--dqr-accent) 18%, transparent);
  color:var(--dqr-accent);font-size:10px;font-weight:600;line-height:1;}
.dqr-hcomment-text{flex:1 1 auto;min-width:0;white-space:pre-wrap;word-break:break-word;overflow-wrap:anywhere;}
.dqr-hcomment-pending{flex:0 0 auto;color:var(--dqr-accent);font-size:14px;line-height:1.1;}
.dqr-hcard-empty{color:rgba(255,255,255,.55);font-size:12px;line-height:1.5;}
.dqr-hcard-foot{display:flex;justify-content:flex-end;margin:-2px -4px -3px;}
.dqr-hcard-foot .dqr-qchip{background:rgba(255,255,255,.07);color:#f4f5f7;border-radius:7px;}
.dqr-hcard-foot .dqr-qchip:hover{background:rgba(255,255,255,.13);}
@keyframes dqr-fade{from{opacity:0;}to{opacity:1;}}
@keyframes dqr-pop{from{opacity:0;transform:translate(-50%,2px) scale(.94);}
  to{opacity:1;transform:translate(-50%,0) scale(1);}}
`;

    // ---------------------------------------------------------------- components

    function clamp(value, min, max) {
      return Math.min(Math.max(value, min), Math.max(min, max));
    }

    /**
     * Above the first line of the selection, a few pixels off it and centred on
     * that line — a tooltip anchored to where the eye starts, not to the middle
     * of a tall multi-line selection.
     */
    function pillPosition(target) {
      const height = 32;
      const gap = 6;
      const margin = 8;
      const line = target.line || target.rect;
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const placeAbove = line.top - height - gap >= margin;
      const raw = placeAbove ? line.top - height - gap : line.top + (line.height || 20) + gap;
      return {
        top: clamp(raw, margin, viewportHeight - height - margin),
        left: clamp(line.left + line.width / 2, 52, viewportWidth - 52),
        placement: placeAbove ? 'above' : 'below',
      };
    }

    function popoverPosition(rect) {
      const margin = 12;
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const width = Math.min(POPOVER_WIDTH, viewportWidth - margin * 2);
      const center = rect.left + rect.width / 2;
      const left = clamp(center - width / 2, margin, viewportWidth - width - margin);
      const below = rect.bottom + 8;
      const above = rect.top - 8;
      const placeAbove = viewportHeight - below < 250 && above > 250;
      return {
        left,
        top: placeAbove ? above : below,
        transform: placeAbove ? 'translateY(-100%)' : 'none',
      };
    }

    /**
     * The selection surface of the review workflow: a comment card anchored to
     * the passage. Quick presets fill the comment; any custom note can be typed
     * and added with Enter. Every addition becomes one numbered review note
     * above the composer; one message sends the whole review.
     * @param props - the manager target (selected text and its geometry).
     * @returns the floating comment card.
     */
    /**
     * Standby-mode hint: a small, unobtrusive button beside the selection that
     * enters review mode. It never takes focus, so a plain selection still copies
     * natively; review mode (and its focused field) begins only on click.
     */
    function ReviewPill({ target }) {
      const ref = React.useRef(null);
      const [position, setPosition] = React.useState(null);

      React.useLayoutEffect(() => {
        const element = ref.current;
        if (!element) return;
        const point = target.line || target.rect || target.start;
        if (!point) return;
        const margin = 6;
        const width = element.offsetWidth || 22;
        const height = element.offsetHeight || 22;
        // Hang above-left of the selection's top corner on a 45° diagonal, sitting
        // over the text it would annotate.
        const shiftLeft = 32;
        const liftUp = 14;
        const above = point.top - height - liftUp >= margin;
        const rawTop = above ? point.top - height - liftUp : point.top + (point.height || 18) + liftUp;
        const top = Math.min(
          Math.max(rawTop, margin),
          Math.max(margin, window.innerHeight - height - margin),
        );
        const left = Math.min(
          Math.max(point.left - shiftLeft, margin),
          Math.max(margin, window.innerWidth - width - margin),
        );
        if (Number.isFinite(top) && Number.isFinite(left)) setPosition({ top, left });
      }, [target]);

      return h(
        'button',
        {
          ref,
          type: 'button',
          className: 'dqr-review-pill',
          'data-quote-reply-ui': '',
          title: t('enterReview'),
          'aria-label': t('enterReview'),
          style: position
            ? { top: position.top, left: position.left }
            : { top: 0, left: 0, visibility: 'hidden' },
          onMouseDown: (event) => event.preventDefault(),
          onClick: () => manager.enterReviewMode(),
        },
        h(ReviewGlyph, null),
      );
    }

    /**
     * The compact selection bar. It anchors to the point where the drag started
     * and stays one line: a preset adds its note at once, the pencil reveals a
     * single-line comment field, and "+" opens the new-action editor.
     */
    function QuickBar({ target }) {
      const state = useSnapshot();
      const actions = state.actions || [];
      const ref = React.useRef(null);
      const inputRef = React.useRef(null);
      const [position, setPosition] = React.useState(null);
      const [value, setValue] = React.useState('');

      // Keep the bar alive while the field owns focus: the browser collapses the
      // transcript selection as soon as the field is focused.
      React.useLayoutEffect(() => {
        manager.cardOpen = true;
        return () => {
          manager.cardOpen = false;
          manager.setCardDraft('');
        };
      }, []);

      // Anchor to the selection's top line (a rect that really exists on the
      // transcript), left-aligned and clamped only to the window. The bar stays
      // hidden until a finite position resolves, so a bad anchor can never flash.
      React.useLayoutEffect(() => {
        const element = ref.current;
        if (!element) return;
        const point = target.line || target.rect || target.start;
        if (!point) return;
        const margin = 8;
        const gap = 6;
        const width = element.offsetWidth || 320;
        const height = element.offsetHeight || 64;
        const above = point.top - height - gap >= margin;
        const rawTop = above ? point.top - height - gap : point.top + (point.height || 18) + gap;
        const top = Math.min(
          Math.max(rawTop, margin),
          Math.max(margin, window.innerHeight - height - margin),
        );
        const left = Math.min(
          Math.max(point.left, margin),
          Math.max(margin, window.innerWidth - width - margin),
        );
        if (Number.isFinite(top) && Number.isFinite(left)) setPosition({ top, left });
      }, [target, actions.length, value]);

      // Focus the field once the bar is actually visible (a hidden input cannot
      // take focus), and again on every new selection, so the OS dictation and
      // the keyboard land in the comment field immediately.
      React.useEffect(() => {
        const element = inputRef.current;
        if (element) element.focus({ preventScroll: true });
      }, [position]);

      // A new passage must not inherit the previous passage's draft.
      React.useEffect(() => {
        setValue('');
        manager.setCardDraft('');
      }, [target.text]);

      const updateValue = (next) => {
        setValue(next);
        manager.setCardDraft(next);
      };

      const applyPreset = (action) => {
        const phrase = String(action.text || '').trim();
        if (phrase === '') return;
        manager.addBlock(target.text, phrase);
      };

      const addComment = () => {
        const comment = value.trim();
        if (comment === '' || !manager.addBlock(target.text, comment)) return;
        manager.cardOpen = false;
      };

      const clearField = () => {
        updateValue('');
        const element = inputRef.current;
        if (element) element.focus({ preventScroll: true });
      };

      const onKeyDown = (event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          manager.clearTarget();
          return;
        }
        if (event.key !== 'Enter' || event.shiftKey) return;
        const native = event.nativeEvent || {};
        if (native.isComposing || event.keyCode === 229) return;
        event.preventDefault();
        event.stopPropagation();
        addComment();
      };

      const insertQuote = () => {
        const sessionActions = manager.session && manager.session.actions;
        if (!sessionActions || typeof sessionActions.insertQuote !== 'function') return;
        if (!sessionActions.insertQuote(target.text)) return;
        manager.clearTarget();
        try {
          const selection = window.getSelection();
          if (selection) selection.removeAllRanges();
        } catch (_error) {
          /* ignore */
        }
      };

      const openAddAction = (event) => {
        const button = event.currentTarget;
        const rect = button && button.getBoundingClientRect ? button.getBoundingClientRect() : null;
        if (!rect) return;
        manager.openActionEditor(null, rect.left + rect.width / 2, rect.bottom + 4, value.trim());
      };

      const actionChip = (action) => {
        const label = action.label || action.text;
        return h(
          'button',
          {
            key: action.id,
            type: 'button',
            className: 'dqr-qchip dqr-qchip-fixed',
            style: { fontSize: chipFontSize(label) },
            title: action.text,
            onMouseDown: (event) => event.preventDefault(),
            onClick: () => applyPreset(action),
            onContextMenu: (event) => {
              event.preventDefault();
              event.stopPropagation();
              manager.openChipMenu(action.id, event.clientX, event.clientY);
            },
          },
          h('span', { className: 'dqr-qchip-label' }, label),
        );
      };

      return h(
        'div',
        {
          ref,
          className: 'dqr-mini',
          'data-quote-reply-ui': '',
          role: 'toolbar',
          'aria-label': t('toolbar'),
          style: position
            ? { top: position.top, left: position.left }
            : { top: 0, left: 0, visibility: 'hidden' },
          onMouseDown: (event) => event.stopPropagation(),
        },
        h(
          'div',
          { className: 'dqr-mini-row' },
          ...actions.map(actionChip),
          h(
            'button',
            {
              type: 'button',
              className: 'dqr-qchip dqr-qchip-add',
              title: t('addAction'),
              'aria-label': t('addAction'),
              onMouseDown: (event) => event.preventDefault(),
              onClick: openAddAction,
            },
            '+',
          ),
          h(
            'button',
            {
              type: 'button',
              className: 'dqr-qchip dqr-qchip-quote',
              title: t('quote'),
              'aria-label': t('quote'),
              onMouseDown: (event) => event.preventDefault(),
              onClick: insertQuote,
            },
            h(QuoteGlyph, null),
          ),
          h(
            'button',
            {
              type: 'button',
              className: 'dqr-qchip dqr-exit',
              title: t('exitReview'),
              'aria-label': t('exitReview'),
              onMouseDown: (event) => event.preventDefault(),
              onClick: () => manager.exitReviewMode(),
            },
            h(ExitGlyph, null),
          ),
        ),
        h(
          'div',
          { className: 'dqr-mini-row dqr-mini-field' },
          h('input', {
            ref: inputRef,
            className: 'dqr-mini-input',
            value,
            placeholder: t('placeholder'),
            spellCheck: false,
            onChange: (event) => updateValue(event.target.value),
            onKeyDown,
          }),
          h(MicButton, { value, onText: updateValue, label: t('dictate') }),
          value.trim() === ''
            ? null
            : h(
                'button',
                {
                  type: 'button',
                  className: 'dqr-tool',
                  title: t('clearField'),
                  'aria-label': t('clearField'),
                  onMouseDown: (event) => event.preventDefault(),
                  onClick: clearField,
                },
                h(CrossGlyph, null),
              ),
          h(
            'button',
            {
              type: 'button',
              className: 'dqr-sendicon dqr-sendicon-sm',
              disabled: value.trim() === '',
              title: t('add'),
              'aria-label': t('add'),
              onMouseDown: (event) => event.preventDefault(),
              onClick: addComment,
            },
            h(ArrowUpGlyph, null),
          ),
        ),
      );
    }

    function QuotePopover({ data }) {
      const [value, setValue] = React.useState(data.reply || '');
      const inputRef = React.useRef(null);
      const position = popoverPosition(data.rect);
      const editing = data.blockId !== null;

      React.useEffect(() => {
        const element = inputRef.current;
        if (!element) return;
        element.focus({ preventScroll: true });
        const end = element.value.length;
        try {
          element.setSelectionRange(end, end);
        } catch (_error) {
          /* ignore */
        }
      }, []);

      React.useEffect(() => {
        const element = inputRef.current;
        if (!element) return;
        element.style.height = 'auto';
        element.style.height = `${Math.min(element.scrollHeight, 200)}px`;
      }, [value]);

      const canCommit = value.trim().length > 0;
      const submit = () => {
        if (!canCommit) return;
        manager.commit(value);
      };

      const onKeyDown = (event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          manager.closePopover();
          return;
        }
        if (event.key === 'Enter' && !event.shiftKey) {
          const native = event.nativeEvent || {};
          if (native.isComposing || event.keyCode === 229) return;
          event.preventDefault();
          submit();
        }
      };

      return h(
        'div',
        {
          className: 'dqr-pop',
          'data-quote-reply-ui': '',
          role: 'dialog',
          'aria-label': t('quote'),
          style: position,
          onMouseDown: (event) => event.stopPropagation(),
        },
        h('div', { className: 'dqr-quote' }, data.quote),
        h(
          'div',
          { className: 'dqr-row' },
          h('textarea', {
            ref: inputRef,
            className: 'dqr-input',
            value,
            rows: 1,
            placeholder: t('placeholder'),
            spellCheck: false,
            onChange: (event) => setValue(event.target.value),
            onKeyDown,
          }),
          h(
            'button',
            {
              type: 'button',
              className: 'dqr-sendicon',
              disabled: !canCommit,
              title: editing ? t('save') : t('add'),
              'aria-label': editing ? t('save') : t('add'),
              onMouseDown: (event) => event.preventDefault(),
              onClick: submit,
            },
            h(ArrowUpGlyph, null),
          ),
        ),
        h('div', { className: 'dqr-hint' }, editing ? t('hintSave') : t('hintAdd')),
      );
    }

    function ArrowUpGlyph() {
      return h(
        'svg',
        { width: 14, height: 14, viewBox: '0 0 16 16', 'aria-hidden': 'true', style: { display: 'block' } },
        h('path', {
          fill: 'currentColor',
          d: 'M8.6 3.1v8.4H7.4V3.1L4.2 6.3 3.4 5.5 8 0.9l4.6 4.6-.8.8-3.2-3.2Z',
        }),
      );
    }

    function QuoteGlyph() {
      return h(
        'svg',
        { width: 14, height: 14, viewBox: '0 0 16 16', 'aria-hidden': 'true', style: { display: 'block' } },
        h('path', {
          fill: 'currentColor',
          d: 'M4.6 3.2C3 4 2.2 5.4 2.2 7c0 1.1.8 1.9 1.8 1.9.9 0 1.6-.6 1.6-1.5 0-.8-.6-1.4-1.4-1.4h-.2c.2-.7.8-1.3 1.6-1.8l-1-1Zm6.2 0C9.2 4 8.4 5.4 8.4 7c0 1.1.8 1.9 1.8 1.9.9 0 1.6-.6 1.6-1.5 0-.8-.6-1.4-1.4-1.4h-.2c.2-.7.8-1.3 1.6-1.8l-1-1Z',
        }),
      );
    }

    function ReviewGlyph() {
      return h(
        'svg',
        {
          width: 13,
          height: 13,
          viewBox: '0 0 16 16',
          'aria-hidden': 'true',
          style: { display: 'block' },
          fill: 'none',
          stroke: 'currentColor',
          'stroke-width': 1.5,
          'stroke-linecap': 'round',
          'stroke-linejoin': 'round',
        },
        h('path', { d: 'M11.6 2.4a1.8 1.8 0 0 1 2.5 2.5l-8.3 8.3-3.5.9.9-3.5 8.4-8.2Z' }),
        h('path', { d: 'm10.2 3.8 2 2' }),
      );
    }

    function CrossGlyph() {
      return h(
        'svg',
        { width: 12, height: 12, viewBox: '0 0 16 16', 'aria-hidden': 'true', style: { display: 'block' } },
        h('path', {
          fill: 'currentColor',
          d: 'M8 6.9 4.9 3.8 3.8 4.9 6.9 8l-3.1 3.1 1.1 1.1L8 9.1l3.1 3.1 1.1-1.1L9.1 8l3.1-3.1-1.1-1.1L8 6.9Z',
        }),
      );
    }

    function MicGlyph() {
      return h(
        'svg',
        { width: 12, height: 12, viewBox: '0 0 16 16', 'aria-hidden': 'true', style: { display: 'block' } },
        h('path', {
          fill: 'currentColor',
          d: 'M8 1a2.6 2.6 0 0 1 2.6 2.6v3.2A2.6 2.6 0 0 1 8 9.4 2.6 2.6 0 0 1 5.4 6.8V3.6A2.6 2.6 0 0 1 8 1Zm-1 2.6v3.2a1 1 0 0 0 2 0V3.6a1 1 0 0 0-2 0ZM3.5 7a.75.75 0 0 1 .75.75A3.75 3.75 0 0 0 8 11.5a3.75 3.75 0 0 0 3.75-3.75A.75.75 0 0 1 13.25 7 5.25 5.25 0 0 1 8.75 12.2V14h1.5a.75.75 0 0 1 0 1.5h-4.5a.75.75 0 0 1 0-1.5h1.5v-1.8A5.25 5.25 0 0 1 2.75 7 .75.75 0 0 1 3.5 7Z',
        }),
      );
    }

    function ExitGlyph() {
      return h(
        'svg',
        { width: 14, height: 14, viewBox: '0 0 16 16', 'aria-hidden': 'true', style: { display: 'block' } },
        h('path', {
          fill: 'currentColor',
          d: 'M8 1a.85.85 0 0 1 .85.85v5.3a.85.85 0 0 1-1.7 0V1.85A.85.85 0 0 1 8 1Zm3.4 3.1a.85.85 0 0 1 1.05.4 6 6 0 1 1-8.9 0 .85.85 0 1 1 1.05.4 4.3 4.3 0 1 0 6.8 0 .85.85 0 0 1 0-.8Z',
        }),
      );
    }

    /**
     * Dictation toggle. In a Chrome-based Web UI the browser's SpeechRecognition
     * transcribes straight into the field; where the browser ships no speech
     * service (Electron desktop), the button keeps the field focused so the OS
     * dictation writes into it, and its tooltip says so.
     */
    function MicButton({ value, onText, label }) {
      const [listening, setListening] = React.useState(false);
      const recognitionRef = React.useRef(null);
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      const canDictate = typeof SpeechRecognition === 'function';

      React.useEffect(
        () => () => {
          const recognition = recognitionRef.current;
          if (recognition) {
            try {
              recognition.stop();
            } catch (_error) {
              /* ignore */
            }
          }
        },
        [],
      );

      const stop = () => {
        const recognition = recognitionRef.current;
        if (recognition) {
          try {
            recognition.stop();
          } catch (_error) {
            /* ignore */
          }
        }
      };

      const toggle = () => {
        if (!canDictate) return;
        if (listening) {
          stop();
          return;
        }
        const recognition = new SpeechRecognition();
        recognition.lang = (document.documentElement && document.documentElement.lang) || 'ru-RU';
        recognition.interimResults = true;
        recognition.continuous = false;
        recognition.onresult = (event) => {
          let finalText = '';
          let interimText = '';
          for (let index = event.resultIndex; index < event.results.length; index += 1) {
            const result = event.results[index];
            const transcript = result[0] && result[0].transcript ? result[0].transcript : '';
            if (result.isFinal) finalText += transcript;
            else interimText += transcript;
          }
          const base = String(value || '').trim();
          const spoken = (finalText || interimText).trim();
          if (spoken === '') return;
          onText(base ? base + ' ' + spoken : spoken);
        };
        recognition.onend = () => setListening(false);
        recognition.onerror = () => setListening(false);
        recognitionRef.current = recognition;
        try {
          recognition.start();
          setListening(true);
        } catch (_error) {
          setListening(false);
        }
      };

      return h(
        'button',
        {
          type: 'button',
          className: 'dqr-qchip dqr-mic' + (listening ? ' dqr-mic-live' : ''),
          title: canDictate ? label : t('dictateUnavailable'),
          'aria-label': label,
          onMouseDown: (event) => event.preventDefault(),
          onClick: toggle,
        },
        h(MicGlyph, null),
      );
    }


    /** Right-click menu for one quick action: edit or delete (with inline confirm). */
    function ChipMenu({ data }) {
      const state = useSnapshot();
      const action = (state.actions || []).find((entry) => entry.id === data.actionId);
      const ref = React.useRef(null);
      const [position, setPosition] = React.useState(null);

      React.useLayoutEffect(() => {
        const element = ref.current;
        if (!element) return;
        const margin = 8;
        const width = Math.min(element.offsetWidth, window.innerWidth - margin * 2);
        const height = element.offsetHeight;
        const left = Math.min(
          Math.max(data.x, margin + width / 2),
          Math.max(margin + width / 2, window.innerWidth - margin - width / 2),
        );
        const above = data.y - height - 8 >= margin;
        const rawTop = above ? data.y - height - 8 : data.y + 8;
        const top = Math.min(Math.max(rawTop, margin), Math.max(margin, window.innerHeight - height - margin));
        setPosition({ top, left });
      }, [data]);

      if (!action) return null;

      const item = (key, label, onClick, extra) =>
        h(
          'button',
          {
            key,
            type: 'button',
            className: 'dqr-menu-item' + (extra ? ' ' + extra : ''),
            onMouseDown: (event) => event.preventDefault(),
            onClick,
          },
          label,
        );

      return h(
        'div',
        {
          ref,
          className: 'dqr-pop dqr-menu',
          'data-quote-reply-ui': '',
          'data-review-queue-menu': '',
          role: 'menu',
          style: position
            ? {
                position: 'fixed',
                top: position.top,
                left: position.left,
                transform: 'translate(-50%,0)',
                width: 'min(230px, calc(100vw - 24px))',
              }
            : { position: 'fixed', top: 0, left: 0, visibility: 'hidden', width: 'min(230px, calc(100vw - 24px))' },
          onMouseDown: (event) => event.stopPropagation(),
        },
        h('div', { className: 'dqr-menu-title' }, action.label || action.text),
        data.confirming
          ? h(
              FRAG,
              null,
              h('div', { className: 'dqr-menu-confirm' }, t('deleteActionConfirm')),
              h(
                'div',
                { className: 'dqr-menu-row' },
                item('yes', t('yes'), () => manager.removeAction(data.actionId)),
                item('no', t('no'), () => manager.closeChipMenu()),
              ),
            )
          : h(
              FRAG,
              null,
              item('edit', t('edit'), () => manager.openActionEditor(data.actionId, data.x, data.y)),
              item('delete', t('remove'), () => manager.confirmChipDelete(), 'dqr-menu-danger'),
            ),
      );
    }

    /** Small two-field form: the chip label and the phrase it inserts. */
    function ActionEditor({ data }) {
      const ref = React.useRef(null);
      const firstRef = React.useRef(null);
      const [label, setLabel] = React.useState(data.label || '');
      const [text, setText] = React.useState(data.text || '');
      const [position, setPosition] = React.useState(null);

      React.useLayoutEffect(() => {
        const element = ref.current;
        if (!element) return;
        const margin = 8;
        const width = Math.min(element.offsetWidth, window.innerWidth - margin * 2);
        const height = element.offsetHeight;
        const left = Math.min(
          Math.max(data.x, margin + width / 2),
          Math.max(margin + width / 2, window.innerWidth - margin - width / 2),
        );
        const above = data.y - height - 8 >= margin;
        const rawTop = above ? data.y - height - 8 : data.y + 8;
        const top = Math.min(Math.max(rawTop, margin), Math.max(margin, window.innerHeight - height - margin));
        setPosition({ top, left });
      }, [data]);

      React.useEffect(() => {
        const element = firstRef.current;
        if (element) element.focus({ preventScroll: true });
      }, []);

      const canSave = text.trim() !== '';
      const save = () => {
        if (!canSave) return;
        manager.saveAction(data.id, label, text);
      };
      const onKeyDown = (event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          manager.closeActionEditor();
          return;
        }
        if (event.key !== 'Enter') return;
        event.preventDefault();
        event.stopPropagation();
        save();
      };

      return h(
        'div',
        {
          ref,
          className: 'dqr-pop dqr-editor',
          'data-quote-reply-ui': '',
          'data-review-queue-editor': '',
          role: 'dialog',
          'aria-label': t('addAction'),
          style: position
            ? {
                position: 'fixed',
                top: position.top,
                left: position.left,
                transform: 'translate(-50%,0)',
                width: 'min(330px, calc(100vw - 24px))',
              }
            : { position: 'fixed', top: 0, left: 0, visibility: 'hidden', width: 'min(330px, calc(100vw - 24px))' },
          onMouseDown: (event) => event.stopPropagation(),
        },
        h(
          'div',
          { className: 'dqr-editor-field' },
          h('span', { className: 'dqr-editor-label' }, t('actionLabel')),
          h('input', {
            ref: firstRef,
            className: 'dqr-editor-input',
            value: label,
            placeholder: t('actionLabel'),
            spellCheck: false,
            onChange: (event) => setLabel(event.target.value),
            onKeyDown,
          }),
        ),
        h(
          'div',
          { className: 'dqr-editor-field' },
          h('span', { className: 'dqr-editor-label' }, t('actionPhrase')),
          h('input', {
            className: 'dqr-editor-input',
            value: text,
            placeholder: t('actionPhrase'),
            spellCheck: false,
            onChange: (event) => setText(event.target.value),
            onKeyDown,
          }),
        ),
        h(
          'div',
          { className: 'dqr-editor-actions' },
          h(
            'button',
            {
              type: 'button',
              className: 'dqr-editor-btn dqr-editor-btn-ghost',
              onClick: () => manager.closeActionEditor(),
            },
            t('cancel'),
          ),
          h(
            'button',
            {
              type: 'button',
              className: 'dqr-editor-btn',
              disabled: !canSave,
              onClick: save,
            },
            t('save'),
          ),
        ),
      );
    }

    /**
     * The annotation card: opens while the pointer rests on a highlighted
     * passage. It shows every comment left on that passage, lets the reviewer
     * add another one, and offers deleting the note.
     * @param props - the hovered block id plus the pointer position.
     * @returns the anchored annotation card.
     */
    function AnnotationCard({ data }) {
      const state = useSnapshot();
      const ref = React.useRef(null);
      const inputRef = React.useRef(null);
      const [position, setPosition] = React.useState(null);
      const [value, setValue] = React.useState(() => manager.getHoverDraft(data.blockId));
      const block = state.blocks.find((candidate) => candidate.id === data.blockId);
      const comments = block ? block.comments || [] : [];

      React.useLayoutEffect(() => {
        const element = ref.current;
        if (!element) return;
        const margin = 8;
        const gap = 14;
        const width = Math.min(element.offsetWidth, window.innerWidth - margin * 2);
        const height = element.offsetHeight;
        const left = Math.min(
          Math.max(data.x, margin + width / 2),
          Math.max(margin + width / 2, window.innerWidth - margin - width / 2),
        );
        const above = data.y - height - gap >= margin;
        const rawTop = above ? data.y - height - gap : data.y + gap;
        const top = Math.min(Math.max(rawTop, margin), Math.max(margin, window.innerHeight - height - margin));
        setPosition({ top, left });
      }, [data, comments.length]);

      if (!block) return null;

      const updateValue = (next) => {
        setValue(next);
        manager.setHoverDraft(data.blockId, next);
      };

      const add = () => {
        const text = value.trim();
        if (text === '' || !manager.addComment(block.id, text)) return;
        updateValue('');
        const element = inputRef.current;
        if (element) element.focus({ preventScroll: true });
      };

      const onKeyDown = (event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          manager.closeHover();
          return;
        }
        if (event.key !== 'Enter' || event.shiftKey) return;
        const native = event.nativeEvent || {};
        if (native.isComposing || event.keyCode === 229) return;
        event.preventDefault();
        event.stopPropagation();
        add();
      };

      const row = (comment, index) =>
        h(
          'div',
          { key: index, className: 'dqr-hcomment' },
          h('span', { className: 'dqr-hcomment-mark', 'aria-hidden': true }, String(index + 1)),
          h('span', { className: 'dqr-hcomment-text' }, comment.text),
          comment.sent === true
            ? null
            : h('span', { className: 'dqr-hcomment-pending', title: t('pending') }, '•'),
          h(
            'button',
            {
              type: 'button',
              className: 'dqr-tool dqr-hcomment-del',
              title: t('commentDelete'),
              'aria-label': t('commentDelete'),
              onMouseDown: (event) => event.preventDefault(),
              onClick: () => manager.removeComment(block.id, index),
            },
            h(CrossGlyph, null),
          ),
        );

      return h(
        'div',
        {
          ref,
          className: 'dqr-pop dqr-hcard',
          'data-quote-reply-ui': '',
          'data-review-queue-hover': '',
          role: 'dialog',
          'aria-label': t('comments'),
          style: position
            ? {
                position: 'fixed',
                top: position.top,
                left: position.left,
                transform: 'translate(-50%,0)',
                width: 'min(370px, calc(100vw - 24px))',
              }
            : { position: 'fixed', top: 0, left: 0, visibility: 'hidden', width: 'min(370px, calc(100vw - 24px))' },
          onMouseDown: (event) => event.stopPropagation(),
          onMouseEnter: () => manager.keepHover(),
          onMouseLeave: () => manager.scheduleHoverHide(),
        },
        h(
          'div',
          { className: 'dqr-hcard-head' },
          h('div', { className: 'dqr-hcard-quote', title: block.quote }, block.quote),
          h(
            'button',
            {
              type: 'button',
              className: 'dqr-tool dqr-hcard-close',
              title: t('close'),
              'aria-label': t('close'),
              onMouseDown: (event) => event.preventDefault(),
              onClick: () => manager.closeHover(),
            },
            h(CrossGlyph, null),
          ),
        ),
        h(
          'div',
          { className: 'dqr-hcard-comments' },
          comments.length === 0
            ? h('div', { className: 'dqr-hcard-empty' }, t('emptyComments'))
            : comments.map(row),
        ),
        h(
          'div',
          { className: 'dqr-row' },
          h('input', {
            ref: inputRef,
            className: 'dqr-mini-input',
            value,
            placeholder: t('commentPlaceholder'),
            spellCheck: false,
            onChange: (event) => updateValue(event.target.value),
            onKeyDown,
          }),
          h(MicButton, { value, onText: updateValue, label: t('dictate') }),
          value.trim() === ''
            ? null
            : h(
                'button',
                {
                  type: 'button',
                  className: 'dqr-tool dqr-field-clear',
                  title: t('clearField'),
                  'aria-label': t('clearField'),
                  onMouseDown: (event) => event.preventDefault(),
                  onClick: () => updateValue(''),
                },
                h(CrossGlyph, null),
              ),
          h(
            'button',
            {
              type: 'button',
              className: 'dqr-sendicon',
              disabled: value.trim() === '',
              title: t('addComment'),
              'aria-label': t('addComment'),
              onMouseDown: (event) => event.preventDefault(),
              onClick: add,
            },
            h(ArrowUpGlyph, null),
          ),
        ),
        h(
          'div',
          { className: 'dqr-hcard-foot' },
          h(
            'button',
            {
              type: 'button',
              className: 'dqr-qchip',
              onMouseDown: (event) => event.preventDefault(),
              onClick: () => {
                manager.removeBlock(block.id);
                manager.closeHover();
              },
            },
            t('deleteNote'),
          ),
        ),
      );
    }

    /** One pending review note as a compact ribbon chip above the composer. */
    function NoteChip({ block }) {
      const pending = (block.comments || []).filter((comment) => comment.sent !== true);
      const latest =
        pending.length > 0 ? pending[pending.length - 1].text : manager.latestComment(block);
      const quotePreview = block.quote.replace(/\s+/g, ' ').trim();
      const count = (block.comments || []).length;
      const isDocument = block.source && block.source.kind === 'document';
      const docName = isDocument
        ? block.source.path.replace(/\\/g, '/').split('/').pop()
        : '';
      const open = (event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        manager.openAnnotation(block.id, rect);
      };
      return h(
        'div',
        {
          className: 'dqr-note',
          'data-quote-reply-ui': '',
          role: 'listitem',
          title: isDocument
            ? `${t('documentHeading', { path: block.source.path })}\n\n${block.quote}\n\n${latest}`
            : `${block.quote}\n\n${latest}`,
          onMouseDown: (event) => event.preventDefault(),
          onClick: open,
        },
        h('span', { className: 'dqr-note-quote', 'aria-hidden': true }, '❝'),
        isDocument
          ? h('span', { className: 'dqr-note-doc', title: block.source.path }, docName)
          : null,
        h('span', { className: 'dqr-note-text' }, quotePreview),
        h('span', { className: 'dqr-note-comment' }, latest),
        count > 1 ? h('span', { className: 'dqr-note-count' }, String(count)) : null,
        h(
          'button',
          {
            type: 'button',
            className: 'dqr-tool dqr-note-del',
            title: t('remove'),
            'aria-label': t('remove'),
            onMouseDown: (event) => event.preventDefault(),
            onClick: (event) => {
              event.stopPropagation();
              manager.removeBlock(block.id);
            },
          },
          h(CrossGlyph, null),
        ),
      );
    }

    /**
     * The pending notes as one compact ribbon flush with the composer card. It
     * deliberately has no Send button: the host's own Enter and submit send them,
     * and the plugin composes the final message on that submit.
     */
    function QuoteStrip({ sessionId }) {
      const state = useSnapshot();
      const pending = state.blocks.filter((block) =>
        (block.comments || []).some((comment) => comment.sent !== true),
      );
      if (state.sessionId !== sessionId || pending.length === 0) return null;
      return h(
        'div',
        { className: 'dqr-strip', 'data-quote-reply-ui': '', role: 'list' },
        pending.map((block) => h(NoteChip, { key: block.id, block })),
        state.status === ''
          ? null
          : h(
              'span',
              {
                className: `dqr-status${state.status === 'failed' ? ' dqr-status-failed' : ''}`,
                role: 'status',
              },
              t(
                state.status === 'failed'
                  ? 'sendFailed'
                  : state.status === 'fileBlocked'
                    ? 'sendFileBlocked'
                    : 'sending',
              ),
            ),
        h(
          'button',
          {
            type: 'button',
            className: 'dqr-strip-clear' + (state.clearConfirm ? ' dqr-clear-armed' : ''),
            title: state.clearConfirm ? t('clearAllSure') : t('clearAll'),
            'aria-label': t('clearAll'),
            onMouseDown: (event) => event.preventDefault(),
            onClick: () => manager.requestClearAll(),
          },
          state.clearConfirm ? t('clearAllSure') : '✕',
        ),
      );
    }

    /** The composer's plain-text draft, used for the carrier and clear decisions. */
    function selectDraft(input) {
      return input && typeof input.draft === 'string' ? input.draft : '';
    }

    /** Draft attachment ids as one comma string — the manager's wire format. */
    function selectAttachments(input) {
      return input && Array.isArray(input.attachmentIds) ? input.attachmentIds.join(',') : '';
    }

    /** Live face: the slot hands down the composer's selector hook and actions. */
    function LiveQuoteReplyBridge(props) {
      const draft = props.useInput(selectDraft);
      const attachments = props.useInput(selectAttachments);
      // useSession is a standard prop of the same slot; without it the plugin
      // simply never believes a turn is running (Stop stays the host's).
      const running =
        typeof props.useSession === 'function'
          ? props.useSession((snapshot) => (snapshot && snapshot.running === true))
          : false;
      React.useEffect(() => {
        manager.attach(props.sessionId, props.inputActions);
      }, [props.sessionId, props.inputActions]);
      React.useEffect(() => {
        manager.setDraft(draft);
      }, [draft, props.sessionId]);
      React.useEffect(() => {
        manager.setAttachments(attachments);
      }, [attachments, props.sessionId]);
      React.useEffect(() => {
        manager.setRunning(running === true);
      }, [running, props.sessionId]);
      React.useEffect(() => () => manager.detach(props.sessionId), [props.sessionId]);
      return h(QuoteStrip, { sessionId: props.sessionId });
    }

    /** Idle face: no composer hook to read, so the tracked draft stays as-is. */
    function IdleQuoteReplyBridge(props) {
      React.useEffect(() => {
        manager.attach(props.sessionId, props.inputActions);
      }, [props.sessionId, props.inputActions]);
      React.useEffect(() => () => manager.detach(props.sessionId), [props.sessionId]);
      return h(QuoteStrip, { sessionId: props.sessionId });
    }

    /**
     * Session-scoped bridge. The two faces are separate components on purpose:
     * swapping hooks inside one instance (host hook vs fallback hook) changes the
     * hook count between renders and tears the composer down on a session switch.
     */
    function QuoteReplyBridge(props) {
      return typeof props.useInput === 'function'
        ? h(LiveQuoteReplyBridge, props)
        : h(IdleQuoteReplyBridge, props);
    }

    /**
     * Frame-wide overlay: the compact selection bar plus every transient surface
     * that must escape the transcript's scroll containers. Mounting here is also
     * what starts selection tracking (and unmounting stops it).
     */
    function QuoteReplyOverlay() {
      const state = useSnapshot();
      React.useEffect(() => manager.mount(), []);
      return h(
        React.Fragment,
        null,
        state.target
          ? state.reviewing
            ? h(QuickBar, { key: 'target', target: state.target })
            : h(ReviewPill, { key: 'target', target: state.target })
          : null,
        state.popover ? h(QuotePopover, { key: 'popover', data: state.popover }) : null,
        state.chipMenu ? h(ChipMenu, { key: 'menu', data: state.chipMenu }) : null,
        state.actionEditor ? h(ActionEditor, { key: 'editor', data: state.actionEditor }) : null,
        state.hover ? h(AnnotationCard, { key: 'hover', data: state.hover }) : null,
      );
    }

    /**
     * Plain user text normally renders as raw text, so the quote marker would
     * show as a "│" character. This renderer draws those lines as a real quote
     * rule instead, and leaves every other message byte-for-byte as before.
     */
    function QuoteAwareUserText(props) {
      const node = props.node || {};
      const data = node.data || {};
      const text = String(data.display != null ? data.display : data.text != null ? data.text : props.raw || '');
      const isBar = (line) => line === '│' || line.startsWith('│ ');
      const lines = text.split('\n');
      // The composer's queue row renders this same slot with
      // `facts.collapseWhitespace` and `ellipsis: true`, so the queued copy
      // arrives as ONE line. Quote blocks there would fight the single-line
      // ellipsis, so a flat preview just drops the storage markers and lets the
      // host truncate it like any other queued message.
      if (lines.length < 2) {
        if (!lines.some(isBar)) return h('span', { style: { whiteSpace: 'pre-wrap' } }, text);
        const preview = text.replace(/(^|\s)│\s/g, '$1').replace(/\s+/g, ' ').trim();
        return h('span', { style: { whiteSpace: 'pre-wrap' } }, preview);
      }
      if (!lines.some(isBar)) {
        return h('span', { style: { whiteSpace: 'pre-wrap' } }, text);
      }
      const groups = [];
      let index = 0;
      while (index < lines.length) {
        if (!isBar(lines[index])) {
          let end = index;
          while (end < lines.length && !isBar(lines[end])) end += 1;
          groups.push({ quote: null, body: lines.slice(index, end) });
          index = end;
          continue;
        }
        let end = index;
        while (end < lines.length && isBar(lines[end])) end += 1;
        const quote = lines
          .slice(index, end)
          .map((line) => (line === '│' ? '' : line.slice(2)))
          .join('\n');
        let tail = end;
        while (tail < lines.length && !isBar(lines[tail])) tail += 1;
        groups.push({ quote, body: lines.slice(end, tail) });
        index = tail;
      }
      return h(QuoteMessage, { groups, key: 'q-reply' });
    }

    /** Long multi-quote messages collapse the way Claude shows a long paste. */
    const QUOTE_VISIBLE_GROUPS = 2;

    function QuoteMessage({ groups }) {
      const [expanded, setExpanded] = React.useState(false);
      const collapsible = groups.length > QUOTE_VISIBLE_GROUPS;
      const visible = collapsible && !expanded ? groups.slice(0, QUOTE_VISIBLE_GROUPS) : groups;
      const hidden = groups.length - visible.length;
      const out = [];
      visible.forEach((group) => {
        if (group.quote !== null) {
          // A block element swallows the newline that preceded it; the blank
          // line between a reply and the next quote has to be put back.
          if (out.length > 0) out.push('\n');
          out.push(h('span', { key: `q${out.length}`, className: 'dqr-msg-quote' }, group.quote));
        }
        if (group.body.length > 0) {
          out.push(h('span', { key: `t${out.length}` }, group.body.join('\n')));
        }
      });
      if (hidden > 0) {
        out.push(
          h(
            'button',
            {
              key: 'more',
              type: 'button',
              className: 'dqr-more',
              'data-quote-reply-ui': '',
              onClick: (event) => {
                event.preventDefault();
                event.stopPropagation();
                setExpanded(true);
              },
            },
            t('showMore', { count: hidden }),
          ),
        );
      }
      return h('span', { style: { whiteSpace: 'pre-wrap' } }, out);
    }

    return {
      name: 'review-queue',
      inject: ['slots', 'locale', 'sessions'],
      apply(ctx) {
        // One static stylesheet. The CSS class that pins the selection bar with
        // `position: fixed` lives here, so without this injection the bar renders
        // as a static block in the overlay's top-left corner.
        try {
          ctx.effect(() => {
            const tag = document.createElement('style');
            tag.dataset.plugin = 'dsh-annotate-it';
            tag.textContent = CSS;
            document.head.appendChild(tag);
            return () => tag.remove();
          }, 'review-queue: stylesheet');
        } catch (_error) {
          /* a missing DOM leaves the plugin unstyled but functional */
        }
        // Copy lives in the Harness dictionary: the service resolves the active
        // language and its fallback chain, and live-switches with the app.
        try {
          localeService = ctx.get('locale') || null;
          if (localeService) {
            ctx.effect(() => localeService.register(NS, 'en', I18N.en), 'review-queue: en');
            ctx.effect(() => localeService.register(NS, 'zh', I18N.zh), 'review-queue: zh');
            ctx.effect(() => localeService.register(NS, 'ru', I18N.ru), 'review-queue: ru');
            translate = localeService.bind(NS);
          }
          const release = ctx.on('locale/change', () => {
            manager.notify();
          });
          ctx.effect(() => release, 'quote-reply: locale');
        } catch (_error) {
          /* a missing locale service keeps the browser-derived table */
        }
        // The quick-action dictionary is user-owned: seed once, then read it.
        try {
          manager.initActions();
        } catch (_error) {
          /* a broken storage copy leaves the built-in list in place */
        }
        // Direct send path: the Session prompt owns queueing while a turn runs.
        try {
          sessionsService = ctx.get('sessions') || null;
        } catch (_error) {
          sessionsService = null;
        }
        ctx.slots.inject('shell.overlay', () =>
          ctx.slots.register(
            { name: 'shell.overlay', id: 'review-queue-overlay', order: 50 },
            QuoteReplyOverlay,
          ),
        );
        ctx.slots.inject('conversation.input.dock', () =>
          ctx.slots.register(
            { name: 'conversation.input.dock', id: 'review-queue', order: 60 },
            QuoteReplyBridge,
          ),
        );
        // One selection surface only: the bar above replaces the shipped quote
        // pill there, while the message-quotes plugin keeps owning selection
        // admission and quote rendering. The bar's own Quote chip inserts a
        // plain quote through the composer actions, so nothing is lost.
        ctx.slots.inject('conversation.chat.text-interaction', () =>
          ctx.slots.register(
            { name: 'conversation.chat.text-interaction', key: 'quote', priority: -1 },
            () => null,
          ),
        );
        // Outgoing quotes are plain Markdown blockquotes, so the shipped
        // message-quotes rule renders them in the transcript; this plugin does
        // not need to shadow the user-text renderer.
      },
    };
  },
});

