/*
 * 浏览器 Agent 动作脚本：生成在 webview 页面上下文执行的注入脚本。
 *   - 参数统一 JSON 序列化后内联，避免字符串拼接注入；
 *   - 快照脚本维护元素 ref 映射，供点击 / 填写复用。
 *
 * @author xuxueli 2026-10-25
 */

import type { BrowserFillField } from '@modules/browser/shared'

/* 读取正文 */

export function buildReadScript(selector?: string): string {
  const selectorValue = selector ? JSON.stringify(selector) : 'null'
  return `(() => {
    const selector = ${selectorValue};
    const root = selector ? document.querySelector(selector) : (document.body || document.documentElement);
    if (!root) {
      return { title: document.title, url: location.href, missing: true };
    }
    return {
      title: document.title,
      url: location.href,
      text: (root.innerText || root.textContent || '')
    };
  })()`
}

/* 页面快照：可交互元素 + ref + 文本摘要 */
export function buildSnapshotScript(maxNodes: number): string {
  return `(() => {
    const MAX = ${maxNodes};
    const visible = (el) => {
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none' && Number(style.opacity) > 0;
    };
    const roleOf = (el) => {
      const explicit = el.getAttribute('role');
      if (explicit) return explicit;
      const tag = el.tagName.toLowerCase();
      if (tag === 'a') return 'link';
      if (tag === 'button') return 'button';
      if (tag === 'select') return 'combobox';
      if (tag === 'textarea') return 'textbox';
      if (tag === 'input') {
        const type = (el.getAttribute('type') || 'text').toLowerCase();
        if (type === 'checkbox') return 'checkbox';
        if (type === 'radio') return 'radio';
        if (type === 'submit' || type === 'button') return 'button';
        return 'textbox';
      }
      return tag;
    };
    const nameOf = (el) => {
      const label = el.labels && el.labels[0] ? el.labels[0].innerText : '';
      const value = el.getAttribute('aria-label') || el.getAttribute('title') || el.getAttribute('alt') || el.getAttribute('placeholder') || label || el.innerText || el.value || '';
      return String(value).replace(/\\s+/g, ' ').trim().slice(0, 120);
    };
    const store = window.__deskAgentSnapshot || (window.__deskAgentSnapshot = { refs: new Map(), byEl: new WeakMap(), seq: 0 });
    const nodes = [];
    let total = 0;
    const selector = 'a[href],button,input,textarea,select,[role="button"],[role="link"],[role="checkbox"],[role="radio"],[role="tab"],[role="menuitem"],[contenteditable="true"],[onclick]';
    for (const el of document.querySelectorAll(selector)) {
      if (!visible(el)) continue;
      total += 1;
      if (nodes.length >= MAX) continue;
      let ref = store.byEl.get(el);
      if (!ref) {
        ref = 'e' + (++store.seq);
        store.byEl.set(el, ref);
        store.refs.set(ref, el);
      }
      const tag = el.tagName.toLowerCase();
      nodes.push({
        ref,
        role: roleOf(el),
        name: nameOf(el),
        value: tag === 'input' || tag === 'textarea' || tag === 'select' ? String(el.value ?? '') : undefined,
        disabled: Boolean(el.disabled) || el.getAttribute('aria-disabled') === 'true',
        checked: tag === 'input' && (el.type === 'checkbox' || el.type === 'radio') ? Boolean(el.checked) : undefined,
        href: tag === 'a' ? String(el.href || '') : undefined
      });
    }
    const text = (document.body ? document.body.innerText : '') || '';
    return { title: document.title, url: location.href, nodes, totalNodes: total, text: text.trim().slice(0, 3000), truncated: text.length > 3000 };
  })()`
}

/* 点击元素：ref 优先，selector 兜底 */
export function buildClickScript(input: {
  ref?: string
  selector?: string
  button: 'left' | 'right'
  count: number
}): string {
  const ref = input.ref ? JSON.stringify(input.ref) : 'null'
  const selector = input.selector ? JSON.stringify(input.selector) : 'null'
  return `(() => {
    const store = window.__deskAgentSnapshot;
    const ref = ${ref};
    const selector = ${selector};
    const el = ref ? store?.refs.get(ref) : selector ? document.querySelector(selector) : null;
    if (!el) return { ok: false, error: t('chat.browser.snapshotRefMissing') };
    el.scrollIntoView({ block: 'center', inline: 'center' });
    const rect = el.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    for (let i = 0; i < ${input.count}; i += 1) {
      if ('${input.button}' === 'right') {
        el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 2 }));
      } else if (typeof el.click === 'function') {
        el.click();
      } else {
        el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 }));
      }
    }
    return { ok: true };
  })()`
}

/* 填写表单：文本 / 下拉 / 复选 / contenteditable，可选提交 */
export function buildFillScript(fields: BrowserFillField[], submit: boolean): string {
  const fieldsValue = JSON.stringify(fields)
  return `(() => {
    const store = window.__deskAgentSnapshot;
    const fields = ${fieldsValue};
    const missing = [];
    const forms = new Set();
    let filled = 0;
    const fire = (el) => {
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    };
    for (const field of fields) {
      const el = field.ref ? store?.refs.get(field.ref) : field.selector ? document.querySelector(field.selector) : null;
      if (!el) {
        missing.push(field.ref || field.selector || '?');
        continue;
      }
      el.scrollIntoView({ block: 'center', inline: 'center' });
      const tag = el.tagName.toLowerCase();
      if (tag === 'select') {
        el.value = String(field.value ?? '');
        fire(el);
      } else if (tag === 'input' && (el.type === 'checkbox' || el.type === 'radio')) {
        el.checked = field.checked === undefined ? true : Boolean(field.checked);
        fire(el);
      } else if (el.isContentEditable) {
        el.textContent = String(field.value ?? '');
        fire(el);
      } else if (tag === 'input' || tag === 'textarea') {
        const proto = tag === 'textarea' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
        const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
        if (setter) setter.call(el, String(field.value ?? ''));
        else el.value = String(field.value ?? '');
        fire(el);
      } else {
        el.textContent = String(field.value ?? '');
        fire(el);
      }
      filled += 1;
      const form = el.closest && el.closest('form');
      if (form) forms.add(form);
    }
    if (${submit}) {
      let submitted = false;
      for (const form of forms) {
        if (typeof form.requestSubmit === 'function') {
          form.requestSubmit();
          submitted = true;
        }
      }
      if (!submitted && forms.size === 0) return { ok: false, filled, missing, error: t('chat.browser.formMissing') };
    }
    return { ok: true, filled, missing };
  })()`
}

/*
 * 等待页面条件：选择器 / 文本（URL 由渲染层轮询标签页地址，避免整页跳转销毁脚本上下文）
 */
export function buildProbeScript(input: { selector?: string; text?: string }): string {
  const selector = input.selector ? JSON.stringify(input.selector) : 'null'
  const text = input.text ? JSON.stringify(input.text) : 'null'
  return `(() => {
    const selector = ${selector};
    const text = ${text};
    const matched =
      (selector && document.querySelector(selector)) ||
      (text && ((document.body && document.body.innerText) || '').includes(text));
    return { matched: Boolean(matched), title: document.title, url: location.href };
  })()`
}

/* 悬停元素：派发鼠标移入事件，触发悬停菜单 / 提示 */
export function buildHoverScript(input: { ref?: string; selector?: string }): string {
  const ref = input.ref ? JSON.stringify(input.ref) : 'null'
  const selector = input.selector ? JSON.stringify(input.selector) : 'null'
  return `(() => {
    const store = window.__deskAgentSnapshot;
    const ref = ${ref};
    const selector = ${selector};
    const el = ref ? store?.refs.get(ref) : selector ? document.querySelector(selector) : null;
    if (!el) return { ok: false, error: 'missing' };
    el.scrollIntoView({ block: 'center', inline: 'center' });
    const rect = el.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    for (const type of ['pointerover', 'mouseover', 'mousemove', 'pointerenter', 'mouseenter']) {
      el.dispatchEvent(new MouseEvent(type, {
        bubbles: type !== 'mouseenter' && type !== 'pointerenter',
        cancelable: true,
        clientX: x,
        clientY: y,
        view: window
      }));
    }
    return { ok: true };
  })()`
}

/* 按键：向目标元素或当前焦点发送 keydown / keypress / keyup */
export function buildPressScript(input: {
  key: string
  ref?: string
  selector?: string
}): string {
  const key = JSON.stringify(input.key)
  const ref = input.ref ? JSON.stringify(input.ref) : 'null'
  const selector = input.selector ? JSON.stringify(input.selector) : 'null'
  return `(() => {
    const store = window.__deskAgentSnapshot;
    const key = ${key};
    const ref = ${ref};
    const selector = ${selector};
    const el = ref ? store?.refs.get(ref) : selector ? document.querySelector(selector) : document.activeElement;
    if (!el) return { ok: false, error: 'missing' };
    if (typeof el.focus === 'function') el.focus();
    const init = { key, code: key, bubbles: true, cancelable: true, view: window };
    el.dispatchEvent(new KeyboardEvent('keydown', init));
    el.dispatchEvent(new KeyboardEvent('keypress', init));
    el.dispatchEvent(new KeyboardEvent('keyup', init));
    return { ok: true, active: el.tagName ? el.tagName.toLowerCase() : '' };
  })()`
}

/* 选择下拉选项：value 匹配 option 的 value 或可见文本 */
export function buildSelectScript(input: {
  ref?: string
  selector?: string
  value: string
}): string {
  const value = JSON.stringify(input.value)
  const ref = input.ref ? JSON.stringify(input.ref) : 'null'
  const selector = input.selector ? JSON.stringify(input.selector) : 'null'
  return `(() => {
    const store = window.__deskAgentSnapshot;
    const value = ${value};
    const ref = ${ref};
    const selector = ${selector};
    const el = ref ? store?.refs.get(ref) : selector ? document.querySelector(selector) : null;
    if (!el) return { ok: false, error: 'missing' };
    const fire = (node) => {
      node.dispatchEvent(new Event('input', { bubbles: true }));
      node.dispatchEvent(new Event('change', { bubbles: true }));
    };
    if (el.tagName && el.tagName.toLowerCase() === 'select') {
      const option = Array.from(el.options).find(
        (item) => item.value === value || (item.textContent || '').trim() === value
      );
      if (!option) return { ok: false, error: 'option', text: '' };
      el.value = option.value;
      fire(el);
      return { ok: true, text: (option.textContent || '').trim() };
    }
    el.value = value;
    fire(el);
    return { ok: true, text: value };
  })()`
}

/* 滚动页面：up / down 按像素滚动，top / bottom 直达两端 */
export function buildScrollScript(input: {
  direction: 'up' | 'down' | 'top' | 'bottom'
  amount?: number
}): string {
  const direction = JSON.stringify(input.direction)
  const amount = Number.isFinite(input.amount) ? Number(input.amount) : 0
  return `(() => {
    const direction = ${direction};
    const amount = ${amount} > 0 ? ${amount} : Math.round(window.innerHeight * 0.8);
    if (direction === 'top') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else if (direction === 'bottom') {
      window.scrollTo({ top: document.body ? document.body.scrollHeight : document.documentElement.scrollHeight, behavior: 'smooth' });
    } else {
      window.scrollBy({ top: direction === 'up' ? -amount : amount, behavior: 'smooth' });
    }
    return { ok: true, scrollY: Math.round(window.scrollY) };
  })()`
}
