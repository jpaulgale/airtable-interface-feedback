// Interface Feedback — Figma-style pinned comments for Airtable custom interface extensions.
// airtable-interface-feedback · MIT
//
// Drop-in: copy this one file next to your interface's index.tsx, render
//   <FeedbackLayer base={base} page="Dashboard" theme={MY_THEME} />
// once inside your App, and add an "Interface Feedback" table to the base (see README for the fields).
// Without the table nothing renders, so it is safe to ship.
//
// Two ways in: right-click anything → "Leave a comment here", or the Feedback button (bottom corner; its label
// slides out on hover) → comment mode, where every click leaves a note and open notes show as numbered pins.
// Each note stores who left it, the page, the element, its text, a CSS path + position to re-pin it, a readable
// Context trail (section › table › row › column › control), a Technical Detail block for whoever (or whatever
// agent) fixes it — HTML snippet, React component names, computed styles, page state — and the Build it was left on.
// Replies: one long-text cell per note, oldest first, each headed "— Name · date time". Resolve → Status = Resolved.
import React, {useEffect, useLayoutEffect, useMemo, useRef, useState} from 'react';
import {useRecords, useSession} from '@airtable/blocks/interface/ui';
import {type Base, type Table} from '@airtable/blocks/interface/models';

// ---- Theme: design one at playground/index.html and paste the result over this object (or pass `theme`). ----
export type FeedbackTheme = {
    accent: string; accentText: string; ink: string; surface: string; subtle: string; border: string; muted: string;
    /** 'inherit' = whatever font the interface already uses. Any other value is a CSS font stack; the layer doesn't
     *  load fonts, so the interface must already have it (many Airtable orgs block external font CDNs). */
    font: string; radius: number; fabSide: 'left' | 'right'; fabOffset: number; pinShape: 'drop' | 'circle' | 'square';
};
export const FEEDBACK_THEME: FeedbackTheme = {
    accent: '#166ee1', accentText: '#ffffff', ink: '#1d1f25', surface: '#ffffff', subtle: '#f2f4f8', border: '#d0d4dc',
    muted: '#616670', font: 'inherit', radius: 8, fabSide: 'left', fabOffset: 16, pinShape: 'circle',
};
// Every piece of text the layer shows. Override any of them with the `labels` prop (the playground writes this for you).
export const FB_LABELS = {
    button: 'Leave Comments', exit: 'Exit comment mode', modeTitle: 'Comment mode',
    modeHint: 'click anything on the page to leave a comment.', modeHintReadOnly: 'click a pin to read a comment.',
    menuHere: 'Leave a comment here', menuSelection: 'Leave a comment on selected text', menuShowAll: 'Show all comments',
    composerTitle: 'Leave a comment', composerPlaceholder: 'What should change here?',
    composerHint: 'Enter to save, Shift+Enter for a new line. Everyone can see this comment.',
    cancel: 'Cancel', save: 'Save comment', saving: 'Saving…',
    replyPlaceholder: 'Reply…', reply: 'Reply', sending: 'Sending…', close: 'Close', resolve: 'Mark resolved',
};
export type FeedbackLabels = typeof FB_LABELS;
export type FeedbackLayerProps = {
    base: Base; page: string; theme?: Partial<FeedbackTheme>; tableName?: string; build?: string; labels?: Partial<FeedbackLabels>;
};
const FB_TABLE = 'Interface Feedback';
// Field names in that table. Missing optional fields are skipped, so a minimal table (Comment, Page, Anchor,
// Position, Status) works; add the rest for richer traces.
const FB_F = {
    note: 'Comment', page: 'Page', element: 'Element', text: 'Element Text', anchor: 'Anchor',
    position: 'Position', by: 'Left By', email: 'Left By Email', status: 'Status',
    context: 'Context', tech: 'Technical Detail', build: 'Build', replies: 'Replies',
} as const;
const FB_BUILD = 'dev';
const PIN_RADIUS = {drop: '50% 50% 50% 0', circle: '50%', square: '6px'};
function fbThemeVars(t: FeedbackTheme): React.CSSProperties {
    return {
        '--fb-accent': t.accent, '--fb-on-accent': t.accentText, '--fb-ink': t.ink, '--fb-surface': t.surface, '--fb-subtle': t.subtle,
        '--fb-border': t.border, '--fb-muted': t.muted, '--fb-font': t.font === 'inherit' ? getComputedStyle(document.body).fontFamily : t.font, '--fb-radius': `${t.radius}px`,
        '--fb-fab-offset': `${t.fabOffset}px`, '--fb-pin-radius': PIN_RADIUS[t.pinShape],
    } as React.CSSProperties;
}
const FbSvg = ({d}: {d: string}) => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>
);
const FbIconComment = () => <FbSvg d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />;
const FbIconPins = () => <FbSvg d="M12 21s-6-5.3-6-10a6 6 0 0 1 12 0c0 4.7-6 10-6 10zM12 13a2 2 0 1 0 0-4 2 2 0 0 0 0 4z" />;
const FbIconClose = () => <FbSvg d="M18 6 6 18M6 6l12 12" />;

// @css:start — the playground reads this block verbatim (scripts/sync_playground.py), so keep it plain CSS.
const FB_CSS = `
.fb-root{font-family:var(--fb-font);font-size:14px;color:var(--fb-ink)}
.fb-fab{position:fixed;left:var(--fb-fab-offset);bottom:var(--fb-fab-offset);z-index:2147483000;display:flex;align-items:center;height:36px;padding:0 9px;border:0;border-radius:999px;background:var(--fb-accent);color:var(--fb-on-accent);font:600 13px/1 var(--fb-font);box-shadow:0 3px 10px rgba(0,0,0,.22);cursor:pointer}
.fb-root[data-fab=right] .fb-fab{left:auto;right:var(--fb-fab-offset)}
.fb-fab-icon{position:relative;display:flex}
.fb-fab-n{position:absolute;top:-7px;right:-8px;min-width:16px;height:16px;padding:0 4px;box-sizing:border-box;border-radius:8px;background:var(--fb-on-accent);color:var(--fb-accent);font:700 10px/16px system-ui,sans-serif;text-align:center}
.fb-fab-label{max-width:0;overflow:hidden;white-space:nowrap;transition:max-width .2s ease-out,margin-left .2s ease-out}
.fb-fab:hover .fb-fab-label,.fb-fab:focus-visible .fb-fab-label,.fb-fab[aria-pressed=true] .fb-fab-label{max-width:180px;margin-left:8px}
.fb-fab:hover .fb-fab-n,.fb-fab:focus-visible .fb-fab-n{display:none}
@media (prefers-reduced-motion:reduce){.fb-fab-label{transition:none}}
.fb-fab:focus-visible,.fb-btn:focus-visible,.fb-pin:focus-visible{outline:3px solid var(--fb-ink);outline-offset:2px}
.fb-fab[aria-pressed=true]{background:var(--fb-ink);color:var(--fb-surface)}
.fb-banner{position:fixed;bottom:0;left:0;right:0;z-index:2147482998;display:flex;align-items:center;gap:16px;flex-wrap:wrap;padding:14px 16px 14px 220px;background:var(--fb-ink);color:var(--fb-surface);font-size:14px}
.fb-root[data-fab=right] .fb-banner{padding:14px 220px 14px 16px}
@media (max-width:640px){.fb-banner,.fb-root[data-fab=right] .fb-banner{padding:10px 16px 68px;font-size:13px}}
.fb-hover{position:fixed;z-index:2147482999;pointer-events:none;border:2px dashed var(--fb-accent);border-radius:4px;background:color-mix(in srgb,var(--fb-accent) 7%,transparent)}
.fb-mode,.fb-mode *{cursor:crosshair!important}
.fb-menu{position:fixed;z-index:2147483001;background:var(--fb-surface);border:1px solid var(--fb-border);border-radius:calc(var(--fb-radius) - 2px);box-shadow:0 6px 20px rgba(0,0,0,.2);padding:4px;min-width:200px}
.fb-menu button{display:flex;align-items:center;gap:10px;width:100%;text-align:left;padding:10px 12px;border:0;background:none;color:inherit;border-radius:calc(var(--fb-radius) - 4px);font:inherit;cursor:pointer}
.fb-menu button:hover,.fb-menu button:focus-visible{background:var(--fb-subtle);outline:none}
.fb-card{position:fixed;z-index:2147483001;width:min(340px,calc(100vw - 32px));box-sizing:border-box;background:var(--fb-surface);color:var(--fb-ink);border:1px solid var(--fb-border);border-radius:var(--fb-radius);box-shadow:0 8px 28px rgba(0,0,0,.22);padding:14px;display:grid;gap:10px;cursor:auto}
.fb-card *{cursor:auto}
.fb-card h3{margin:0;font-size:15px}
.fb-quote{margin:0;padding:6px 10px;border-left:3px solid var(--fb-accent);background:var(--fb-subtle);color:var(--fb-muted);font-size:13px;max-height:60px;overflow:hidden;overflow-wrap:anywhere}
.fb-card textarea{width:100%;box-sizing:border-box;field-sizing:content;min-height:4lh;max-height:40vh;overflow-y:auto;padding:8px;border:1px solid var(--fb-border);border-radius:calc(var(--fb-radius) - 4px);background:var(--fb-surface);color:var(--fb-ink);font:inherit;line-height:1.4;resize:none}
.fb-meta{font-size:12px;color:var(--fb-muted)}
.fb-row{display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap}
.fb-btn{padding:8px 14px;border-radius:calc(var(--fb-radius) - 4px);border:1px solid var(--fb-border);background:var(--fb-surface);color:var(--fb-ink);font:600 13px var(--fb-font);cursor:pointer}
.fb-btn.fb-primary{background:var(--fb-accent);border-color:var(--fb-accent);color:var(--fb-on-accent)}
.fb-btn:disabled{opacity:.5;cursor:default}
.fb-note{max-height:min(560px,calc(100vh - 32px));overflow-y:auto}
.fb-thread{list-style:none;margin:0;padding:0 0 0 10px;border-left:2px solid var(--fb-border);display:grid;gap:10px}
.fb-reply{display:flex;gap:8px;align-items:flex-end}
.fb-reply textarea{min-height:calc(1lh + 18px);flex:1}
.fb-err{color:#b00020;font-size:13px}
.fb-pin{position:fixed;z-index:2147483000;width:26px;height:26px;margin:-13px 0 0 -13px;border-radius:var(--fb-pin-radius);border:2px solid var(--fb-surface);background:var(--fb-accent);color:var(--fb-on-accent);font:700 12px/22px system-ui,sans-serif;text-align:center;box-shadow:0 2px 6px rgba(0,0,0,.3);cursor:pointer!important;padding:0}
.fb-pin[aria-expanded=true]{background:var(--fb-ink);color:var(--fb-surface)}
`;
// @css:end

type FbNote = {id: string; note: string; element: string; text: string; anchor: string; x: number; y: number; by: string; at: Date | null; replies: FbReply[]};
type FbReply = {by: string; at: string; text: string};
type FbDraft = {selected?: string; element: string; context: string; tech: string; text: string; anchor: string; x: number; y: number; cx: number; cy: number};

function fbIsOurs(el: Element | null): boolean {
    return !!el?.closest('.fb-root');
}
// The nearest ancestor worth naming: something with a little text, not the whole page.
// What's really under the pointer. Disabled controls get no mouse events (the browser hands them to an ancestor),
// but they do show up in a hit test; shadow DOM parts come back as their host (e.g. a web component).
function fbHit(fallback: Element, x: number, y: number): Element {
    return document.elementsFromPoint(x, y).find((e) => !fbIsOurs(e) && fallback.contains(e)) || fallback;
}
function fbTarget(el: Element): Element {
    let cur: Element | null = el;
    while (cur && cur !== document.body) {
        const t = ((cur as HTMLElement).innerText || '').trim();
        if (t && t.length <= 400) return cur;
        if (t.length > 400) break;
        cur = cur.parentElement;
    }
    return el;
}
function fbDescribe(el: Element): string {
    const tag = el.tagName.toLowerCase();
    const label = el.getAttribute('aria-label') || el.getAttribute('label') || el.getAttribute('title') || el.getAttribute('placeholder');
    const role = el.getAttribute('role');
    const heading = el.closest('section,article,[role=dialog]')?.querySelector('h1,h2,h3,h4')?.textContent?.trim();
    return [tag + (role ? ` (${role})` : ''), label && `"${label}"`, heading && `in "${heading.slice(0, 60)}"`].filter(Boolean).join(' ');
}
const fbTxt = (el: Element | null | undefined, n = 80): string => ((el as HTMLElement | null)?.innerText || el?.textContent || '').trim().replace(/\s+/g, ' ').slice(0, n);
const fbLabelOf = (el: Element): string =>
    el.getAttribute('aria-label') || el.getAttribute('label') || el.getAttribute('title') || fbTxt(el, 60);
// Readable trail from the section down to the thing clicked: Summary › table "Projects" › row "X" › column "Deadline" › "Jan 30".
function fbContext(el: Element, page: string): string {
    const parts: string[] = [page];
    const dialog = el.closest('[role=dialog],dialog');
    if (dialog) parts.push(`dialog "${dialog.getAttribute('heading') || fbTxt(dialog.querySelector('h1,h2,h3'), 60) || 'untitled'}"`);
    // Nearest heading: inside the closest section/article, else the last heading above the element.
    const sec = el.closest('section,article,fieldset');
    let head = sec?.querySelector('h1,h2,h3,h4,legend') || null;
    if (!head) {
        const all = [...document.querySelectorAll('h1,h2,h3,h4')].filter((h) => !fbIsOurs(h));
        head = all.filter((h) => h.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING).pop() || null;
    }
    const secName = sec?.getAttribute('aria-label') || (sec?.getAttribute('aria-labelledby') && fbTxt(document.getElementById(sec.getAttribute('aria-labelledby')!), 60));
    if (secName && !dialog) parts.push(`section "${secName.slice(0, 60)}"`);
    else if (head && !dialog) parts.push(`section "${fbTxt(head, 60)}"`);
    const tab = el.closest('[role=tabpanel]');
    if (tab) { const id = tab.getAttribute('aria-labelledby'); const t = id && document.getElementById(id); if (t) parts.push(`tab "${fbTxt(t, 40)}"`); }
    const cell = el.closest('td,th,[role=cell],[role=gridcell],[role=columnheader]');
    const row = el.closest('tr,[role=row]');
    const table = el.closest('table,[role=table],[role=grid]');
    if (table) {
        const cap = table.querySelector('caption')?.textContent?.trim() || table.getAttribute('aria-label');
        parts.push(`table${cap ? ` "${cap.slice(0, 50)}"` : ''}`);
        if (row && !row.closest('thead')) {
            const key = row.querySelector('th[scope=row]') || row.querySelector('td,[role=cell],[role=gridcell]');
            if (key && key !== cell) parts.push(`row "${fbTxt(key, 60)}"`);
            else parts.push(`row ${Array.prototype.indexOf.call(row.parentElement?.children || [], row) + 1}`);
        }
        if (cell && row) {
            const i = Array.prototype.indexOf.call(row.children, cell);
            const hdr = table.querySelectorAll('thead th,[role=columnheader]')[i];
            if (hdr) parts.push(`column "${fbTxt(hdr, 40)}"`);
        }
    } else {
        const item = el.closest('li,[role=listitem],[role=option],details');
        if (item) {
            const sum = item.tagName === 'DETAILS' ? item.querySelector('summary') : null;
            const first = (((sum || item) as HTMLElement).innerText || '').trim().split('\n')[0].trim().slice(0, 60);
            const c = el.closest('button,a,[role=button]');
            if (first && !(c && item.contains(c) && fbTxt(c, 200).startsWith(first))) parts.push(`item "${first}"`);
        }
    }
    const ctl = el.closest('button,a,label,[role=button],[role=tab],[role=switch],[role=checkbox],[role=combobox],summary,input,select,textarea');
    if (ctl) parts.push(`${(ctl.getAttribute('role') || ctl.tagName.toLowerCase())} "${fbLabelOf(ctl).slice(0, 60)}"`);
    else if (!cell && fbTxt(el, 200).length <= 120 && !/^(SECTION|ARTICLE|MAIN|UL|OL)$/.test(el.tagName)) parts.push(`"${fbTxt(el, 60)}"`);
    if (cell) parts.push(`"${fbTxt(cell, 60)}"`);
    return parts.join(' › ');
}
// What an agent needs to find the code: the element's markup, its ancestors' classes, and what state the page was in.
// Borrowed from Agentation: the React components that rendered the element (innermost first) — the quickest way
// to the code — and the computed styles, so "make this bold" or "too cramped" comes with the current values.
function fbComponents(el: Element): string {
    const key = Object.keys(el).find((k) => k.startsWith('__reactFiber'));
    const names: string[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (let f = key ? (el as any)[key] : null; f && names.length < 8; f = f.return) {
        const t = f.type;
        const n = typeof t === 'function' ? t.displayName || t.name : t && typeof t === 'object' ? t.displayName || t.render?.name || t.type?.name : '';
        if (n && n.length > 3 && /^[A-Z]/.test(n) && !/^(Fb|Feedback)/.test(n) && names[names.length - 1] !== n) names.push(n);
    }
    // Production bundles minify component names ("NS"), so short names are dropped; say so rather than mislead.
    return names.join(' < ');
}
function fbStyles(el: Element): string {
    const c = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    const pick = ['font-family', 'font-size', 'font-weight', 'line-height', 'color', 'background-color', 'text-align', 'display',
        'padding', 'margin', 'gap', 'border', 'border-radius', 'white-space', 'overflow'];
    const out = pick.map((k) => [k, c.getPropertyValue(k)] as const)
        .filter(([k, v]) => v && !['normal', 'none', '0px', 'auto', 'rgba(0, 0, 0, 0)', 'visible', 'start'].includes(v) && !(k === 'border' && v.startsWith('0px')))
        .map(([k, v]) => `${k}: ${k === 'font-family' ? v.split(',')[0] : v}`);
    return `${Math.round(r.width)}x${Math.round(r.height)} at ${Math.round(r.left)},${Math.round(r.top + window.scrollY)}; ${out.join('; ')}`;
}
function fbTech(el: Element, cx: number, cy: number, selected?: string): string {
    const clean = (h: string) => h.replace(/<svg[\s\S]*?<\/svg>/g, '<svg/>').replace(/\sstyle="[^"]*"/g, '').replace(/\s+/g, ' ');
    const html = clean(el.outerHTML);
    const ancestors: string[] = [];
    for (let a = el.parentElement; a && a !== document.body && ancestors.length < 8; a = a.parentElement) {
        const cls = typeof a.className === 'string' ? a.className.trim().split(/\s+/).slice(0, 6).join('.') : '';
        ancestors.push(a.tagName.toLowerCase() + (a.id ? `#${a.id}` : '') + (cls ? `.${cls}` : ''));
    }
    const vis = (e: Element) => !fbIsOurs(e) && (e as HTMLElement).offsetParent !== null;
    const label = (e: Element) => {
        const id = e.id && document.querySelector(`label[for="${e.id}"]`);
        return e.getAttribute('label') || e.getAttribute('aria-label') || (id ? fbTxt(id, 40) : '') || e.getAttribute('placeholder') || e.getAttribute('name') || e.tagName.toLowerCase();
    };
    const fields = [...document.querySelectorAll('input,select,textarea,[role=combobox],[role=switch],[role=checkbox]')]
        .filter(vis)
        .map((e) => {
            const v = (e as HTMLInputElement).type === 'checkbox' || e.getAttribute('aria-checked') !== null
                ? ((e as HTMLInputElement).checked || e.getAttribute('aria-checked') === 'true' ? 'on' : '') : String((e as HTMLInputElement).value ?? e.getAttribute('value') ?? '');
            return v ? `${label(e)} = ${v.slice(0, 60)}` : '';
        })
        .filter(Boolean).slice(0, 15);
    const state = {
        viewport: `${window.innerWidth}x${window.innerHeight}`, scrollY: Math.round(window.scrollY), click: `${Math.round(cx)},${Math.round(cy)}`,
        dialogs: [...document.querySelectorAll('dialog[open],[role=dialog]')].filter((d) => !fbIsOurs(d))
            .map((d) => d.getAttribute('heading') || fbTxt(d.querySelector('h1,h2,h3'), 60) || '(dialog)'),
        selectedTabs: [...document.querySelectorAll('[aria-selected=true],[aria-current=page],[aria-current=true]')].filter(vis).map((t) => fbTxt(t, 40)),
        pressed: [...document.querySelectorAll('[aria-pressed=true]')].filter(vis).map((t) => fbTxt(t, 40)),
        expanded: [...document.querySelectorAll('[aria-expanded=true],details[open] > summary')].filter(vis).map((t) => fbTxt(t, 40)).slice(0, 15),
        fields,
    };
    return [
        `HTML: ${html.length > 1500 ? html.slice(0, 1500) + ' …' : html}`,
        ...(selected ? [`Selected text: "${selected}"`] : []),
        `React components: ${fbComponents(el) || '(none found — names are minified in production builds)'}`,
        `Ancestors: ${ancestors.join(' < ')}`,
        `Computed style: ${fbStyles(el)}`,
        `State: ${JSON.stringify(state, null, 1)}`,
        `URL: ${location.href.slice(0, 300)}`,
        `Browser: ${navigator.userAgent}`,
    ].join('\n\n');
}
const FB_REPLY_HEAD = /^— (.+?) · (.+)$/;
function fbParseReplies(cell: string): FbReply[] {
    const out: FbReply[] = [];
    for (const line of cell.split('\n')) {
        const m = line.match(FB_REPLY_HEAD);
        if (m) out.push({by: m[1], at: m[2], text: ''});
        else if (out.length) out[out.length - 1].text += (out[out.length - 1].text ? '\n' : '') + line;
    }
    return out.map((r) => ({...r, text: r.text.trim()})).filter((r) => r.text);
}
function fbPath(el: Element): string {
    const parts: string[] = [];
    let cur: Element | null = el;
    while (cur && cur !== document.body && parts.length < 12) {
        const p: Element | null = cur.parentElement;
        if (!p) break;
        const i = Array.prototype.indexOf.call(p.children, cur) + 1;
        parts.unshift(`${cur.tagName.toLowerCase()}:nth-child(${i})`);
        cur = p;
    }
    return parts.length ? 'body > ' + parts.join(' > ') : '';
}
function fbDraftAt(target: Element, cx: number, cy: number, page: string, selected?: string): FbDraft {
    const el = fbTarget(target);
    const r = el.getBoundingClientRect();
    // Position: where on the element (fractions) the click was, so the pin follows the element as the page scrolls.
    const fx = r.width ? (cx - r.left) / r.width : 0, fy = r.height ? (cy - r.top) / r.height : 0;
    return {
        element: fbDescribe(el), context: fbContext(target, page), tech: fbTech(el, cx, cy, selected), selected,
        text: selected || ((el as HTMLElement).innerText || '').trim().replace(/\s+\n/g, '\n').slice(0, 1000),
        anchor: fbPath(el), x: Math.round(fx * 1000) / 1000, y: Math.round(fy * 1000) / 1000, cx, cy,
    };
}
function fbPinPoint(n: FbNote): {left: number; top: number} | null {
    let el: Element | null = null;
    try { el = n.anchor ? document.querySelector(n.anchor) : null; } catch { el = null; }
    if (!el) return null;
    const r = el.getBoundingClientRect();
    if (!r.width && !r.height) return null;
    return {left: r.left + n.x * r.width, top: r.top + n.y * r.height};
}
function fbClamp(x: number, y: number, w = 360, h = 300): {left: number; top: number} {
    return {left: Math.max(8, Math.min(x, window.innerWidth - w - 8)), top: Math.max(8, Math.min(y, window.innerHeight - h - 8))};
}

export function FeedbackLayer({base, page, theme, tableName = FB_TABLE, build = FB_BUILD, labels}: FeedbackLayerProps): React.ReactElement | null {
    const table = base.getTableByNameIfExists(tableName);
    return table ? <FeedbackLayerInner table={table} page={page} theme={{...FEEDBACK_THEME, ...theme}} build={build} L={{...FB_LABELS, ...labels}} /> : null;
}
function FeedbackLayerInner({table, page, theme, build, L}: {table: Table; page: string; theme: FeedbackTheme; build: string; L: FeedbackLabels}): React.ReactElement {
    const session = useSession();
    const user = session?.currentUser ?? null;
    const records = useRecords(table);
    const f = (k: keyof typeof FB_F) => table.getFieldByNameIfExists(FB_F[k]);
    const notes: FbNote[] = useMemo(() => {
        const s = (r: (typeof records)[number], k: keyof typeof FB_F) => { const fld = f(k); return fld ? r.getCellValueAsString(fld) : ''; };
        return records
            .filter((r) => s(r, 'page') === page && s(r, 'status') !== 'Resolved')
            .map((r) => {
                const [x, y] = s(r, 'position').split(',').map(Number);
                return {id: r.id, note: s(r, 'note'), element: s(r, 'element'), text: s(r, 'text'), anchor: s(r, 'anchor'),
                    x: x || 0, y: y || 0, by: s(r, 'by'), at: r.createdTime ?? null, replies: fbParseReplies(s(r, 'replies'))};
            });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [records, page, table]);

    const canWrite = table.hasPermissionToCreateRecords();
    const [mode, setMode] = useState(false);
    const [menu, setMenu] = useState<{x: number; y: number; draft: FbDraft} | null>(null);
    const [draft, setDraft] = useState<FbDraft | null>(null);
    const [open, setOpen] = useState<string | null>(null);
    const [hover, setHover] = useState<DOMRect | null>(null);
    const [, tick] = useState(0);

    useEffect(() => {
        if (!document.getElementById('fb-css')) {
            const s = document.createElement('style');
            s.id = 'fb-css';
            s.textContent = FB_CSS;
            document.head.appendChild(s);
        }
    }, []);

    // Right-click anywhere (except text fields and selected text, which keep the browser's menu).
    useEffect(() => {
        const onMenu = (e: MouseEvent) => {
            const t = e.target as Element;
            if (fbIsOurs(t) || !canWrite || t.closest('input,textarea,[contenteditable=true]')) return;
            const sel = window.getSelection();
            const selected = sel && !sel.isCollapsed ? String(sel).trim().replace(/\s+/g, ' ').slice(0, 500) : '';
            if (selected) {
                const node = sel!.getRangeAt(0).commonAncestorContainer;
                const host = (node.nodeType === 1 ? node : node.parentElement) as Element;
                e.preventDefault();
                setDraft(null);
                setMenu({x: e.clientX, y: e.clientY, draft: fbDraftAt(host, e.clientX, e.clientY, page, selected)});
                return;
            }
            e.preventDefault();
            setDraft(null);
            setMenu({x: e.clientX, y: e.clientY, draft: fbDraftAt(fbHit(t, e.clientX, e.clientY), e.clientX, e.clientY, page)});
        };
        document.addEventListener('contextmenu', onMenu);
        return () => document.removeEventListener('contextmenu', onMenu);
    }, [canWrite, page]);

    // Comment mode: outline what's under the mouse; a click leaves a note there instead of doing its normal thing.
    useEffect(() => {
        if (!mode) { setHover(null); return; }
        if (canWrite) document.documentElement.classList.add('fb-mode');
        const onMove = (e: MouseEvent) => {
            const t = e.target as Element;
            setHover(fbIsOurs(t) || !canWrite ? null : fbTarget(fbHit(t, e.clientX, e.clientY)).getBoundingClientRect());
        };
        const onClick = (e: MouseEvent) => {
            const t = e.target as Element;
            if (fbIsOurs(t) || !canWrite) return;
            e.preventDefault();
            e.stopPropagation();
            setMenu(null);
            setOpen(null);
            setDraft(fbDraftAt(fbHit(t, e.clientX, e.clientY), e.clientX, e.clientY, page));
        };
        const block = (e: Event) => { if (canWrite && !fbIsOurs(e.target as Element)) { e.preventDefault(); e.stopPropagation(); } };
        document.addEventListener('mousemove', onMove, true);
        document.addEventListener('click', onClick, true);
        document.addEventListener('mousedown', block, true);
        document.addEventListener('pointerdown', block, true);
        return () => {
            document.documentElement.classList.remove('fb-mode');
            document.removeEventListener('mousemove', onMove, true);
            document.removeEventListener('click', onClick, true);
            document.removeEventListener('mousedown', block, true);
            document.removeEventListener('pointerdown', block, true);
        };
    }, [mode, canWrite, page]);

    // Keep pins on their elements while the page scrolls or resizes.
    useEffect(() => {
        if (!mode) return;
        const bump = () => tick((n) => n + 1);
        window.addEventListener('scroll', bump, true);
        window.addEventListener('resize', bump);
        const iv = window.setInterval(bump, 1000);
        return () => { window.removeEventListener('scroll', bump, true); window.removeEventListener('resize', bump); window.clearInterval(iv); };
    }, [mode]);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key !== 'Escape') return;
            if (menu || draft || open) { setMenu(null); setDraft(null); setOpen(null); } else setMode(false);
        };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [menu, draft, open]);

    const save = async (d: FbDraft, text: string) => {
        const fields: Record<string, unknown> = {};
        const put = (k: keyof typeof FB_F, v: unknown) => { const fld = f(k); if (fld) fields[fld.id] = v; };
        put('note', text);
        put('page', page);
        put('element', d.element);
        put('text', d.text);
        put('anchor', d.anchor);
        put('context', d.context);
        put('tech', d.tech);
        put('build', build);
        put('position', `${d.x},${d.y}`);
        put('by', user?.name || user?.email || 'Unknown');
        put('email', user?.email || '');
        put('status', {name: 'Open'});
        await table.createRecordAsync(fields);
    };
    // Appends to the Replies cell as this client currently sees it (live-synced by useRecords).
    const reply = async (id: string, text: string) => {
        const fld = f('replies');
        if (!fld) throw new Error('the table has no Replies field');
        const rec = records.find((r) => r.id === id);
        const prev = rec ? rec.getCellValueAsString(fld).trimEnd() : '';
        const head = `— ${(user?.name || user?.email || 'Unknown').replace(/ · /g, ' ')} · ${new Date().toLocaleString([], {dateStyle: 'medium', timeStyle: 'short'})}`;
        await table.updateRecordAsync(id, {[fld.id]: `${prev ? prev + '\n\n' : ''}${head}\n${text}`});
    };
    const resolve = async (id: string) => {
        const fld = f('status');
        if (fld && table.hasPermissionToUpdateRecords()) await table.updateRecordAsync(id, {[fld.id]: {name: 'Resolved'}});
        setOpen(null);
    };

    const openNote = notes.find((n) => n.id === open) || null;
    const openAt = openNote ? fbPinPoint(openNote) : null;
    return (
        <div className="fb-root" style={fbThemeVars(theme)} data-fab={theme.fabSide}>
            {mode && (
                <div className="fb-banner" role="status">
                    <span><b>{L.modeTitle}</b> — {canWrite ? L.modeHint : L.modeHintReadOnly}</span>
                </div>
            )}
            {mode && hover && !draft && <div className="fb-hover" style={{left: hover.left - 3, top: hover.top - 3, width: hover.width + 6, height: hover.height + 6}} />}
            {mode && notes.map((n, i) => {
                const p = fbPinPoint(n);
                return p && (
                    <button key={n.id} type="button" className="fb-pin" style={p} aria-expanded={open === n.id}
                        aria-label={`Comment ${i + 1} from ${n.by}`} title={`${n.by}: ${n.note}`}
                        onClick={() => { setDraft(null); setOpen(open === n.id ? null : n.id); }}>{i + 1}</button>
                );
            })}
            {openNote && (
                <div className="fb-card fb-note" role="dialog" aria-label="Comment"
                    style={{left: fbClamp((openAt?.left ?? 40) + 16, 0).left, top: (openAt?.top ?? 80) + 8}}>
                    <div className="fb-meta"><b>{openNote.by}</b>{openNote.at && ` · ${openNote.at.toLocaleString()}`}</div>
                    <div style={{whiteSpace: 'pre-wrap', overflowWrap: 'anywhere'}}>{openNote.note}</div>
                    {openNote.text && <p className="fb-quote">{openNote.text}</p>}
                    {openNote.replies.length > 0 && (
                        <ol className="fb-thread" aria-label="Replies">
                            {openNote.replies.map((r, i) => (
                                <li key={i}><div className="fb-meta"><b>{r.by}</b> · {r.at}</div><div style={{whiteSpace: 'pre-wrap', overflowWrap: 'anywhere'}}>{r.text}</div></li>
                            ))}
                        </ol>
                    )}
                    {table.hasPermissionToUpdateRecords() && f('replies') && <FbReplyBox key={openNote.id} L={L} onSend={(t) => reply(openNote.id, t)} />}
                    <div className="fb-row">
                        <button type="button" className="fb-btn" onClick={() => setOpen(null)}>{L.close}</button>
                        {table.hasPermissionToUpdateRecords() && <button type="button" className="fb-btn" onClick={() => resolve(openNote.id)}>{L.resolve}</button>}
                    </div>
                </div>
            )}
            {menu && (
                <FbDismiss onDismiss={() => setMenu(null)}>
                    <div className="fb-menu" role="menu" style={fbClamp(menu.x, menu.y, 260, 160)}>
                        <button type="button" role="menuitem" autoFocus onClick={() => { setDraft(menu.draft); setMenu(null); }}><FbIconComment /> {menu.draft.selected ? L.menuSelection : L.menuHere}</button>
                        <button type="button" role="menuitem" onClick={() => { setMode(true); setMenu(null); }}>
                            <FbIconPins /> {L.menuShowAll} ({notes.length})
                        </button>
                    </div>
                </FbDismiss>
            )}
            {draft && <FbComposer draft={draft} L={L} onCancel={() => setDraft(null)}
                onSave={async (text) => { await save(draft, text); setDraft(null); }} />}
            {/* Compact: accent pill with the chat icon (and a count of open notes); the label slides out on hover or
                keyboard focus, and stays out in comment mode so "Exit comment mode" is always visible. */}
            <button type="button" className="fb-fab" aria-pressed={mode}
                aria-label={mode ? L.exit : `${L.button}${notes.length ? ` (${notes.length} open)` : ''}`}
                onClick={() => { setMode(!mode); setDraft(null); setOpen(null); }}>
                <span className="fb-fab-icon" aria-hidden="true">
                    {mode ? <FbIconClose /> : <FbIconComment />}
                    {!mode && notes.length > 0 && <span className="fb-fab-n">{notes.length}</span>}
                </span>
                <span className="fb-fab-label" aria-hidden="true">{mode ? L.exit : L.button}</span>
            </button>
        </div>
    );
}
// Text boxes grow with what's typed, like Google Docs. CSS `field-sizing: content` does it natively (Chromium);
// elsewhere this sizes the box to its scrollHeight on every change. max-height in the CSS caps both, then it scrolls.
const FB_FIELD_SIZING = typeof CSS !== 'undefined' && CSS.supports('field-sizing', 'content');
function useAutoGrow(value: string): React.RefObject<HTMLTextAreaElement> {
    const ref = useRef<HTMLTextAreaElement>(null);
    useLayoutEffect(() => {
        const el = ref.current;
        if (!el || FB_FIELD_SIZING) return;
        el.style.height = 'auto';
        el.style.height = `${el.scrollHeight + el.offsetHeight - el.clientHeight}px`;
    }, [value]);
    return ref;
}
function FbDismiss({onDismiss, children}: {onDismiss: () => void; children: React.ReactNode}): React.ReactElement {
    const ref = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const away = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) onDismiss(); };
        const t = window.setTimeout(() => document.addEventListener('mousedown', away, true), 0);
        return () => { window.clearTimeout(t); document.removeEventListener('mousedown', away, true); };
    }, [onDismiss]);
    return <div ref={ref}>{children}</div>;
}
function FbReplyBox({L, onSend}: {L: FeedbackLabels; onSend: (t: string) => Promise<void>}): React.ReactElement {
    const [text, setText] = useState('');
    const grow = useAutoGrow(text);
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState('');
    const send = async () => {
        if (!text.trim() || busy) return;
        setBusy(true);
        setErr('');
        try { await onSend(text.trim()); setText(''); } catch (e) { setErr(`Couldn't send: ${(e as Error).message || e}`); }
        setBusy(false);
    };
    return (
        <div>
            <div className="fb-reply">
                <textarea ref={grow} rows={1} aria-label={L.reply} placeholder={L.replyPlaceholder} value={text} onChange={(e) => setText(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); } }} />
                <button type="button" className="fb-btn fb-primary" disabled={!text.trim() || busy} onClick={send}>{busy ? L.sending : L.reply}</button>
            </div>
            {err && <div className="fb-err" role="alert">{err}</div>}
        </div>
    );
}
function FbComposer({draft, L, onCancel, onSave}: {draft: FbDraft; L: FeedbackLabels; onCancel: () => void; onSave: (t: string) => Promise<void>}): React.ReactElement {
    const [text, setText] = useState('');
    const grow = useAutoGrow(text);
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState('');
    const submit = async () => {
        if (!text.trim() || busy) return;
        setBusy(true);
        setErr('');
        try { await onSave(text.trim()); } catch (e) { setErr(`Couldn't save: ${(e as Error).message || e}`); setBusy(false); }
    };
    return (
        <div className="fb-card" role="dialog" aria-label={L.composerTitle} style={fbClamp(draft.cx + 12, draft.cy + 12)}>
            <h3>{L.composerTitle}</h3>
            {draft.text && <p className="fb-quote">{draft.text}</p>}
            <textarea ref={grow} autoFocus value={text} placeholder={L.composerPlaceholder} onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); submit(); } }} />
            <div className="fb-meta">{L.composerHint}</div>
            {err && <div className="fb-err" role="alert">{err}</div>}
            <div className="fb-row">
                <button type="button" className="fb-btn" onClick={onCancel}>{L.cancel}</button>
                <button type="button" className="fb-btn fb-primary" disabled={!text.trim() || busy} onClick={submit}>{busy ? L.saving : L.save}</button>
            </div>
        </div>
    );
}
