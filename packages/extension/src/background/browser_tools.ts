import { ContextKind, PageContext, TabSummary, shareableUrl, sitePattern } from "../shared/protocol";

const RESTRICTED_BASE = "input, textarea, select, [contenteditable], [role='textbox'], script, style, noscript, template, svg, [hidden], [inert], [aria-hidden=true]";
const RESTRICTED_PAGE = `${RESTRICTED_BASE}, header, nav, footer, aside`;

function captureVisibleText(kind: ContextKind, restricted: string) {
  const url = location.href;
  const checkedVisibility = new WeakMap<Element, boolean>();

  function isVisible(element: Element): boolean {
    const cached = checkedVisibility.get(element);
    if (cached !== undefined) return cached;
    const style = getComputedStyle(element);
    const visible = style.display !== "none" && style.visibility === "visible" && style.opacity !== "0" &&
      (!element.parentElement || isVisible(element.parentElement));
    checkedVisibility.set(element, visible);
    return visible;
  }

  const sensitive = document.querySelectorAll("input[type=password], iframe[src*='captcha'], iframe[src*='turnstile']");
  for (const el of sensitive) {
    if (!el.closest("[hidden], [inert], [aria-hidden=true]") && isVisible(el)) {
      return { url, blocked: true, title: "", text: "" };
    }
  }

  const mainRoot = document.querySelector<HTMLElement>("main, [role=main]");
  const articles = mainRoot ? null : document.querySelectorAll<HTMLElement>("article");
  const root = mainRoot ?? (articles && articles.length === 1 ? articles[0] : document.body);
  if (!root) return { url, title: document.title, text: "" };
  const selection = kind === "selection" ? window.getSelection() : null;
  if (kind === "selection" && (!selection || selection.isCollapsed || selection.rangeCount !== 1)) {
    return { url, title: document.title, text: "" };
  }
  const range = selection?.getRangeAt(0);
  const start = range?.commonAncestorContainer ?? root;
  const walker = document.createTreeWalker(start, NodeFilter.SHOW_TEXT);

  const parts: string[] = [];
  let length = 0;
  let inspected = 0;
  let current = start.nodeType === Node.TEXT_NODE ? start : walker.nextNode();
  while (current && inspected < 5000 && length < 8000) {
    inspected += 1;
    const parent = current.parentElement;
    if (parent && !parent.closest(restricted) && (!range || range.intersectsNode(current)) && isVisible(parent)) {
      const value = current.nodeValue ?? "";
      const first = current === range?.startContainer ? range.startOffset : 0;
      const last = current === range?.endContainer ? range.endOffset : value.length;
      const text = value.slice(first, last).trim().slice(0, 8000 - length);
      if (text) {
        parts.push(text);
        length += text.length + 1;
      }
    }
    current = walker.nextNode();
  }
  return { url, title: document.title, text: parts.join(" ") };
}

export function redactText(value: string, limit: number) {
  let count = 0;
  const text = value
    .replace(/\b(?:sk-[A-Za-z0-9_-]{16,}|AIza[0-9A-Za-z_-]{35}|gh[pousr]_[A-Za-z0-9_]{20,}|(?:\d[ -]?){13,19})(?![A-Za-z0-9])/g, () => {
      count += 1;
      return "[đã ẩn]";
    })
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, limit);
  return { text, count };
}

export function summarizeTab(tab: chrome.tabs.Tab): TabSummary | undefined {
  if (tab.id === undefined) return;
  const url = shareableUrl(tab.url ?? "");
  if (!url && !tab.active) return;
  return {
    id: tab.id,
    title: url ? redactText(tab.title || url.hostname, 150).text : "Tab hiện tại",
    sitePattern: url ? sitePattern(url) : undefined,
    active: tab.active,
  };
}

export async function captureTab(windowId: number, kind: ContextKind, tabId?: number) {
  const tab = tabId === undefined
    ? (await chrome.tabs.query({ active: true, windowId }))[0]
    : await chrome.tabs.get(tabId);
  if (!tab || tab.id === undefined || tab.windowId !== windowId) throw new Error("Tab không còn trong cửa sổ này.");

  const target = shareableUrl(tab.url ?? "");
  if (!target) {
    throw new Error(tab.url
      ? "Trang này không hỗ trợ đính kèm."
      : "Hãy mở Gecko for Antigravity trên thanh công cụ hoặc cấp quyền tương tác 1 lần, rồi thử lại.");
  }

  let result: chrome.scripting.InjectionResult<ReturnType<typeof captureVisibleText>>;
  try {
    [result] = await chrome.scripting.executeScript({
      target: { tabId: tab.id }, func: captureVisibleText, args: [kind, kind === "selection" ? RESTRICTED_BASE : RESTRICTED_PAGE],
    });
  } catch {
    throw new Error("Chrome chưa cấp quyền đọc tab này. Hãy cấp quyền tương tác 1 lần hoặc bấm biểu tượng Gecko for Antigravity trên tab.");
  }
  if (!result?.documentId || !result.result || result.result.url !== target.href) {
    throw new Error("Tab vừa đổi trang. Hãy thử lại.");
  }
  if (result.result.blocked) throw new Error("Trang có biểu mẫu đăng nhập hoặc xác minh nên không thể đính kèm.");

  const content = redactText(result.result.text, 3500);
  if (!content.text) throw new Error(kind === "selection"
    ? "Hãy bôi đen một đoạn văn bản trong trang rồi thử lại."
    : "Không tìm thấy nội dung văn bản phù hợp trên trang.");

  const title = redactText(result.result.title, 150);
  const context: PageContext = {
    url: target.origin,
    title: title.text || target.hostname,
    content: content.text,
    redactedCount: title.count + content.count,
  };
  return { tabId: tab.id, documentId: result.documentId, pageUrl: target.href, sitePattern: sitePattern(target), context };
}

export async function isSameDocument(tabId: number, documentId: string, url: string): Promise<boolean> {
  try {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId, documentIds: [documentId] }, func: () => location.href,
    });
    return result?.documentId === documentId && result.result === url;
  } catch {
    return false;
  }
}

function domSnapshot() {
  const checked = new WeakMap<Element, boolean>();
  function isVisible(el: Element): boolean {
    const cached = checked.get(el);
    if (cached !== undefined) return cached;
    const style = getComputedStyle(el);
    const vis = style.display !== "none" && style.visibility === "visible" && style.opacity !== "0" &&
      (!el.parentElement || isVisible(el.parentElement));
    checked.set(el, vis);
    return vis;
  }

  const securityFlags: string[] = [];
  for (const el of document.querySelectorAll("input[type=password]")) {
    if (!el.closest("[hidden], [inert], [aria-hidden=true]") && isVisible(el)) {
      securityFlags.push("password_form");
      break;
    }
  }
  for (const el of document.querySelectorAll("iframe[src*='captcha'], iframe[src*='turnstile']")) {
    if (!el.closest("[hidden], [inert], [aria-hidden=true]") && isVisible(el)) {
      securityFlags.push("captcha");
      break;
    }
  }
  if (/(?:^|[\/_-])(?:checkout|payment|billing)(?:$|[\/_-])/i.test(location.pathname)) {
    securityFlags.push("checkout");
  } else {
    for (const el of document.querySelectorAll("input[autocomplete^='cc-']")) {
      if (!el.closest("[hidden], [inert], [aria-hidden=true]") && isVisible(el)) {
        securityFlags.push("checkout");
        break;
      }
    }
  }

  for (const old of document.querySelectorAll("[data-agy-ref]")) {
    old.removeAttribute("data-agy-ref");
  }

  const selector = [
    "a[href]", "button", "input", "textarea", "select",
    "[role='button']", "[role='link']", "[role='menuitem']", "[role='tab']",
    "[role='option']", "[role='checkbox']", "[role='radio']", "[role='textbox']",
    "[role='searchbox']", "[role='combobox']", "[role='listitem']",
    "tr[role='row']", "[role='row'][tabindex]", "[contenteditable='true']",
  ].join(", ");

  const vh = window.innerHeight || 900;
  const vw = window.innerWidth || 1280;
  const candidates = Array.from(document.querySelectorAll<HTMLElement>(selector));
  const items: { ref: string; tag: string; role?: string; label: string; value?: string; disabled?: boolean }[] = [];
  let idx = 0;

  for (const el of candidates) {
    if (items.length >= 120) break;
    if (el.closest("#__agy_virtual_cursor__, [hidden], [inert], [aria-hidden=true]") || !isVisible(el)) continue;
    const rect = el.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) continue;
    if (rect.bottom < -vh || rect.top > vh * 2.5 || rect.right < 0 || rect.left > vw * 1.5) continue;

    const tag = el.tagName.toLowerCase();
    const role = el.getAttribute("role") || undefined;
    const isPassword = tag === "input" && (el as HTMLInputElement).type.toLowerCase() === "password";
    const rawLabel = (
      el.getAttribute("aria-label") ||
      el.getAttribute("title") ||
      el.getAttribute("placeholder") ||
      el.innerText ||
      el.textContent ||
      ""
    ).replace(/\s+/g, " ").trim().slice(0, 140);

    if (!rawLabel && tag !== "input" && tag !== "textarea" && tag !== "select") continue;

    idx += 1;
    const ref = `e${idx}`;
    el.setAttribute("data-agy-ref", ref);

    const item: { ref: string; tag: string; role?: string; label: string; value?: string; disabled?: boolean } = {
      ref,
      tag: tag === "input" ? `input[${(el as HTMLInputElement).type || "text"}]` : tag,
      label: rawLabel || "(không nhãn)",
    };
    if (role) item.role = role;
    if (tag === "input" || tag === "textarea" || tag === "select") {
      if (isPassword) {
        item.value = "[password]";
      } else {
        const val = (el as HTMLInputElement).value;
        if (val) item.value = val.slice(0, 80);
      }
    }
    if ((el as HTMLButtonElement).disabled || el.getAttribute("aria-disabled") === "true") {
      item.disabled = true;
    }
    items.push(item);
  }

  const mainEl = document.querySelector<HTMLElement>("main, [role=main]") ?? document.body;
  const textExcerpt = (mainEl?.innerText || "").replace(/\s+/g, " ").trim().slice(0, 2200);

  return {
    url: location.origin + location.pathname,
    title: document.title,
    securityFlags,
    elements: items,
    textExcerpt,
  };
}

async function domClick(ref: string) {
  const isBlockedPage = () => {
    const isVis = (el: Element): boolean => {
      const s = getComputedStyle(el);
      return s.display !== "none" && s.visibility === "visible" && s.opacity !== "0" &&
        (!el.parentElement || isVis(el.parentElement));
    };
    for (const el of document.querySelectorAll("input[type=password], iframe[src*='captcha'], iframe[src*='turnstile'], input[autocomplete^='cc-']")) {
      if (!el.closest("[hidden], [inert], [aria-hidden=true]") && isVis(el)) return true;
    }
    return false;
  };
  if (isBlockedPage()) {
    return { ok: false, error: "Trang có trường mật khẩu, thanh toán hoặc CAPTCHA đang hiển thị. Hãy để người dùng tự thao tác." };
  }
  const el = document.querySelector<HTMLElement>(`[data-agy-ref="${CSS.escape(ref)}"]`);
  if (!el) return { ok: false, error: `Không tìm thấy phần tử '${ref}'. Hãy gọi browser_get_snapshot lại.` };
  if (el.tagName.toLowerCase() === "input" && (el as HTMLInputElement).type.toLowerCase() === "password") {
    return { ok: false, error: "Bị chặn vì là trường mật khẩu." };
  }
  el.scrollIntoView({ block: "center", inline: "nearest", behavior: "smooth" });
  await new Promise((r) => setTimeout(r, 120));

  const rect = el.getBoundingClientRect();
  const tx = Math.max(8, Math.min(window.innerWidth - 8, rect.left + rect.width / 2));
  const ty = Math.max(8, Math.min(window.innerHeight - 8, rect.top + rect.height / 2));

  // Animate natural curved virtual cursor + Google Blue click ripple
  const win = window as unknown as {
    __agyCursorPos?: { x: number; y: number };
    __agyCursorFade?: number;
  };
  let cursor = document.getElementById("__agy_virtual_cursor__") as HTMLDivElement | null;
  if (!cursor) {
    cursor = document.createElement("div");
    cursor.id = "__agy_virtual_cursor__";
    cursor.style.cssText = [
      "position:fixed", "left:0", "top:0", "z-index:2147483647", "pointer-events:none",
      "will-change:transform,opacity", "transition:opacity 0.25s ease", "opacity:1",
    ].join(";");
    cursor.innerHTML =
      `<svg width="24" height="24" viewBox="0 0 24 24" style="filter:drop-shadow(0 2px 5px rgba(0,0,0,0.32));display:block">` +
      `<path d="M3.5 2.5L20 11.2L12.6 13.3L9.4 20.5L3.5 2.5Z" fill="#1A73E8" stroke="#FFFFFF" stroke-width="1.8" stroke-linejoin="round"/></svg>` +
      `<div style="position:absolute;left:18px;top:16px;background:#1A73E8;color:#fff;font:600 10px/1.2 'Google Sans','Segoe UI',system-ui,sans-serif;padding:2px 6px;border-radius:999px;white-space:nowrap;box-shadow:0 2px 6px rgba(26,115,232,0.35)">Gecko</div>`;
    document.documentElement.appendChild(cursor);
  }
  if (win.__agyCursorFade) clearTimeout(win.__agyCursorFade);
  cursor.style.opacity = "1";

  const start = win.__agyCursorPos ?? { x: Math.max(24, window.innerWidth - 60), y: Math.max(24, window.innerHeight * 0.45) };
  const dx = tx - start.x;
  const dy = ty - start.y;
  const dist = Math.hypot(dx, dy);
  const duration = Math.max(160, Math.min(340, 140 + dist * 0.25));
  const arc = Math.min(80, dist * 0.18) * (dx >= 0 ? -1 : 1);
  const ctrlX = (start.x + tx) / 2 - (dy / (dist || 1)) * arc * 0.45;
  const ctrlY = (start.y + ty) / 2 + (dx / (dist || 1)) * arc * 0.45;

  await new Promise<void>((resolve) => {
    const t0 = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / duration);
      // Cubic ease-in-out
      const e = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
      const omt = 1 - e;
      const x = omt * omt * start.x + 2 * omt * e * ctrlX + e * e * tx;
      const y = omt * omt * start.y + 2 * omt * e * ctrlY + e * e * ty;
      cursor!.style.transform = `translate3d(${x - 3}px, ${y - 2}px, 0)`;
      if (p < 1) requestAnimationFrame(tick);
      else resolve();
    };
    requestAnimationFrame(tick);
  });
  win.__agyCursorPos = { x: tx, y: ty };

  // Press animation + expanding Google Blue ripple
  cursor.style.transform = `translate3d(${tx - 3}px, ${ty - 2}px, 0) scale(0.84)`;
  const ripple = document.createElement("div");
  ripple.style.cssText = [
    "position:fixed", `left:${tx}px`, `top:${ty}px`, "width:14px", "height:14px",
    "margin:-7px 0 0 -7px", "border-radius:50%", "pointer-events:none", "z-index:2147483646",
    "border:2.5px solid #1A73E8", "background:rgba(26,115,232,0.22)",
    "transform:scale(0.6)", "opacity:1", "transition:transform 0.42s cubic-bezier(0.2,0.8,0.2,1), opacity 0.42s ease-out",
  ].join(";");
  document.documentElement.appendChild(ripple);
  requestAnimationFrame(() => {
    ripple.style.transform = "scale(3.4)";
    ripple.style.opacity = "0";
  });
  setTimeout(() => ripple.remove(), 460);

  const anchor = el.closest<HTMLAnchorElement>("a[href]");
  const isNewTabLink = Boolean(anchor && anchor.target === "_blank" && /^https?:\/\//i.test(anchor.href));

  el.focus?.();
  const opts: MouseEventInit = {
    bubbles: true,
    cancelable: true,
    view: window,
    clientX: tx,
    clientY: ty,
  };
  el.dispatchEvent(new PointerEvent("pointerdown", opts));
  el.dispatchEvent(new MouseEvent("mousedown", opts));
  el.dispatchEvent(new PointerEvent("pointerup", opts));
  el.dispatchEvent(new MouseEvent("mouseup", opts));
  if (!isNewTabLink) {
    el.click();
  }

  await new Promise((r) => setTimeout(r, 90));
  cursor.style.transform = `translate3d(${tx - 3}px, ${ty - 2}px, 0) scale(1)`;
  win.__agyCursorFade = window.setTimeout(() => {
    const c = document.getElementById("__agy_virtual_cursor__");
    if (c) c.style.opacity = "0";
  }, 2000);

  return {
    ok: true,
    clicked: ref,
    label: (el.getAttribute("aria-label") || el.innerText || el.tagName).replace(/\s+/g, " ").trim().slice(0, 100),
    url: location.origin + location.pathname,
    title: document.title,
    openInNewTab: isNewTabLink ? anchor!.href : undefined,
  };
}

async function domFill(ref: string, value: string) {
  const el = document.querySelector<HTMLElement>(`[data-agy-ref="${CSS.escape(ref)}"]`);
  if (!el) return { ok: false, error: `Không tìm thấy phần tử '${ref}'. Hãy gọi browser_get_snapshot lại.` };
  const tag = el.tagName.toLowerCase();
  const auto = (el.getAttribute("autocomplete") || "").toLowerCase();
  if ((tag === "input" && (el as HTMLInputElement).type.toLowerCase() === "password") || /password|cc-/.test(auto)) {
    return { ok: false, error: "Bị chặn: không được tự động điền mật khẩu hoặc thẻ thanh toán." };
  }
  el.scrollIntoView({ block: "center", behavior: "smooth" });
  await new Promise((r) => setTimeout(r, 100));

  const rect = el.getBoundingClientRect();
  const tx = Math.max(8, Math.min(window.innerWidth - 8, rect.left + Math.min(rect.width / 2, 48)));
  const ty = Math.max(8, Math.min(window.innerHeight - 8, rect.top + rect.height / 2));
  const win = window as unknown as { __agyCursorPos?: { x: number; y: number }; __agyCursorFade?: number };
  let cursor = document.getElementById("__agy_virtual_cursor__") as HTMLDivElement | null;
  if (!cursor) {
    cursor = document.createElement("div");
    cursor.id = "__agy_virtual_cursor__";
    cursor.style.cssText = "position:fixed;left:0;top:0;z-index:2147483647;pointer-events:none;will-change:transform,opacity;transition:opacity 0.25s ease;opacity:1";
    cursor.innerHTML =
      `<svg width="24" height="24" viewBox="0 0 24 24" style="filter:drop-shadow(0 2px 5px rgba(0,0,0,0.32));display:block">` +
      `<path d="M3.5 2.5L20 11.2L12.6 13.3L9.4 20.5L3.5 2.5Z" fill="#1A73E8" stroke="#FFFFFF" stroke-width="1.8" stroke-linejoin="round"/></svg>` +
      `<div style="position:absolute;left:18px;top:16px;background:#1A73E8;color:#fff;font:600 10px/1.2 'Google Sans','Segoe UI',system-ui,sans-serif;padding:2px 6px;border-radius:999px;white-space:nowrap;box-shadow:0 2px 6px rgba(26,115,232,0.35)">Gecko</div>`;
    document.documentElement.appendChild(cursor);
  }
  if (win.__agyCursorFade) clearTimeout(win.__agyCursorFade);
  cursor.style.opacity = "1";
  const start = win.__agyCursorPos ?? { x: Math.max(24, window.innerWidth - 60), y: Math.max(24, window.innerHeight * 0.45) };
  await new Promise<void>((resolve) => {
    const t0 = performance.now();
    const duration = 260;
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / duration);
      const e = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
      const x = start.x + (tx - start.x) * e;
      const y = start.y + (ty - start.y) * e;
      cursor!.style.transform = `translate3d(${x - 3}px, ${y - 2}px, 0)`;
      if (p < 1) requestAnimationFrame(tick);
      else resolve();
    };
    requestAnimationFrame(tick);
  });
  win.__agyCursorPos = { x: tx, y: ty };
  win.__agyCursorFade = window.setTimeout(() => {
    const c = document.getElementById("__agy_virtual_cursor__");
    if (c) c.style.opacity = "0";
  }, 2000);

  el.focus();
  if (tag === "input" || tag === "textarea") {
    const proto = tag === "textarea" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
    if (setter) setter.call(el, value);
    else (el as HTMLInputElement).value = value;
  } else if (el.isContentEditable) {
    el.textContent = value;
  } else {
    return { ok: false, error: `Phần tử '${ref}' không phải ô nhập liệu.` };
  }
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
  return { ok: true, filled: ref };
}

function domSelectOption(ref: string, value: string) {
  const el = document.querySelector<HTMLElement>(`[data-agy-ref="${CSS.escape(ref)}"]`);
  if (!el || el.tagName.toLowerCase() !== "select") {
    return { ok: false, error: `Không tìm thấy danh sách chọn <select> '${ref}'.` };
  }
  const select = el as HTMLSelectElement;
  const target = value.trim().toLowerCase();
  const match = Array.from(select.options).find(
    (opt) => opt.value === value || opt.textContent?.trim() === value
  ) ?? Array.from(select.options).find(
    (opt) => opt.value.toLowerCase() === target || opt.textContent?.trim().toLowerCase() === target
  );
  if (!match) return { ok: false, error: `Không tìm thấy lựa chọn '${value}'.` };
  select.value = match.value;
  select.dispatchEvent(new Event("input", { bubbles: true }));
  select.dispatchEvent(new Event("change", { bubbles: true }));
  return { ok: true, selected: match.value };
}

function domPressKey(key: string, ref?: string) {
  const target = ref
    ? document.querySelector<HTMLElement>(`[data-agy-ref="${CSS.escape(ref)}"]`)
    : (document.activeElement as HTMLElement | null) ?? document.body;
  if (ref && !target) return { ok: false, error: `Không tìm thấy phần tử '${ref}'.` };
  target?.focus?.();
  const init: KeyboardEventInit = { key, bubbles: true, cancelable: true };
  target?.dispatchEvent(new KeyboardEvent("keydown", init));
  target?.dispatchEvent(new KeyboardEvent("keypress", init));
  target?.dispatchEvent(new KeyboardEvent("keyup", init));
  if (key === "Enter" && target instanceof HTMLInputElement && target.form) {
    target.form.requestSubmit?.();
  }
  return { ok: true, key };
}

function domScroll(direction: string, amount: number) {
  const step = Math.max(100, Math.min(2000, amount || 500));
  const scrollTarget = (() => {
    const candidates = Array.from(document.querySelectorAll<HTMLElement>("main, [role=main], [role=grid], div"))
      .filter((el) => {
        const s = getComputedStyle(el);
        return (s.overflowY === "auto" || s.overflowY === "scroll") && el.scrollHeight > el.clientHeight + 80;
      })
      .sort((a, b) => b.clientHeight * b.clientWidth - a.clientHeight * a.clientWidth);
    if (document.documentElement.scrollHeight > window.innerHeight + 80) return null;
    return candidates[0] ?? null;
  })();

  const apply = (el: HTMLElement | null) => {
    if (el) {
      if (direction === "top") el.scrollTop = 0;
      else if (direction === "bottom") el.scrollTop = el.scrollHeight;
      else el.scrollBy({ top: direction === "up" ? -step : step, behavior: "instant" });
      return { ok: true, scrollTop: Math.round(el.scrollTop) };
    }
    if (direction === "top") window.scrollTo({ top: 0, behavior: "instant" });
    else if (direction === "bottom") window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" });
    else window.scrollBy({ top: direction === "up" ? -step : step, behavior: "instant" });
    return { ok: true, scrollY: Math.round(window.scrollY) };
  };
  return apply(scrollTarget);
}

function waitForTabLoad(tabId: number, timeoutMs = 4000): Promise<void> {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      chrome.tabs.onUpdated.removeListener(onUpdated);
      resolve();
    };
    const onUpdated = (updatedId: number, info: { status?: string }) => {
      if (updatedId === tabId && info.status === "complete") finish();
    };
    const timer = setTimeout(finish, timeoutMs);
    chrome.tabs.onUpdated.addListener(onUpdated);
    void chrome.tabs.get(tabId).then((tab) => {
      if (tab.status === "complete") finish();
    }).catch(finish);
  });
}

async function resolveTargetTab(windowId: number, tabId?: number): Promise<chrome.tabs.Tab> {
  const tab = typeof tabId === "number"
    ? await chrome.tabs.get(tabId)
    : (await chrome.tabs.query({ active: true, windowId }))[0];
  if (!tab || tab.id === undefined || tab.windowId !== windowId) {
    throw new Error("Tab không còn trong cửa sổ hiện tại.");
  }
  if (!shareableUrl(tab.url ?? "")) {
    throw new Error(tab.url
      ? "Trang này thuộc nhóm nhạy cảm hoặc không được hỗ trợ thao tác tự động."
      : "Chrome chưa cấp quyền truy cập tab này. Hãy cấp quyền tương tác 1 lần trong Gecko for Antigravity rồi thử lại.");
  }
  return tab;
}

export async function executeBrowserTool(
  windowId: number,
  name: string,
  args: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const tabId = typeof args.tabId === "number" ? args.tabId : undefined;

  try {
    switch (name) {
      case "browser_list_tabs": {
        const tabs = await chrome.tabs.query({ windowId });
        return {
          ok: true,
          tabs: tabs
            .map(summarizeTab)
            .filter((t): t is TabSummary => t !== undefined),
        };
      }
      case "browser_open_tab": {
        const rawUrl = typeof args.url === "string" ? args.url : "";
        const safe = shareableUrl(rawUrl);
        if (!safe) return { ok: false, error: "URL không hợp lệ hoặc bị chặn vì lý do an toàn." };
        const created = await chrome.tabs.create({
          windowId,
          url: safe.href,
          active: args.active !== false,
        });
        if (created.id !== undefined) await waitForTabLoad(created.id);
        return { ok: true, tabId: created.id, url: safe.origin };
      }
      case "browser_switch_tab": {
        if (typeof args.tabId !== "number") return { ok: false, error: "Thiếu tabId." };
        const tab = await chrome.tabs.get(args.tabId);
        if (tab.windowId !== windowId) return { ok: false, error: "Tab không thuộc cửa sổ hiện tại." };
        await chrome.tabs.update(args.tabId, { active: true });
        return { ok: true, tabId: args.tabId };
      }
      case "browser_close_tab": {
        if (typeof args.tabId !== "number") return { ok: false, error: "Thiếu tabId." };
        const tab = await chrome.tabs.get(args.tabId);
        if (tab.windowId !== windowId) return { ok: false, error: "Tab không thuộc cửa sổ hiện tại." };
        await chrome.tabs.remove(args.tabId);
        return { ok: true, closedTabId: args.tabId };
      }
      case "browser_navigate": {
        const rawUrl = typeof args.url === "string" ? args.url : "";
        const safe = shareableUrl(rawUrl);
        if (!safe) return { ok: false, error: "URL không hợp lệ hoặc bị chặn vì lý do an toàn." };
        const target = typeof tabId === "number"
          ? await chrome.tabs.get(tabId)
          : (await chrome.tabs.query({ active: true, windowId }))[0];
        if (!target || target.id === undefined || target.windowId !== windowId) {
          return { ok: false, error: "Không tìm thấy tab đích." };
        }
        await chrome.tabs.update(target.id, { url: safe.href });
        await waitForTabLoad(target.id);
        return { ok: true, tabId: target.id, url: safe.origin };
      }
      case "browser_get_snapshot": {
        const tab = await resolveTargetTab(windowId, tabId);
        const [res] = await chrome.scripting.executeScript({
          target: { tabId: tab.id! },
          func: domSnapshot,
        });
        if (!res?.result) return { ok: false, error: "Không thể đọc cấu trúc trang." };
        const snap = res.result;
        return {
          ok: true,
          tabId: tab.id,
          url: snap.url,
          title: redactText(snap.title, 150).text,
          securityFlags: snap.securityFlags,
          elements: snap.elements.map((el) => ({
            ...el,
            label: redactText(el.label, 140).text,
            ...(el.value && el.value !== "[password]" ? { value: redactText(el.value, 80).text } : {}),
          })),
          textExcerpt: redactText(snap.textExcerpt, 2200).text,
        };
      }
      case "browser_click": {
        const ref = typeof args.ref === "string" ? args.ref.trim() : "";
        if (!ref) return { ok: false, error: "Thiếu ref phần tử cần nhấp." };
        const tab = await resolveTargetTab(windowId, tabId);
        const [res] = await chrome.scripting.executeScript({
          target: { tabId: tab.id! },
          func: domClick,
          args: [ref],
        });
        const clickResult = res?.result as Record<string, unknown> | undefined;
        if (clickResult?.ok && typeof clickResult.openInNewTab === "string") {
          const safe = shareableUrl(clickResult.openInNewTab);
          if (safe) {
            const created = await chrome.tabs.create({ windowId, url: safe.href, active: true });
            if (created.id !== undefined) await waitForTabLoad(created.id);
            return { ...clickResult, openedTabId: created.id, url: safe.origin + safe.pathname };
          }
        }
        return clickResult ?? { ok: false, error: "Không thể nhấp phần tử." };
      }
      case "browser_fill": {
        const ref = typeof args.ref === "string" ? args.ref.trim() : "";
        const value = typeof args.value === "string" ? args.value : "";
        if (!ref) return { ok: false, error: "Thiếu ref ô nhập liệu." };
        const tab = await resolveTargetTab(windowId, tabId);
        const [res] = await chrome.scripting.executeScript({
          target: { tabId: tab.id! },
          func: domFill,
          args: [ref, value],
        });
        return res?.result ?? { ok: false, error: "Không thể điền nội dung." };
      }
      case "browser_select_option": {
        const ref = typeof args.ref === "string" ? args.ref.trim() : "";
        const value = typeof args.value === "string" ? args.value : "";
        if (!ref) return { ok: false, error: "Thiếu ref danh sách chọn." };
        const tab = await resolveTargetTab(windowId, tabId);
        const [res] = await chrome.scripting.executeScript({
          target: { tabId: tab.id! },
          func: domSelectOption,
          args: [ref, value],
        });
        return res?.result ?? { ok: false, error: "Không thể chọn mục." };
      }
      case "browser_press_key": {
        const key = typeof args.key === "string" ? args.key : "";
        const ref = typeof args.ref === "string" ? args.ref.trim() : undefined;
        if (!key) return { ok: false, error: "Thiếu phím cần nhấn." };
        const tab = await resolveTargetTab(windowId, tabId);
        const [res] = await chrome.scripting.executeScript({
          target: { tabId: tab.id! },
          func: domPressKey,
          args: [key, ref],
        });
        return res?.result ?? { ok: false, error: "Không thể nhấn phím." };
      }
      case "browser_scroll": {
        const direction = typeof args.direction === "string" ? args.direction : "down";
        const amount = typeof args.amount === "number" ? args.amount : 500;
        const tab = await resolveTargetTab(windowId, tabId);
        const [res] = await chrome.scripting.executeScript({
          target: { tabId: tab.id! },
          func: domScroll,
          args: [direction, amount],
        });
        return res?.result ?? { ok: false, error: "Không thể cuộn trang." };
      }
      default:
        return { ok: false, error: `Công cụ không được hỗ trợ: ${name}` };
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Không thể thực thi thao tác trình duyệt.";
    return { ok: false, error: msg };
  }
}
