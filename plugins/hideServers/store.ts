/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { del, get, set } from "@api/DataStore";
import { GuildStore, SortedGuildStore } from "@webpack/common";

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

const save = () => void (settings.store.persist && set(KEY, [...hidden]));

export async function load() {
    if (!settings.store.persist) {
        hidden = new Map();
        return;
    }

    const stored = await get<[string, string][] | Record<string, string>>(KEY);
    if (!stored) return;

    hidden = Array.isArray(stored) ? new Map(stored) : new Map(Object.entries(stored));
}

/** Called when the persist setting is switched off, so nothing is left behind on disk */
export function forgetSaved() {
    del(KEY);
}

// ---------------------------------------------------------------- the list on screen

/**
 * Take the hidden servers off the bar.
 *
 * Drawn out of the list rather than taken out of the client. A conversation can be closed
 * and handed back from what was written down; a server cannot - removing one takes its
 * channels, members and roles with it and leaves nothing to rebuild it from, so a hide would
 * only be undoable by restarting. Hiding the row leaves the server exactly as it is: still
 * joined, still receiving, still there the moment you show it again.
 *
 * One rule per server, matched on the id Discord puts on the row itself, so it holds through
 * the list being redrawn, reordered or scrolled without anything having to watch for that.
 */
function paint() {
    if (!styleEl) return;

    if (!running || !hidden.size) {
        styleEl.textContent = "";
        return;
    }

    const rows: string[] = [];
    for (const id of hidden.keys()) {
        // A server on the bar, and the same server inside an open folder.
        rows.push(`[class*="listItem"]:has(> [class*="pill"] ~ div [data-list-item-id="guildsnav___${id}"])`);
        rows.push(`[class*="listItem"]:has([data-list-item-id="guildsnav___${id}"])`);
    }

    styleEl.textContent = rows.join(",\n") + " { display: none !important; }";
}

export function start() {
    running = true;

    styleEl = document.createElement("style");
    styleEl.id = "vc-chs-hidden";
    document.head.append(styleEl);

    paint();
}

export function stop() {
    running = false;
    styleEl?.remove();
    styleEl = null;
}

// ---------------------------------------------------------------- hiding and showing

export function nameOf(guildId: string): string {
    return (GuildStore.getGuild(guildId) as any)?.name ?? hidden.get(guildId) ?? guildId;
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
    await load();
    paint();
}
