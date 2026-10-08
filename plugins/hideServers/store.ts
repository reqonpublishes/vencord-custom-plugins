/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { del, get, set } from "@api/DataStore";
import { GuildStore, IconUtils, SortedGuildStore } from "@webpack/common";

import { settings } from "./settings";

const KEY = "HideServers_Hidden";

/** guildId -> the name it had when hidden, so the list of them reads as names */
let hidden = new Map<string, string>();

let styleEl: HTMLStyleElement | null = null;
let running = false;

export const isHidden = (guildId?: string | null) => !!guildId && hidden.has(guildId);
export const count = () => hidden.size;
export const names = () => [...hidden.entries()];

// ---------------------------------------------------------------- persistence

/** Goes up whenever a list changes, so anything worked out from one knows when it is stale */
let changed = 0;
export const changes = () => changed;

let saveQueued = false;

/**
 * Write the list down, once, after whatever is changing it has finished.
 *
 * Asked for on every change, and a change to fifty things asks fifty times. They are folded
 * into one write of how things ended up.
 */
function save() {
    changed++;

    if (saveQueued || !settings.store.persist) return;

    saveQueued = true;
    queueMicrotask(() => {
        saveQueued = false;
        if (settings.store.persist) set(KEY, [...hidden]);
    });
}

/**
 * Whether what is in memory is what is on disk.
 *
 * Read once, then trusted: switching the plugin off and on again should not go back to disk
 * for a list it is already holding. Only something writing to disk behind its back - a sync
 * from the cloud - makes it worth reading again.
 */
let loaded = false;
export const isLoaded = () => loaded;
export const invalidate = () => void (loaded = false);

export async function load() {
    if (loaded) return;
    loaded = true;

    // Nothing on disk to read, and what is in memory is the only copy there is.
    if (!settings.store.persist) return;

    const stored = await get<[string, string][] | Record<string, string>>(KEY);
    if (!stored) return;

    hidden = Array.isArray(stored) ? new Map(stored) : new Map(Object.entries(stored));
}

/** Called when the persist setting is switched off, so nothing is left behind on disk */
export function forgetSaved() {
    del(KEY);
}

// ---------------------------------------------------------------- the list on screen

/** Put on the row of every hidden server. One plain rule hides whatever carries it */
const GONE = "vc-chs-gone";

let observer: MutationObserver | null = null;
let watched: Element | null = null;
let recheck: ReturnType<typeof setInterval> | null = null;
let queued = false;

/** How many repaints a second is still Discord redrawing its bar rather than a loop */
const MOST_REPAINTS = 40;
let repaints = 0;
let windowBegan = 0;
/** Set once the marking has been given up on for this session */
let tripped = false;

const itemFor = (id: string | number) => document.querySelector(`[data-list-item-id="guildsnav___${id}"]`);

/** The rows that should be off the bar right now */
function wanted(): Set<Element> {
    const rows = new Set<Element>();
    if (!running || !hidden.size) return rows;

    for (const id of hidden.keys()) {
        // A server on the bar, and the same server inside an open folder.
        const row = itemFor(id)?.closest('[class*="listItem"]');
        if (row) rows.add(row);
    }

    // A folder with nothing left showing in it is an empty box on the bar, so it goes too.
    try {
        for (const folder of (SortedGuildStore as any).getGuildFolders?.() ?? []) {
            const ids: string[] = folder?.guildIds ?? [];
            if (folder?.folderId == null || !ids.length || !ids.every(id => hidden.has(id))) continue;

            const group = itemFor(folder.folderId)?.closest('[class*="folderGroup"]');
            if (group) rows.add(group);
        }
    } catch { /* the bar is still right without it, bar an empty folder */ }

    return rows;
}

/**
 * Take the hidden servers off the bar.
 *
 * Drawn out of the list rather than taken out of the client. A conversation can be closed
 * and handed back from what was written down; a server cannot - removing one takes its
 * channels, members and roles with it and leaves nothing to rebuild it from, so a hide would
 * only be undoable by restarting. Hiding the row leaves the server exactly as it is: still
 * joined, still receiving, still there the moment you show it again.
 *
 * The rows are found and marked rather than matched by a rule that reaches up from the
 * server's id. That rule needs :has, which makes the browser reconsider it whenever anything
 * under the bar changes - cheap for one server, and the dearest thing on the page for
 * thirty. A class on the row costs nothing to match and nothing while the bar sits still.
 */
function paint() {
    if (tripped) return paintByRule();

    const rows = wanted();

    for (const row of document.querySelectorAll("." + GONE)) {
        if (!rows.has(row)) row.classList.remove(GONE);
    }
    for (const row of rows) {
        if (!row.classList.contains(GONE)) row.classList.add(GONE);
    }

    watch();
}

/**
 * The slower way of doing the same thing, kept for the day marking the rows goes wrong.
 *
 * One rule that reaches up from each hidden server's id to its row. It needs nothing kept in
 * step with the page, so it cannot get into an argument with whatever else is changing the
 * bar - which is the one way the marking above could.
 */
function paintByRule() {
    if (!styleEl) return;

    const rules = [`.${GONE}`];
    if (running) {
        for (const id of hidden.keys()) rules.push(`[class*="listItem"]:has([data-list-item-id="guildsnav___${id}"])`);

        try {
            for (const folder of (SortedGuildStore as any).getGuildFolders?.() ?? []) {
                const ids: string[] = folder?.guildIds ?? [];
                if (folder?.folderId == null || !ids.length || !ids.every(id => hidden.has(id))) continue;

                rules.push(`[class*="folderGroup"]:has([data-list-item-id="guildsnav___${folder.folderId}"])`);
            }
        } catch { /* the bar is still right without it, bar an empty folder */ }
    }

    styleEl.textContent = rules.join(",\n") + " { display: none !important; }";
}

/** Mark again, once, after whatever is changing the bar has finished changing it */
function repaintSoon() {
    if (queued || tripped) return;

    // Marking a row is itself a change to the bar, so this is told about its own work. It
    // settles at once when nothing else is involved. If something else keeps undoing it, the
    // two would go round for ever and take the window with them - so a run of repaints far
    // past anything a real redraw causes ends the watching, and the rule takes over.
    const now = performance.now();
    if (now - windowBegan > 1000) {
        windowBegan = now;
        repaints = 0;
    }
    if (++repaints > MOST_REPAINTS) {
        tripped = true;
        observer?.disconnect();
        observer = null;
        watched = null;
        paintByRule();
        return;
    }

    queued = true;
    queueMicrotask(() => {
        queued = false;
        if (running) paint();
    });
}

/**
 * Keep the marks on as Discord redraws the bar.
 *
 * A folder opening adds rows that were not there to mark, and React writing a row's classes
 * again takes ours off with them. Both are changes inside the bar, so the bar is the only
 * thing watched, and only while something is hidden.
 */
function watch() {
    const nav = running && hidden.size && !tripped ? document.querySelector('[data-list-id="guildsnav"]') : null;
    if (nav === watched && (!nav || observer)) return;

    observer?.disconnect();
    observer = null;
    watched = nav;
    if (!nav) return;

    observer = new MutationObserver(repaintSoon);
    observer.observe(nav, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
}

export function start() {
    running = true;

    styleEl = document.createElement("style");
    styleEl.id = "vc-chs-hidden";
    styleEl.textContent = `.${GONE} { display: none !important; }`;
    document.head.append(styleEl);

    paint();

    // The bar does not exist yet when Discord is still loading, and is built again if the
    // whole interface is. Looked for now and then, which costs nothing once it is found.
    recheck = setInterval(() => {
        if (hidden.size && !watched?.isConnected) paint();
    }, 2000);
}

export function stop() {
    running = false;

    if (recheck) clearInterval(recheck);
    recheck = null;

    observer?.disconnect();
    observer = null;
    watched = null;

    for (const row of document.querySelectorAll("." + GONE)) row.classList.remove(GONE);
    styleEl?.remove();
    styleEl = null;
}

// ---------------------------------------------------------------- hiding and showing

export function nameOf(guildId: string): string {
    return (GuildStore.getGuild(guildId) as any)?.name ?? hidden.get(guildId) ?? guildId;
}

/** A hidden server as the settings list draws it */
export function infoOf(guildId: string): { name: string; image: string | null; detail: string; } {
    const guild: any = GuildStore.getGuild(guildId);
    if (!guild) return { name: hidden.get(guildId) || guildId, image: null, detail: "Not loaded on this device" };

    let image: string | null = null;
    try {
        image = guild.icon ? IconUtils.getGuildIconURL({ id: guild.id, icon: guild.icon, size: 64 }) ?? null : null;
    } catch { /* no icon is fine: the row falls back to the first letter */ }

    return { name: guild.name, image, detail: "Still joined · hidden from the server list" };
}

export function hideServer(guildId: string): boolean {
    if (hidden.has(guildId)) return false;

    hidden.set(guildId, nameOf(guildId));
    save();
    paint();
    return true;
}

export function showServer(guildId: string): boolean {
    if (!hidden.delete(guildId)) return false;

    save();
    paint();
    return true;
}

/** Every server at once, bar the one you are standing in */
export function hideAll(except?: string | null): number {
    let ids: string[] = [];
    try {
        ids = (SortedGuildStore as any).getFlattenedGuildIds?.() ?? Object.keys(GuildStore.getGuilds());
    } catch {
        ids = Object.keys(GuildStore.getGuilds());
    }

    let n = 0;
    for (const id of ids) {
        if (id === except || hidden.has(id)) continue;
        hidden.set(id, nameOf(id));
        n++;
    }

    if (n) {
        save();
        paint();
    }

    return n;
}

export function showAll(): number {
    const n = hidden.size;
    if (!n) return 0;

    hidden = new Map();
    save();
    paint();
    return n;
}

/** Called after the list changed underneath - a fetch from the shelf, say */
export async function reload() {
    invalidate();
    await load();
    paint();
}
