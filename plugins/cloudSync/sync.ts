/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Logger } from "@utils/Logger";

import { Adapter, ADAPTERS, overlay } from "./adapters";
import { settings } from "./settings";
import { fetchShelf, looksLikeLink, sendShelf, Shelf } from "./shelf";

const logger = new Logger("CustomPluginSync");

/** Only the plugins you asked to share, and only the ones actually installed. */
function chosen(): Adapter[] {
    const PM: any = (window as any).Vencord?.Plugins;

    return ADAPTERS.filter(adapter => {
        if (settings.store[adapter.shelfKey] === false) return false;
        return !PM?.plugins || adapter.plugin in PM.plugins;
    });
}

function link(): string {
    const held = String(settings.store.link ?? "").trim();
    if (!held) throw new Error("No link yet - make one first");
    if (!looksLikeLink(held)) throw new Error("That does not look like a sync link");

    return held;
}

/**
 * Put what this client has onto the shelf.
 *
 * What is already there is read first. Everything this client owns is replaced outright, so
 * something unhidden here does not come back on the next fetch - and everything it does not
 * own is left exactly as the phone wrote it.
 */
export async function sendUp(): Promise<{ at: string | null; sent: string[]; }> {
    const where = link();
    const { shelf } = await fetchShelf(where);

    const next: Shelf = { version: 1, from: "desktop", plugins: { ...shelf.plugins } };
    const sent: string[] = [];

    for (const adapter of chosen()) {
        const ours = await adapter.read();
        if (!ours) continue;

        next.plugins[adapter.shelfKey] = overlay(shelf.plugins?.[adapter.shelfKey] ?? {}, ours);
        sent.push(adapter.label);
    }

    const at = await sendShelf(where, next);
    return { at, sent };
}

/**
 * Take what is on the shelf and make this client match it.
 *
 * Each plugin is restarted afterwards rather than asked to reload: stopping and starting is
 * the lifecycle Vencord itself uses when you toggle one, so it reads its storage again on
 * the way up and everything it registered on the way down is rebuilt. Without it the new
 * data sits on disk while the old data is still on screen.
 */
export async function bringDown(): Promise<{ at: string | null; applied: string[]; }> {
    const where = link();
    const { at, shelf } = await fetchShelf(where);

    const applied: string[] = [];
    const touched: string[] = [];

    for (const adapter of chosen()) {
        const held = shelf.plugins?.[adapter.shelfKey];
        if (!held || typeof held !== "object") continue;

        await adapter.write(held);
        applied.push(adapter.label);
        touched.push(adapter.plugin);
    }

    restart(touched);
    return { at, applied };
}

function restart(names: string[]) {
    // Through the global rather than imported - importing the plugin manager from a plugin
    // is a circular dependency, and Vencord's own commons dodge it the same way.
    const PM: any = (window as any).Vencord?.Plugins;
    if (!PM?.plugins) return;

    for (const name of names) {
        const plugin = PM.plugins[name];
        if (!plugin?.started) continue;

        try {
            PM.stopPlugin(plugin);
            PM.startPlugin(plugin);
        } catch (e) {
            logger.error("Could not restart " + name + " after a fetch", e);
        }
    }
}
