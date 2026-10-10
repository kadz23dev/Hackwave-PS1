import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Page } from 'playwright';
import { HOME } from '../config.js';
import { contentHash } from './hash.js';
import type { ElementRecord, PageSnapshot } from '../types.js';

function collectElements(): ElementRecord[] {
  function clean(s: string | null | undefined): string {
    return (s || '').replace(/\s+/g, ' ').trim();
  }

  function getRole(el: Element): string {
    const explicit = el.getAttribute('role');
    if (explicit) return explicit;
    const tag = el.tagName.toLowerCase();
    if (tag === 'a') return 'link';
    if (tag === 'button') return 'button';
    if (tag === 'select') return 'combobox';
    if (tag === 'input') {
      const type = (el.getAttribute('type') || 'text').toLowerCase();
      if (type === 'checkbox') return 'checkbox';
      if (type === 'radio') return 'radio';
      if (type === 'submit' || type === 'button') return 'button';
      return 'textbox';
    }
    if (tag === 'textarea') return 'textbox';
    return tag;
  }

  function getName(el: Element, role: string): string {
    const ariaLabel = el.getAttribute('aria-label');
    if (clean(ariaLabel)) return clean(ariaLabel);

    const ariaLabelledby = el.getAttribute('aria-labelledby');
    if (ariaLabelledby) {
      const ids = ariaLabelledby.split(/\s+/).filter(Boolean);
      const textParts = ids
        .map(id => {
          const target = document.getElementById(id);
          return target ? clean(target.textContent) : '';
        })
        .filter(Boolean);
      const combined = textParts.join(' ');
      if (clean(combined)) return clean(combined);
    }

    if (el.id) {
      const lbl = document.querySelector('label[for="' + CSS.escape(el.id) + '"]');
      if (lbl && clean(lbl.textContent)) return clean(lbl.textContent);
    }

    const wrappingLabel = el.closest('label');
    if (wrappingLabel && clean(wrappingLabel.textContent)) return clean(wrappingLabel.textContent);

    const placeholder = el.getAttribute('placeholder');
    if (clean(placeholder)) return clean(placeholder);

    const htmlEl = el as HTMLElement;
    const innerText = htmlEl.innerText !== undefined ? htmlEl.innerText : htmlEl.textContent;
    if (clean(innerText)) return clean(innerText);

    if (role === 'button') {
      const val = (el as HTMLInputElement | HTMLButtonElement).value;
      if (clean(val)) return clean(val);
    }

    const title = el.getAttribute('title');
    if (clean(title)) return clean(title);

    return '';
  }

  function getLabel(el: Element): string {
    if (el.id) {
      const lbl = document.querySelector('label[for="' + CSS.escape(el.id) + '"]');
      if (lbl && clean(lbl.textContent)) return clean(lbl.textContent);
    }
    const wrappingLabel = el.closest('label');
    if (wrappingLabel && clean(wrappingLabel.textContent)) return clean(wrappingLabel.textContent);
    return '';
  }

  function getNearText(el: Element): string {
    for (let a = el.parentElement, i = 0; a && i < 6; a = a.parentElement, i++) {
      const h = Array.from(a.querySelectorAll('h1,h2,h3,h4,legend')).find(x => !el.contains(x));
      if (h) return clean(h.textContent).slice(0, 80);
    }
    return '';
  }

  function isVisible(el: Element, rect: DOMRect): boolean {
    if (!(rect.width > 0 && rect.height > 0)) return false;
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    if (el.closest('[hidden]')) return false;
    return true;
  }

  function getSelector(el: Element): string {
    if (el.id) {
      const sel = '#' + CSS.escape(el.id);
      if (document.querySelectorAll(sel).length === 1) return sel;
    }
    const testId = el.getAttribute('data-testid');
    if (testId) {
      const sel = '[data-testid="' + CSS.escape(testId) + '"]';
      if (document.querySelectorAll(sel).length === 1) return sel;
    }
    const nameAttr = el.getAttribute('name');
    if (nameAttr) {
      const sel = el.tagName.toLowerCase() + '[name="' + CSS.escape(nameAttr) + '"]';
      if (document.querySelectorAll(sel).length === 1) return sel;
    }
    const path: string[] = [];
    let curr: Element | null = el;
    while (curr && curr !== document.body && curr !== document.documentElement) {
      const tag = curr.tagName.toLowerCase();
      const parent: Element | null = curr.parentElement;
      if (!parent) {
        path.unshift(tag);
        break;
      }
      const siblings = Array.from(parent.children).filter(c => c.tagName.toLowerCase() === tag);
      const index = siblings.indexOf(curr) + 1;
      path.unshift(tag + ':nth-of-type(' + index + ')');
      curr = parent;
    }
    return 'body > ' + path.join(' > ');
  }

  function getAttrs(el: Element): Record<string, string> {
    const attrs: Record<string, string> = {};
    const standard = ['id', 'name', 'type', 'placeholder', 'aria-label', 'data-testid', 'href'];
    for (const attr of standard) {
      const val = el.getAttribute(attr);
      if (val !== null && val !== undefined) {
        attrs[attr] = val;
      }
    }
    for (let i = 0; i < el.attributes.length; i++) {
      const a = el.attributes[i];
      if (a.name.startsWith('data-') && a.name !== 'data-healtest-ref') {
        attrs[a.name] = a.value;
      }
    }
    return attrs;
  }

  const candidates = Array.from(
    document.querySelectorAll(
      'a[href], button, input:not([type=hidden]), select, textarea, [role=button], [role=link], [role=checkbox]'
    )
  );

  const results: ElementRecord[] = [];
  let count = 0;

  for (const el of candidates) {
    const rect = el.getBoundingClientRect();
    if (!isVisible(el, rect)) continue;

    count++;
    const ref = 'e' + count;
    el.setAttribute('data-healtest-ref', ref);

    const role = getRole(el);
    const name = getName(el, role);
    const label = getLabel(el);
    const nearText = getNearText(el);
    const enabled = !(el as HTMLInputElement).disabled && el.getAttribute('aria-disabled') !== 'true';

    let empty = false;
    if (role === 'textbox' || role === 'combobox') {
      empty = ((el as HTMLInputElement).value || '').trim() === '';
    }

    let checked: boolean | null = null;
    if (role === 'checkbox' || role === 'radio') {
      checked = Boolean((el as HTMLInputElement).checked);
    }

    const selector = getSelector(el);
    const attrs = getAttrs(el);
    const tag = el.tagName.toLowerCase();
    const htmlEl = el as HTMLElement;
    const text = clean(htmlEl.innerText || htmlEl.textContent).slice(0, 80);
    const bbox = {
      x: Math.round(rect.x + window.scrollX),
      y: Math.round(rect.y + window.scrollY),
      w: Math.round(rect.width),
      h: Math.round(rect.height),
    };

    results.push({
      ref,
      role,
      name,
      tag,
      text,
      label,
      attrs,
      nearText,
      bbox,
      visible: true,
      enabled,
      empty,
      checked,
      selector,
    });
  }

  return results;
}

export async function captureSnapshot(
  page: Page,
  opts: { screenshot?: boolean } = { screenshot: false }
): Promise<PageSnapshot> {
  await page.waitForLoadState('domcontentloaded').catch(() => {});

  let url = page.url();
  let pagePath = new URL(url).pathname;
  let title = await page.title().catch(() => '');

  let headings: string[] = [];
  try {
    headings = await page.$$eval('h1, h2, h3', els =>
      els.map(h => (h.textContent || '').trim()).filter(Boolean)
    );
  } catch {
    await page.waitForLoadState('domcontentloaded').catch(() => {});
    url = page.url();
    pagePath = new URL(url).pathname;
    title = await page.title().catch(() => '');
    headings = await page.$$eval('h1, h2, h3', els =>
      els.map(h => (h.textContent || '').trim()).filter(Boolean)
    ).catch(() => []);
  }

  let elements: ElementRecord[] = [];
  try {
    elements = await page.evaluate(collectElements);
  } catch {
    await page.waitForLoadState('domcontentloaded').catch(() => {});
    elements = await page.evaluate(collectElements).catch(() => []);
  }

  const ariaYaml = await page.locator('body').ariaSnapshot().catch(() => '');
  const hash = contentHash(elements);

  let screenshotPath: string | null = null;
  if (opts?.screenshot) {
    const slug = pagePath.replace(/^\//, '').replace(/[^a-zA-Z0-9_-]+/g, '-') || 'index';
    const fileName = `${hash.slice(0, 12)}-${slug}.png`;
    const screenshotDir = join(HOME, 'screenshots');
    mkdirSync(screenshotDir, { recursive: true });
    screenshotPath = join(screenshotDir, fileName);
    await page.screenshot({ path: screenshotPath, fullPage: true });
  }

  return {
    pagePath,
    url,
    title,
    headings,
    elements,
    ariaYaml,
    contentHash: hash,
    screenshotPath,
  };
}
