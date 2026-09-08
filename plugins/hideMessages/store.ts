/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { del, get, set } from "@api/DataStore";
import { Logger } from "@utils/Logger";
import { Message } from "@vencord/discord-types";
import { findByPropsLazy } from "@webpack";
import { FluxDispatcher, MessageCache, MessageStore, SelectedChannelStore } from "@webpack/common";

import { settings } from "./settings";

/**
 * Every module that might know how to load a channel.
 *
 * Discord's message action creators have moved around, and betting on a single lookup
 * meant a silent no-op whenever it guessed wrong - which is exactly what left channels
 * empty after unhiding. Each is tried in turn instead.
 */
const Loaders = [
    // both props together is unmistakably MessageActionCreators, not some other module
    // that happens to expose a `fetchMessages`
    findByPropsLazy("fetchMessages", "jumpToPresent"),
    findByPropsLazy("fetchMessages"),
    findByPropsLazy("jumpToPresent")
];

/** Call the first loader that actually has `method`, and say whether anything ran */
function callLoader(method: "fetchMessages" | "jumpToPresent", channelId: string) {
    for (const loader of Loaders) {
        try {
            const target: any = loader;
            if (typeof target?.[method] !== "function") continue;

            if (method === "fetchMessages") target.fetchMessages({ channelId, limit: 50 });
            else target.jumpToPresent(channelId, 50);

            return true;
        } catch {
            // not on this build, keep looking
        }
    }

    return false;
}

const SCROLLER = '[data-list-id^="chat-messages"]';

const KEY = "HideMessages_Hidden";
const logger = new Logger("CustomPluginHideMessages");

type Range = [from: string, to: string];

interface Stored {
    messages: string[];
    ranges: [string, Range[]][];
    channels: [string, string[]][];
}

/**
 * Individually hidden message ids, grouped by channel.
 *
 * Nested rather than one flat `channel:message` set so lookups are two map hits and no
 * string building.
 */
let hiddenMessages = new Map<string, Set<string>>();

/**
 * Hidden spans, as pairs of message ids, grouped by channel.
 *
 * Stored as endpoints rather than as the list of ids between them, because that list isn't
 * knowable: most of a span usually isn't loaded. Message ids are snowflakes, so they sort
 * by time and "is this message in the span" is just a comparison against the two ends.
 * That holds for messages loaded later or never loaded at all.
 */
let hiddenRanges = new Map<string, Range[]>();

/**
 * Channels hidden wholesale -> allowlist of message ids that stay visible (messages that
 * arrived after the channel was hidden), so the conversation carries on as normal on top
 * of a blank history.
 */
let hiddenChannels = new Map<string, Set<string>>();

/**
 * Consecutive fully hidden pages per channel, reset as soon as one has something to show.
 *
 * Hiding a long stretch leaves the viewport underfull, so Discord pages backwards to fill
 * it. That is correct, and is how it reaches the messages before the stretch, but in a
 * very large channel it could keep going for a while, so it gets a ceiling.
 */
const blankPages = new Map<string, number>();

/** ~300 messages of hidden stretch to page past before giving up on older history */
const MAX_BLANK_PAGES = 6;

/** Channels whose history loading we switched off, so it can be switched back on */
const clamped = new Set<string>();

/** `${channelId}:${messageId}` for every rule currently in the stylesheet */
const appliedRules = new Set<string>();

let styleEl: HTMLStyleElement | null = null;
let observer: MutationObserver | null = null;
let observed: Element | null = null;
let enabled = false;

const keyFor = (channelId: string, messageId: string) => `${channelId}:${messageId}`;

/** Snowflakes are numeric strings of varying length, so compare length first */
function cmpId(a: string, b: string) {
    if (a.length !== b.length) return a.length - b.length;
    return a < b ? -1 : a > b ? 1 : 0;
}

function inRanges(ranges: Range[] | undefined, id: string) {
    if (!ranges) return false;

    for (const [from, to] of ranges) {
        if (cmpId(id, from) >= 0 && cmpId(id, to) <= 0) return true;
    }

    return false;
}

/**
 * Individual and range hides only.
 *
 * A wholly hidden channel is handled by emptying the load instead: it never pages
 * backwards, so there's no anchor to keep moving, and dropping the messages outright is
 * what makes the channel read as untouched - no rows, no date separators, just the intro.
 */
function isHidden(channelId: string, id: string) {
    return !!hiddenMessages.get(channelId)?.has(id) || inRanges(hiddenRanges.get(channelId), id);
}

/** Whether this channel has anything hidden at all, wholesale or piecemeal */
export const hasHidesIn = (channelId: string) =>
    hiddenChannels.has(channelId)
    || !!hiddenMessages.get(channelId)?.size
    || !!hiddenRanges.get(channelId)?.length;

// ---------------------------------------------------------------- state helpers

function addHidden(channelId: string, messageId: string) {
    let ids = hiddenMessages.get(channelId);
    if (!ids) hiddenMessages.set(channelId, ids = new Set());

    ids.add(messageId);
}

/** Keep spans sorted and non-overlapping, so the list can't grow without bound */
function mergeRanges(ranges: Range[]) {
    ranges.sort((a, b) => cmpId(a[0], b[0]));

    const merged: Range[] = [];
    for (const range of ranges) {
        const last = merged[merged.length - 1];

        if (last && cmpId(range[0], last[1]) <= 0) {
            if (cmpId(range[1], last[1]) > 0) last[1] = range[1];
        } else {
            merged.push(range);
        }
    }

    return merged;
}

function addRange(channelId: string, a: string, b: string) {
    // whichever end was picked first, store it oldest to newest
    const range: Range = cmpId(a, b) <= 0 ? [a, b] : [b, a];

    hiddenRanges.set(channelId, mergeRanges([...(hiddenRanges.get(channelId) ?? []), range]));
}

// ---------------------------------------------------------------- styling

const selectorFor = (key: string) => `#chat-messages-${key.replace(":", "-")}`;

/**
 * Hide one row, once.
 *
 * Rows are hidden rather than dropped from the payload because Discord pages backwards
 * from the oldest message it is holding. Filter a page down to nothing and that anchor
 * never moves, so the next request asks for the very same page, and the one after that,
 * forever. Leaving the messages in the store keeps paging moving, which is what lets it
 * walk past a hidden stretch and reach the messages underneath.
 */
function addRule(channelId: string, messageId: string) {
    const key = keyFor(channelId, messageId);
    if (appliedRules.has(key)) return;

    appliedRules.add(key);

    /*
     * Appending one rule is cheaper than rewriting the sheet, but it can't be trusted on
     * its own: `sheet` is null until the browser has parsed the element, and marking the
     * key applied above means a later call would skip it and the row would never hide.
     * Writing the whole set out instead is the self-healing path, so a rule can't be lost.
     */
    const sheet = styleEl?.sheet;
    if (sheet) {
        try {
            sheet.insertRule(`${selectorFor(key)}{display:none !important}`, sheet.cssRules.length);
        } catch (e) {
            logger.error("Failed to hide a message", e);
            rebuildStyle();
        }
    } else {
        rebuildStyle();
    }

    startObserver();
}

const ROW_PREFIX = "chat-messages-";

/**
 * The element the message rows actually live in.
 *
 * Found through a row rather than by a container selector: the scroller is several
 * wrappers deep and its markup moves between builds, but a row's parent is by definition
 * the level its sibling date separators sit at. Hidden rows still match, so this keeps
 * working when everything on screen is hidden.
 */
function findList() {
    const row = document.querySelector(`[id^="${ROW_PREFIX}"]`);
    if (row?.parentElement) return row.parentElement;

    // Nothing to anchor on: with every row hidden the scroller measures the list as empty
    // and drops the rows from the DOM, leaving only the separators. Those sit at the same
    // level, so one of them finds the container just as well.
    const scroller = document.querySelector(SCROLLER);
    return scroller?.querySelector('[class*="divider"]')?.parentElement ?? null;
}

function isDivider(el: HTMLElement) {
    if (typeof el.className === "string" && el.className.includes("divider")) return true;

    const inner = el.firstElementChild;
    return typeof inner?.className === "string" && inner.className.includes("divider");
}

/** Rebuild the whole sheet from `appliedRules`. Used when rules are dropped in bulk. */
function rebuildStyle() {
    if (!styleEl) return;

    let css = "";
    for (const key of appliedRules) css += `${selectorFor(key)}{display:none !important}`;

    styleEl.textContent = css;
}

/**
 * Date separators are rendered as their own elements, siblings of the message rows rather
 * than part of them, and they carry no message id. So hiding a row can't hide its date,
 * and a fully hidden day leaves a bare divider behind.
 *
 * They can only be judged against what's actually rendered: a divider is dropped when
 * every row between it and the next one is hidden. Runs at most once per frame, only
 * while something is hidden, and touches nothing else in the list.
 */
function sweepDividers() {
    sweepScheduled = false;

    const list = findList();
    if (!list) return;

    let divider: HTMLElement | null = null;
    let sawVisible = false;

    const settle = () => {
        if (divider) divider.style.display = sawVisible ? "" : "none";
    };

    for (const node of list.children) {
        const el = node as HTMLElement;
        const id = el.id || "";

        if (id.startsWith(ROW_PREFIX)) {
            if (!appliedRules.has(id.slice(ROW_PREFIX.length).replace("-", ":"))) sawVisible = true;
            continue;
        }

        if (isDivider(el)) {
            settle();
            divider = el;
            sawVisible = false;
            continue;
        }

        // the channel intro, spacers, anything unrecognised: treat as real content so a
        // divider above it is never wrongly removed
        sawVisible = true;
    }

    settle();
}

let sweepScheduled = false;
function scheduleSweep() {
    if (sweepScheduled) return;

    sweepScheduled = true;
    requestAnimationFrame(sweepDividers);
}

/**
 * Watch the message list so dividers are re-judged as rows scroll in and out.
 *
 * Scoped to the row container and to direct children only. Watching the document would
 * fire on every unrelated bit of Discord's UI; this fires only when rows change, and the
 * callback does nothing but book a sweep for the next frame.
 */
function startObserver() {
    const list = findList();
    if (!list) return;

    // the container is replaced when you change channel, so re-bind when it moves
    if (observed === list) return;

    observer?.disconnect();
    observed = list;
    observer = new MutationObserver(scheduleSweep);
    observer.observe(list, { childList: true });

    scheduleSweep();
}

function stopObserver() {
    observer?.disconnect();
    observer = null;
    observed = null;

    // one last pass with no rules left puts every divider back
    sweepDividers();
}

function dropRulesFor(channelId: string) {
    const prefix = `${channelId}:`;
    let dropped = false;

    for (const key of [...appliedRules]) {
        if (!key.startsWith(prefix)) continue;

        appliedRules.delete(key);
        dropped = true;
    }

    if (!dropped) return;

    rebuildStyle();
    if (appliedRules.size) scheduleSweep();
    else stopObserver();
}

const loadedIn = (channelId: string) =>
    ((MessageStore.getMessages(channelId) as any)?._array as Message[] | undefined) ?? [];

/** Hide whatever of a channel is on screen right now that should be hidden */
function applyToLoaded(channelId: string) {
    for (const message of loadedIn(channelId)) {
        if (isHidden(channelId, message.id)) addRule(channelId, message.id);
    }
}

/**
 * Hide what a wholly hidden channel has already loaded.
 *
 * The fast path for these channels is emptying the payload as it arrives, but that only
 * works if we were listening when it arrived. When the load has already happened the
 * messages are in the store and can't be un-loaded without throwing away the ones that
 * came in after you hid the channel, so they're hidden by rule instead - same result on
 * screen, and unhiding still costs nothing.
 */
function applyToLoadedChannel(channelId: string, allowed: Set<string>) {
    let hid = false;

    for (const message of loadedIn(channelId)) {
        if (allowed.has(message.id)) continue;

        addRule(channelId, message.id);
        hid = true;
    }

    // it already holds history it shouldn't; don't let it pull any more
    if (hid) clampBackfill(channelId);
}

/** Re-apply one channel's hides to whatever is in the store right now */
function catchUpChannel(channelId: string) {
    const allowed = hiddenChannels.get(channelId);

    if (allowed) applyToLoadedChannel(channelId, allowed);
    else applyToLoaded(channelId);
}

/**
 * Re-apply every channel we know about.
 *
 * Plugins don't start until Discord's gateway is up, which is also when Discord loads the
 * channel you had open, so the first load of a session is a race we lose about as often as
 * we win it - and losing it is what left hidden messages showing after a restart. Rather
 * than trying to win the race, this repairs whatever it missed. Channels with nothing
 * loaded cost an empty array each, so it's cheap enough to simply run on every reconnect.
 */
export function catchUpAll() {
    if (!enabled) return;

    const channelIds = new Set([
        ...hiddenChannels.keys(),
        ...hiddenMessages.keys(),
        ...hiddenRanges.keys()
    ]);

    for (const channelId of channelIds) catchUpChannel(channelId);

    // the message list is built after the plugin starts, so look for it on the next frame
    requestAnimationFrame(() => {
        startObserver();
        scheduleSweep();
    });
}

// ---------------------------------------------------------------- persistence

function writeNow() {
    if (!settings.store.persist) return;

    const messages: string[] = [];
    for (const [channelId, ids] of hiddenMessages) {
        for (const id of ids) messages.push(keyFor(channelId, id));
    }

    set(KEY, {
        messages,
        ranges: [...hiddenRanges],
        channels: [...hiddenChannels].map(([id, allowed]) => [id, [...allowed]])
    } satisfies Stored);
}

/**
 * Incoming messages in a hidden channel each touch state, so writes are coalesced instead
 * of hitting IndexedDB once per message.
 */
let saveTimer: ReturnType<typeof setTimeout> | undefined;
function save() {
    if (!settings.store.persist) return;

    clearTimeout(saveTimer);
    saveTimer = setTimeout(writeNow, 300);
}

/**
 * Write immediately, for anything you asked for by hand.
 *
 * The debounce above exists for message traffic, which can touch state many times a
 * second. Letting a hide you just clicked sit in a 300ms window is a different matter:
 * close Discord inside it and the hide is gone when it comes back, which is one of the
 * ways hidden messages used to reappear after a restart.
 */
function saveNow() {
    clearTimeout(saveTimer);
    writeNow();
}

async function load() {
    if (!settings.store.persist) return;

    const stored = await get<Stored>(KEY);
    if (!stored) return;

    hiddenMessages = new Map();
    for (const key of stored.messages ?? []) {
        const at = key.indexOf(":");
        if (at === -1) continue;

        addHidden(key.slice(0, at), key.slice(at + 1));
    }

    hiddenRanges = new Map(stored.ranges ?? []);
    hiddenChannels = new Map((stored.channels ?? []).map(([id, allowed]) => [id, new Set(allowed)]));
}

/** Called when the persist setting is switched off, so nothing is left behind on disk */
export function forgetSaved() {
    del(KEY);
}

// ---------------------------------------------------------------- message loads

/**
 * Watch loads so messages inside a hidden span are hidden as they arrive.
 *
 * Only whole-channel hides touch the payload. Individual hides deliberately leave it
 * alone: the messages have to reach the store for Discord's paging anchor to advance.
 */
export function interceptor(action: any) {
    // runs for every dispatched action, so the common case bails on cheap checks
    if (!enabled) return false;
    if (action?.type !== "LOAD_MESSAGES_SUCCESS") return false;

    try {
        const messages: Message[] = action.messages ?? [];
        if (!messages.length) return false;

        const { channelId } = action;

        const allowed = hiddenChannels.get(channelId);
        if (allowed) {
            // keep only what arrived after you hid it, so you can carry on chatting
            action.messages = messages.filter(m => allowed.has(m.id));
            action.hasMoreBefore = false;
            action.hasMoreAfter = false;
            return false;
        }

        if (!hasHidesIn(channelId)) {
            blankPages.delete(channelId);
            return false;
        }

        let hidden = 0;
        for (const message of messages) {
            if (!isHidden(channelId, message.id)) continue;

            addRule(channelId, message.id);
            hidden++;
        }

        if (hidden < messages.length) {
            // this page has something to show, so history behaves entirely as normal
            blankPages.delete(channelId);
            return false;
        }

        // every message on this page is hidden. Discord pages back to fill the viewport,
        // which is how it gets past the stretch, but not indefinitely in a huge channel
        const blanks = (blankPages.get(channelId) ?? 0) + 1;
        blankPages.set(channelId, blanks);

        if (blanks >= MAX_BLANK_PAGES) clampBackfill(channelId);
    } catch (e) {
        logger.error("Failed to process a message load", e);
    }

    return false;
}

/**
 * Stop a channel pulling any more history.
 *
 * Setting `hasMoreBefore` on the payload does nothing: Discord works it out from how many
 * messages came back, and a page full of hidden ones is still a full page. The flag has to
 * be set on the channel itself, after the load has been applied. Crucially this drops no
 * messages, so unhiding still has everything to put back.
 */
function clampBackfill(channelId: string) {
    if (clamped.has(channelId)) return;
    clamped.add(channelId);

    // the load is still being applied, so flip the flag once it has settled
    setTimeout(() => {
        try {
            const cache: any = MessageCache.getOrCreate(channelId);
            if (!cache || cache.hasMoreBefore === false) return;

            cache.hasMoreBefore = false;
            MessageCache.commit(cache);
            MessageStore.emitChange();
        } catch (e) {
            logger.error("Failed to stop history loading", e);
        }
    }, 0);
}

/**
 * Reload the channel you're looking at, once, after unhiding.
 *
 * Not for the data - nothing was ever removed, so the messages are already in the store.
 * It's for the scroller: it caches row heights, and it measured every hidden row at zero,
 * so dropping the rules leaves it rendering a collapsed list of bare date separators until
 * something resets it. This is the single request either plugin makes.
 */
/**
 * Empty a channel that is already loaded. Local dispatch, no network.
 *
 * `hasMoreBefore` stays off when hiding, so the blank channel doesn't go looking for
 * history to fill itself with, and goes back on when unhiding so it reloads.
 */
function clearLoadedMessages(channelId: string, hasMoreBefore = false) {
    try {
        FluxDispatcher.dispatch({
            type: "LOAD_MESSAGES_SUCCESS",
            channelId,
            messages: [],
            isBefore: false,
            isAfter: false,
            hasMoreBefore,
            hasMoreAfter: false,
            limit: 50
        } as any);
    } catch (e) {
        logger.error("Failed to clear loaded messages", e);
    }
}

function refresh(channelId: string, wasWholeChannel: boolean) {
    /*
     * A wholly hidden channel had its messages dropped before the store saw them, so it
     * holds an empty list that Discord nonetheless considers fully fetched. It will not
     * reload that by itself, not even when you open the channel, so the reload has to be
     * asked for here whether or not the channel is on screen.
     *
     * Both calls are made rather than stopping at the first that exists. A loader can be
     * present and still decline to do anything - a channel that looks loaded and has no
     * more history is exactly the state it skips - and taking "the function was there" as
     * success is what silently swallowed the reload before. Marking it as having more
     * history first is what stops it being skipped.
     */
    if (wasWholeChannel) {
        clearLoadedMessages(channelId, true);

        const jumped = callLoader("jumpToPresent", channelId);
        const fetched = callLoader("fetchMessages", channelId);

        // silent when it works; only speaks up if there's nothing to reload with
        if (!jumped && !fetched) {
            logger.warn("Couldn't find Discord's message loader - reopen the channel to reload it");
        }
    }

    if (SelectedChannelStore.getChannelId() !== channelId) return;

    // Put the view back at the newest messages. This also makes the scroller remeasure,
    // which matters for hidden rows: it cached them at zero height, so the list stays
    // collapsed until something makes it look again.
    requestAnimationFrame(() => {
        const scroller = document.querySelector(SCROLLER) as HTMLElement | null;
        if (scroller) scroller.scrollTop = scroller.scrollHeight;
    });
}

/** Let a channel load history again once nothing in it is hidden */
function releaseBackfill(channelId: string) {
    if (!clamped.delete(channelId)) return;

    try {
        const cache: any = MessageCache.getOrCreate(channelId);
        if (!cache) return;

        cache.hasMoreBefore = true;
        MessageCache.commit(cache);
        MessageStore.emitChange();
    } catch (e) {
        logger.error("Failed to restore history loading", e);
    }
}

/**
 * Hooked to CHANNEL_SELECT. Switching to an already cached channel fires no load, so this
 * is where its rules get applied and the observer follows the new list element.
 */
export function onChannelSelect(channelId: string | null) {
    if (!enabled || !channelId || !hasHidesIn(channelId)) return;

    // the list is built after this dispatch, so look for it on the next frame
    requestAnimationFrame(() => {
        catchUpChannel(channelId);
        startObserver();
        scheduleSweep();
    });
}

// ---------------------------------------------------------------- actions

export function hideMessage(channelId: string, messageId: string) {
    addHidden(channelId, messageId);
    addRule(channelId, messageId);
    saveNow();
}

/**
 * Hide everything between two messages, inclusive.
 *
 * The span is remembered by its endpoints, so it covers messages that aren't loaded yet:
 * scrolling further back, or reopening the channel, keeps hiding them.
 */
export function hideRange(channelId: string, fromId: string, toId: string) {
    addRange(channelId, fromId, toId);
    applyToLoaded(channelId);
    saveNow();
}

export function hideChannel(channelId: string) {
    hiddenChannels.set(channelId, new Set());
    clearLoadedMessages(channelId);
    saveNow();
}

/**
 * Bring back everything hidden in this channel, wholesale or piecemeal.
 *
 * Instant and free: the messages never left the store, so dropping their rules is all it
 * takes. Nothing is refetched, which is also why this can't half-work.
 */
export function showChannel(channelId: string) {
    const wasWholeChannel = hiddenChannels.delete(channelId);

    hiddenMessages.delete(channelId);
    hiddenRanges.delete(channelId);
    blankPages.delete(channelId);
    dropRulesFor(channelId);
    releaseBackfill(channelId);
    refresh(channelId, wasWholeChannel);

    saveNow();
}

function showEverything() {
    for (const channelId of [...clamped]) releaseBackfill(channelId);

    hiddenMessages.clear();
    hiddenRanges.clear();
    hiddenChannels.clear();
    blankPages.clear();

    appliedRules.clear();
    rebuildStyle();
    stopObserver();
}

/** Undo everything and wipe the saved list */
export function clearAll() {
    const open = SelectedChannelStore.getChannelId();
    const openWasHidden = !!open && hiddenChannels.has(open);

    showEverything();
    if (open) refresh(open, openWasHidden);

    if (settings.store.persist) writeNow();
}

// ---------------------------------------------------------------- lifecycle

export async function startStore() {
    styleEl = document.createElement("style");
    styleEl.id = "vc-custom-hide-messages";
    document.head.appendChild(styleEl);

    /*
     * Switched on before the saved list is read, deliberately. Reading it is a trip to IndexedDB,
     * and a channel can finish loading inside that window; the interceptor simply finds
     * nothing hidden and lets it through, which is correct, and `catchUpAll` below then
     * hides it. The alternative - enabling afterwards - also leaves messages showing but
     * with nothing to repair it.
     */
    enabled = true;

    await load();
    catchUpAll();
}

export function stopStore() {
    enabled = false;
    clearTimeout(saveTimer);
    showEverything();
    stopObserver();

    styleEl?.remove();
    styleEl = null;
}

/**
 * Messages that arrive after a channel was hidden stay visible, so the conversation
 * carries on as normal on top of a blank history.
 */
export function trackNewMessage(message: Message) {
    if (!hiddenChannels.size) return;

    const allowed = hiddenChannels.get(message?.channel_id);
    if (!allowed || allowed.has(message.id)) return;

    allowed.add(message.id);
    save();
}
