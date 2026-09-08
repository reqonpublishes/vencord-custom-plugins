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

/** Marks a load we dispatched ourselves, so the interceptor leaves it alone */
const SYNTHETIC = "__vcHideMessages";

const KEY = "HideMessages_Hidden";
const logger = new Logger("CustomPluginHideMessages");

type Range = [from: string, to: string];

interface Stored {
    messages: string[];
    ranges: [string, Range[]][];
    /** channel id -> the cutoff it was hidden at */
    channels: [string, string][];
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
 * Channels hidden wholesale -> the moment they were hidden, as a snowflake.
 *
 * A cutoff rather than a list of messages to spare. Keeping an allowlist of what should
 * stay visible sounds equivalent and isn't: it can only ever record messages this client
 * watched arrive, so everything sent while Discord was closed came back hidden, and the
 * chat you unhid nothing in stayed blank as it filled up. A cutoff needs no bookkeeping
 * and can't miss anything - "sent before I hid this" is a comparison, and it answers the
 * same for a message from a week ago as for one that arrived overnight.
 */
let hiddenChannels = new Map<string, string>();

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

/** Discord's epoch: snowflakes count milliseconds from the start of 2015, shifted up 22 */
const DISCORD_EPOCH = 1420070400000n;

/** The snowflake a message sent right now would have, give or take the counter bits */
const snowflakeNow = () => String((BigInt(Date.now()) - DISCORD_EPOCH) << 22n);

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

    // The container is replaced when you change channel - and again during startup, as
    // Discord swaps the placeholder it draws first for the real list. Re-bind whenever it
    // moves, or the observer sits watching an element that left the page.
    if (observed === list) return;

    observer?.disconnect();
    observed = list;
    observer = new MutationObserver(scheduleSweep);
    // subtree, because a heading can be re-rendered inside a row rather than added
    // alongside one, and that has to book a sweep too
    observer.observe(list, { childList: true, subtree: true });

    scheduleSweep();
}

/** A cold start has a lot to get through before it draws a channel, so look for a while */
const WATCH_MS = 30_000;
const WATCH_EVERY_MS = 500;

let watchdog: ReturnType<typeof setInterval> | undefined;
let watchUntil = 0;

function stopWatchdog() {
    clearInterval(watchdog);
    watchdog = undefined;
}

/**
 * Keep binding the observer until the message list has settled.
 *
 * Looking once isn't enough, and neither is looking only until something is found. Plugins
 * start when the gateway connects, well before Discord has drawn a channel, and the first
 * thing it draws is a placeholder that is replaced moments later. Binding to that and
 * calling it done leaves the observer watching a detached element, so no sweep ever runs
 * again - which is why a hidden channel still came back with its date heading after a
 * restart even though the messages themselves were correctly hidden.
 *
 * Re-checking on a timer covers all of it: the list arriving late, the list being swapped,
 * and the list being rebuilt underneath us. `startObserver` is a comparison and a return
 * when nothing has moved, and sweeps are capped at one a frame, so this costs nothing
 * while it runs and stops on its own afterwards.
 */
function ensureObserver() {
    startObserver();
    scheduleSweep();

    watchUntil = Date.now() + WATCH_MS;
    if (watchdog) return;

    watchdog = setInterval(() => {
        if (!enabled || Date.now() > watchUntil) {
            stopWatchdog();
            return;
        }

        startObserver();
        scheduleSweep();
    }, WATCH_EVERY_MS);
}

function stopObserver() {
    stopWatchdog();
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
 * Re-apply one channel's hides to whatever is in the store right now.
 *
 * A wholly hidden channel is reloaded rather than covered up. Hiding its rows one by one
 * leaves their date headings behind - headings carry no message id, so only a DOM sweep
 * can reach them - whereas pulling the channel back through the interceptor drops
 * everything up to the cutoff and keeps everything after it, which is the same state, by
 * the same path, as hiding it live.
 */
function catchUpChannel(channelId: string) {
    const cutoff = hiddenChannels.get(channelId);

    if (cutoff !== undefined) {
        // only when it's actually holding something it shouldn't be
        if (loadedIn(channelId).some(m => cmpId(m.id, cutoff) <= 0)) refresh(channelId);
        return;
    }

    applyToLoaded(channelId);
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

    // the list is built well after the plugin starts, so keep looking until it appears
    ensureObserver();
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
        channels: [...hiddenChannels]
    } satisfies Stored);
}

/*
 * Writes go straight to disk. There used to be a debounce here for message traffic, back
 * when every incoming message in a hidden channel touched state; a cutoff needs no such
 * bookkeeping, so the only things reaching this are ones you asked for by hand. Letting
 * those sit in a window is how a hide you just clicked went missing when Discord closed.
 */

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

    hiddenChannels = new Map();
    for (const [id, value] of stored.channels ?? []) hiddenChannels.set(id, toCutoff(value));
}

/**
 * Read a channel's cutoff, from either shape it might have been saved in.
 *
 * Earlier versions kept an allowlist of the messages to leave visible. The earliest of
 * those is the closest thing on record to the moment the channel was hidden, so a cutoff
 * just below it keeps exactly what was on screen visible. With an empty list there is
 * nothing to go on, so hide up to now and let the chat carry on from here.
 */
function toCutoff(value: string | string[]): string {
    if (typeof value === "string") return value;
    if (!Array.isArray(value) || !value.length) return snowflakeNow();

    let earliest = value[0];
    for (const id of value) {
        if (cmpId(id, earliest) < 0) earliest = id;
    }

    try {
        return String(BigInt(earliest) - 1n);
    } catch {
        return snowflakeNow();
    }
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
    // one of ours, emptying a channel on purpose - filtering it again achieves nothing
    // and would undo the `hasMoreBefore` it was dispatched with
    if (action[SYNTHETIC]) return false;

    try {
        const messages: Message[] = action.messages ?? [];
        if (!messages.length) return false;

        const { channelId } = action;

        const cutoff = hiddenChannels.get(channelId);
        if (cutoff !== undefined) {
            // keep whatever was sent after you hid it, so the chat carries on as normal
            action.messages = messages.filter(m => cmpId(m.id, cutoff) > 0);
            // there is nothing older worth fetching, but newer is exactly what we keep
            action.hasMoreBefore = false;
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
 * Empty a channel that is already loaded. Local dispatch, no network.
 *
 * `hasMoreBefore` stays off when hiding, so the blank channel doesn't go looking for
 * history to fill itself with, and goes back on when unhiding so it reloads.
 */
function clearLoadedMessages(channelId: string, hasMoreBefore = false) {
    try {
        FluxDispatcher.dispatch({
            [SYNTHETIC]: true,
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

/**
 * Reload a channel after unhiding it.
 *
 * Not for the data - nothing was ever removed from the store - but for the scroller. It
 * caches row heights, it measured every hidden row at zero, and it drops rows it believes
 * are empty. Take the rules away and it is left rendering a collapsed list: a stack of
 * bare date headings with nothing underneath them. Only a real reload makes it measure
 * again, and it is asked for on every unhide rather than only after a whole-channel one,
 * because a long hidden range collapses the list exactly the same way.
 *
 * Both loaders are called rather than stopping at the first that exists. A loader can be
 * present and still decline to do anything - a channel that looks loaded and has no more
 * history is exactly the state it skips - and taking "the function was there" as success
 * is what silently swallowed the reload before. Marking it as having more history first is
 * what stops it being skipped.
 */
function refresh(channelId: string) {
    clearLoadedMessages(channelId, true);

    const jumped = callLoader("jumpToPresent", channelId);
    const fetched = callLoader("fetchMessages", channelId);

    // silent when it works; only speaks up if there's nothing to reload with
    if (!jumped && !fetched) {
        logger.warn("Couldn't find Discord's message loader - reopen the channel to reload it");
    }

    if (SelectedChannelStore.getChannelId() !== channelId) return;

    // put the view back at the newest messages once the reload has landed
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

    // the list is rebuilt after this dispatch, so look for it on the next frame
    requestAnimationFrame(() => {
        catchUpChannel(channelId);
        ensureObserver();
    });
}

// ---------------------------------------------------------------- actions

export function hideMessage(channelId: string, messageId: string) {
    addHidden(channelId, messageId);
    addRule(channelId, messageId);
    writeNow();
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
    writeNow();
}

export function hideChannel(channelId: string) {
    // everything already sent goes; everything after this moment carries on as normal
    hiddenChannels.set(channelId, snowflakeNow());
    clearLoadedMessages(channelId);
    writeNow();
}

/**
 * Bring back everything hidden in this channel, wholesale or piecemeal.
 *
 * Instant and free: the messages never left the store, so dropping their rules is all it
 * takes. Nothing is refetched, which is also why this can't half-work.
 */
export function showChannel(channelId: string) {
    hiddenChannels.delete(channelId);
    hiddenMessages.delete(channelId);
    hiddenRanges.delete(channelId);
    blankPages.delete(channelId);
    dropRulesFor(channelId);
    releaseBackfill(channelId);
    refresh(channelId);

    writeNow();
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

    showEverything();
    if (open) refresh(open);

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
    showEverything();
    stopObserver();

    styleEl?.remove();
    styleEl = null;
}
