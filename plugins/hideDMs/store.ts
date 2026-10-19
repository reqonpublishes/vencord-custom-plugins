/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { del, get, set } from "@api/DataStore";
import { Logger } from "@utils/Logger";
import { findStore } from "@webpack";
import { ChannelStore, Flux, FluxDispatcher, SelectedChannelStore, UserStore } from "@webpack/common";

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

/** Marks the opens and closes this plugin says, so they can be told from Discord's own */
const OURS = "__vcHideDMs";

/** When the last hide happened, so the moment after one can be told apart from a real open */
let justHid = 0;
export const hidJustNow = () => Date.now() - justHid < 2000;

export const isHidden = (channelId?: string | null) => !!channelId && hidden.has(channelId);
export const count = () => hidden.size;
export const names = () => [...hidden.entries()];

/**
 * Whether the plugin is on, and so whether a hide should close anything.
 *
 * While it is off every conversation is in Discord's list, and nothing is running to bring
 * back one closed from the settings page. So a hide then only goes on the list, and the next
 * start hides it with the rest.
 */
let on = false;
export const setOn = (value: boolean) => void (on = value);

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

/**
 * The read in progress, so a second start while the first is still waiting on the disk waits
 * for the same read instead of taking the list as loaded before it is. `loadRound` tells a read
 * that was overtaken - a sync landing meanwhile - so it does not write over the newer one.
 */
let loading: Promise<void> | null = null;
let loadRound = 0;

export function invalidate() {
    loaded = false;
    loading = null;
    loadRound++;
}

export function load(): Promise<void> {
    if (loaded) return Promise.resolve();
    if (loading) return loading;

    const mine = ++loadRound;
    loading = (async () => {
        try {
            // Nothing on disk to read when it is not being kept, and what is in memory is
            // the only copy there is.
            const stored = settings.store.persist ? await get<[string, string][] | Record<string, string>>(KEY) : null;
            if (mine !== loadRound) return;

            if (stored) hidden = Array.isArray(stored) ? new Map(stored) : new Map(Object.entries(stored));
            loaded = true;
        } finally {
            if (mine === loadRound) loading = null;
        }
    })();

    return loading;
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

/** Which run of spread-out work is the current one, and whether one is holding the screen */
let slice = 0;
let holding = false;

/** How long one burst of work may run before the window is given a turn */
const BURST_MS = 8;

/** Up to this many are done in one go: too few to be felt, and not worth the ceremony */
const FEW = 24;

/** Stop whatever is being done in bursts, and let the screen draw again */
function endSlices() {
    slice++;

    if (holding) {
        holding = false;
        (Flux as any)?.Emitter?.resume?.();
    }
}

/**
 * Do a long list of things without the window freezing while it happens.
 *
 * Each one is a dispatch that Discord spends a couple of milliseconds on, and nothing here
 * can make that cheaper - so a few hundred of them, done in one go, is a second or more with
 * the window not answering. That is the freeze when everything is switched on at once, and
 * it lands at the worst moment: as a call or a screen share is starting.
 *
 * So they are done in short bursts with the window given a turn between each. Discord is
 * asked to hold its redrawing until the last one, because redrawing the list after every
 * burst costs more than the work itself. The hold is given a time limit, so that if anything
 * here stopped half way the screen would still come back by itself.
 *
 * Only for switching on and off, where being interrupted is harmless: every step checks what
 * is true before acting, so a run cut short leaves nothing the next one does not put right.
 */
function sliced(steps: (() => void)[]) {
    endSlices();

    if (steps.length <= FEW) {
        batched(() => {
            for (const step of steps) step();
        });
        return;
    }

    const mine = slice;
    const emitter = (Flux as any)?.Emitter;
    let at = 0;

    const burst = () => {
        if (mine !== slice) return;

        holding = true;
        emitter?.pause?.(3000);

        const began = performance.now();
        while (at < steps.length && performance.now() - began < BURST_MS) {
            try {
                steps[at++]();
            } catch (e) {
                logger.error("A step failed while switching", e);
            }
        }

        if (at < steps.length) {
            setTimeout(burst, 0);
            return;
        }

        holding = false;
        emitter?.resume?.();
    };

    burst();
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
/** The newest message to arrive in each hidden conversation while it was away */
const latest = new Map<string, string>();

/** How many messages from somebody else arrived in each hidden conversation while it was away */
const arrivals = new Map<string, number>();

/** What Discord knew about how far each hidden conversation had been read, as it was hidden */
const reads = new Map<string, Record<string, any>>();

/** The parts of a conversation's read state that say how far it has been read and what is waiting */
const READ_FIELDS = [
    "_ackMessageId", "_ackMessageTimestamp", "_mentionCount", "_unreadCount", "_oldestUnreadMessageId",
    "oldestUnreadMessageIdStale", "estimated", "ackPinTimestamp"
];

const isNewer = (a: string, b?: string | null) => {
    try {
        return !b || BigInt(a) > BigInt(b);
    } catch {
        return false;
    }
};

/**
 * Note a message that arrived in a hidden conversation.
 *
 * Where a conversation sits in the list is decided by its newest message, and a hidden one
 * is handed back from a record taken when it was hidden. Without this it comes back sorted
 * by how things stood then, far down the list from where a chat you were just in belongs.
 */
export function noteMessage(channelId?: string, messageId?: string, authorId?: string) {
    if (!channelId || !messageId || !hidden.has(channelId)) return;
    if (!isNewer(messageId, latest.get(channelId))) return;

    latest.set(channelId, messageId);

    // One of yours, sent from another device, is not something waiting to be read.
    if (authorId && authorId !== UserStore.getCurrentUser()?.id) {
        arrivals.set(channelId, (arrivals.get(channelId) ?? 0) + 1);
    }
}

function readState(): any {
    try {
        return findStore("ReadStateStore");
    } catch {
        return null;
    }
}

/**
 * Write down how far a conversation has been read, before it is hidden.
 *
 * Discord throws this away when a conversation closes. One handed back afterwards starts
 * from nothing: no badge on it however many messages were waiting, and unread from the top.
 * Neither is how you left it - so how you left it is kept, and put back with it.
 */
function rememberRead(channelId: string) {
    try {
        const state = readState()?.getForDebugging?.(channelId);
        if (!state) return;

        const snapshot: Record<string, any> = {};
        for (const field of READ_FIELDS) snapshot[field] = state[field];
        reads.set(channelId, snapshot);
    } catch { /* it comes back as Discord makes it, which is only untidy */ }
}

/**
 * Put back how far a conversation had been read, now that it is on screen again.
 *
 * Exactly as it was, plus whatever arrived while it was hidden: those are new messages
 * waiting like any others, so they are added to the badge and it reads as unread from them.
 */
function restoreRead(channelId: string, arrived: number) {
    try {
        const store = readState();
        const state = store?.getForDebugging?.(channelId);
        const snapshot = reads.get(channelId);
        if (!state || !snapshot) return;

        for (const field of READ_FIELDS) state[field] = snapshot[field];

        if (arrived > 0) {
            state._mentionCount = (Number(snapshot._mentionCount) || 0) + arrived;
            state._unreadCount = (Number(snapshot._unreadCount) || 0) + arrived;
        }

        store.emitChange?.();
    } catch (e) {
        logger.error("Could not put back what had been read", e);
    }
}

export function hideChat(channelId: string, quiet = false): boolean {
    const record = ChannelStore.getChannel(channelId) ?? kept.get(channelId);
    if (!record) return false;

    // Off: on the list and nothing more. Switching on hides everything on it, from the copy
    // in Discord's list at that moment.
    if (!on) {
        hidden.set(channelId, nameOf(channelId));
        save();
        return true;
    }

    // Only when it is really on screen: one being hidden again from its kept record has
    // nothing new to say about whether it was read.
    if (ChannelStore.getChannel(channelId)) {
        rememberRead(channelId);
        latest.delete(channelId);
        arrivals.delete(channelId);
    }

    kept.set(channelId, record);
    hidden.set(channelId, nameOf(channelId));
    save();

    // Not for one put back out of sight by itself: selecting it straight after is you opening
    // it on purpose, and has to be let through.
    if (!quiet) justHid = Date.now();

    try {
        FluxDispatcher.dispatch({ type: "CHANNEL_DELETE", channel: record, [OURS]: true } as any);
    } catch (e) {
        logger.error("Could not hide the conversation", e);
        return false;
    }

    return true;
}

/** Hand the conversation back, as it was. */
export function showChat(channelId: string, forget = true): boolean {
    waiting.delete(channelId);

    let record = kept.get(channelId);
    const newer = latest.get(channelId);
    const arrived = arrivals.get(channelId) ?? 0;

    if (forget) {
        if (!hidden.delete(channelId)) return false;
        kept.delete(channelId);
        latest.delete(channelId);
        arrivals.delete(channelId);
        save();
    }

    if (!record || ChannelStore.getChannel(channelId)) return true;

    // Handed back as it is now, not as it was: with the newest message that arrived while
    // it was away, so it takes its place in the list by that.
    if (newer && isNewer(newer, record.lastMessageId)) {
        try {
            record = typeof record.set === "function" ? record.set("lastMessageId", newer) : record;
            kept.set(channelId, record);
        } catch { /* it keeps its old place, which is only untidy */ }
    }

    try {
        FluxDispatcher.dispatch({ type: "CHANNEL_CREATE", channel: record, [OURS]: true } as any);

        // Read as far as it was, with the same badge - not marked read, and not unread from
        // the top, which are the two things Discord would otherwise make of it.
        restoreRead(channelId, arrived);
        if (forget) reads.delete(channelId);
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
    // all of it, now - so anything still being done in bursts is finished here instead
    endSlices();

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
    endSlices();

    batched(() => {
        for (const channelId of hidden.keys()) {
            if (!ChannelStore.getChannel(channelId)) continue;

            if (inUse(channelId)) {
                waiting.add(channelId);
                continue;
            }

            hideChat(channelId);
        }
    });
}

/** Every conversation in the list, shown or hidden. Null until Discord has loaded the list */
export function listNow(): string[] | null {
    if (!UserStore.getCurrentUser()) return null;

    try {
        const shown: string[] = (ChannelStore as any).getSortedPrivateChannels?.().map((channel: any) => channel.id) ?? [];
        return [...new Set([...shown, ...hidden.keys()])];
    } catch (e) {
        logger.error("Could not read the DM list", e);
        return null;
    }
}

/** Put away conversations that turned up while the plugin was off */
export function hideFresh(ids: string[]): string[] {
    const done: string[] = [];

    batched(() => {
        for (const channelId of ids) {
            if (hidden.has(channelId) || !ChannelStore.getChannel(channelId)) continue;

            // The one you are in is put on the list now and hidden once you have left it,
            // the same as when everything is hidden again on switching on.
            if (inUse(channelId)) {
                hidden.set(channelId, nameOf(channelId));
                waiting.add(channelId);
                save();
                done.push(channelId);
                continue;
            }

            if (hideChat(channelId)) done.push(channelId);
        }
    });

    return done;
}

/** Take conversations off the list again without saying anything. Only once they are back on screen */
export function forgetFresh(ids: string[]) {
    for (const channelId of ids) {
        hidden.delete(channelId);
        waiting.delete(channelId);
    }

    save();
}

/**
 * Discord opening or closing a conversation by itself - not this plugin.
 *
 * Closed somewhere else while hidden - on the phone, say - it is closed: the copy kept to
 * hand it back is dropped, so it is not brought back when the plugin goes off. It stays on
 * the hidden list, so if it opens again it goes straight back out of sight.
 *
 * Opened while hidden - somebody messaging in a DM that was closed - it is hidden again
 * as soon as Discord has finished putting it in, with the message still unread for later.
 */
export function noteReal(action: any) {
    if (action?.[OURS]) return;

    const channelId = action?.channel?.id;
    if (!channelId || !hidden.has(channelId)) return;

    if (action.type === "CHANNEL_DELETE") {
        kept.delete(channelId);
        waiting.delete(channelId);
        return;
    }

    if (action.type === "CHANNEL_CREATE") {
        setTimeout(() => {
            if (!hidden.has(channelId) || !ChannelStore.getChannel(channelId)) return;

            if (inUse(channelId)) waiting.add(channelId);
            else hideChat(channelId, true);
        }, 0);
    }
}

/** Hidden conversations left on screen for now because you are in them */
const waiting = new Set<string>();

export const isWaiting = (channelId?: string | null) => !!channelId && waiting.has(channelId);

/**
 * Whether you are in a conversation right now - looking at it, or on a call in it.
 *
 * Hiding a conversation closes it, and closing the one you are standing in pulls the screen
 * out from under you; closing the one a call is running in does the same to the call. When
 * hides are being put back all at once - the plugin switching on, Discord reconnecting,
 * Screen Share Protection starting as you begin a call - that is not what was asked for. So
 * that one is left until you have moved on.
 */
function inUse(channelId: string) {
    try {
        return channelId === SelectedChannelStore.getChannelId()
            || channelId === (SelectedChannelStore as any).getVoiceChannelId?.();
    } catch {
        return false;
    }
}

/** Hide the ones that were left, now that you may have left them */
export function hideWaiting() {
    if (!waiting.size) return;

    batched(() => {
        for (const channelId of [...waiting]) {
            if (!hidden.has(channelId)) {
                waiting.delete(channelId);
                continue;
            }
            if (inUse(channelId)) continue;

            waiting.delete(channelId);
            if (ChannelStore.getChannel(channelId)) hideChat(channelId);
        }
    });
}

/** Switched off: every hidden conversation back in the list, kept on the list, without a freeze */
export function pause() {
    sliced([...hidden.keys()].map(channelId => () => {
        showChat(channelId, false);

        // Back in Discord's list, it is Discord's again: closed while the plugin is off, it
        // has to stay closed. A copy held on to here would open it again the next time the
        // plugin went off. Switching on takes a fresh copy from the list.
        if (ChannelStore.getChannel(channelId)) kept.delete(channelId);
    }));
}

/** Switched back on: every one of them hidden again, without a freeze */
export function resume() {
    sliced([...hidden.keys()].map(channelId => () => {
        if (!hidden.has(channelId) || !ChannelStore.getChannel(channelId)) return;

        if (inUse(channelId)) {
            waiting.add(channelId);
            return;
        }

        hideChat(channelId);
    }));
}
