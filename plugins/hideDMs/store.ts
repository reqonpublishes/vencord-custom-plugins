/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { del, get, set } from "@api/DataStore";
import { Logger } from "@utils/Logger";
import { ChannelStore, Flux, FluxDispatcher, UserStore } from "@webpack/common";

import { settings } from "./settings";

const logger = new Logger("HideDMs");

const KEY = "HideDMs_Hidden";

/** channelId -> who it was with when it was hidden, so the list of them reads as names */
let hidden = new Map<string, string>();

/**
 * What each hidden conversation was, so it can be handed back exactly as it went.
 *
 * Kept for as long as it is hidden rather than looked up again on the way out: a channel
 * Discord has forgotten cannot be fetched back from the store, and the whole point is that
 * showing one again never depends on the server sending anything.
 */
const kept = new Map<string, any>();

/** When the last hide happened, so the moment after one can be told apart from a real open */
let justHid = 0;
export const hidJustNow = () => Date.now() - justHid < 2000;

export const isHidden = (channelId?: string | null) => !!channelId && hidden.has(channelId);
export const count = () => hidden.size;
export const names = () => [...hidden.entries()];

// ---------------------------------------------------------------- persistence

let saveQueued = false;

/**
 * Write the list down, once, after whatever is changing it has finished.
 *
 * Asked for on every change, and a change to fifty things asks fifty times. They are folded
 * into one write of how things ended up.
 */
function save() {
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

/** The shape the phone writes, for the sync plugin */
export const asRecord = (): Record<string, string> => Object.fromEntries(hidden);

export function replaceAll(next: Record<string, string>) {
    // Whatever is on screen now goes back first: the incoming list decides what is hidden,
    // and a conversation it does not mention should be in the list again.
    showAll(false);

    hidden = new Map(Object.entries(next ?? {}));
    save();
    reapply();
}

/**
 * Do several things to the client and let it redraw once at the end.
 *
 * Every dispatch makes Discord's stores tell React to draw again. Hiding fifty of something
 * one at a time is fifty redraws of the same list, which is where switching this on and off
 * used to spend its time. Held back until the last one, it is a single redraw.
 */
function batched(run: () => void) {
    const emitter = (Flux as any)?.Emitter;
    if (typeof emitter?.batched === "function") emitter.batched(run);
    else run();
}

// ---------------------------------------------------------------- hiding and showing

/** Who a conversation is with, for the settings list */
export function nameOf(channelId: string): string {
    const channel: any = ChannelStore.getChannel(channelId) ?? kept.get(channelId);
    if (!channel) return channelId;

    if (channel.name) return channel.name;

    const ids: string[] = channel.recipients ?? [];
    const people = ids
        .map(id => {
            const user: any = UserStore.getUser(id);
            return user?.globalName ?? user?.username;
        })
        .filter(Boolean);

    return people.length ? people.join(", ") : channelId;
}

/** A hidden conversation as the settings list draws it: a face, a name and a quieter line */
export function infoOf(channelId: string): { name: string; image: string | null; detail: string; group: boolean; } {
    const channel: any = ChannelStore.getChannel(channelId) ?? kept.get(channelId);
    const name = hidden.get(channelId) || nameOf(channelId);
    const ids: string[] = channel?.recipients ?? [];

    if (channel?.type === 3) {
        const people = ids.length + 1;
        return { name: nameOf(channelId), image: null, detail: `Group · ${people} ${people === 1 ? "member" : "members"}`, group: true };
    }

    const user: any = ids[0] ? UserStore.getUser(ids[0]) : null;
    if (!user) return { name, image: null, detail: "Direct message", group: false };

    return {
        name: user.globalName ?? user.username ?? name,
        image: user.getAvatarURL?.(undefined, 64) ?? null,
        detail: "@" + user.username,
        group: false
    };
}

/**
 * Take the conversation out of the client, exactly as closing it does.
 *
 * This is the same thing Discord does when you close a DM somewhere else: one CHANNEL_DELETE
 * carrying the whole record. Nothing else is touched, including when the conversation being
 * hidden is the one on screen - a close arriving from another device leaves that screen in a
 * state the client already knows how to be in, and anything more inventive is a state it
 * never reaches on its own.
 */
export function hideChat(channelId: string): boolean {
    const record = ChannelStore.getChannel(channelId) ?? kept.get(channelId);
    if (!record) return false;

    kept.set(channelId, record);
    hidden.set(channelId, nameOf(channelId));
    save();

    justHid = Date.now();

    try {
        FluxDispatcher.dispatch({ type: "CHANNEL_DELETE", channel: record } as any);
    } catch (e) {
        logger.error("Could not hide the conversation", e);
        return false;
    }

    return true;
}

/** Hand the conversation back, as it was. */
export function showChat(channelId: string, forget = true): boolean {
    const record = kept.get(channelId);

    if (forget) {
        if (!hidden.delete(channelId)) return false;
        kept.delete(channelId);
        save();
    }

    if (!record || ChannelStore.getChannel(channelId)) return true;

    try {
        FluxDispatcher.dispatch({ type: "CHANNEL_CREATE", channel: record } as any);
    } catch (e) {
        logger.error("Could not bring the conversation back", e);
        return false;
    }

    return true;
}

/** Every conversation in the list at once, bar the one on screen */
export function hideAll(except?: string | null): number {
    let ids: string[] = [];
    try {
        ids = (ChannelStore as any).getSortedPrivateChannels?.().map((channel: any) => channel.id) ?? [];
    } catch (e) {
        logger.error("Could not read the DM list", e);
    }

    let n = 0;
    batched(() => {
        for (const id of ids) {
            // Not the one you are in: hiding the conversation on screen is a thing to do on
            // purpose, one at a time, rather than as a side effect of clearing the list.
            if (id === except || hidden.has(id)) continue;
            if (hideChat(id)) n++;
        }
    });

    return n;
}

/**
 * Put every hidden conversation back in the list.
 *
 * `forget` is what tells a reset from a pause: switching the plugin off should put them back
 * on screen and remember them for next time, while clearing the list should not.
 */
export function showAll(forget = true) {
    batched(() => {
        for (const channelId of [...hidden.keys()]) showChat(channelId, forget);
    });

    if (forget) save();
}

/**
 * Hide everything on the list again.
 *
 * Discord rebuilds its conversations from the server on every launch and every reconnect, and
 * the server has never heard of any of this - so what was hidden has to be said again once
 * they land, or they quietly come back.
 */
export function reapply() {
    batched(() => {
        for (const channelId of hidden.keys()) {
            if (ChannelStore.getChannel(channelId)) hideChat(channelId);
        }
    });
}
