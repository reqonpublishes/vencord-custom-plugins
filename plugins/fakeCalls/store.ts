/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { del, get, set } from "@api/DataStore";
import { Logger } from "@utils/Logger";
import { Flux, FluxDispatcher, MessageCache, MessageStore, UserStore } from "@webpack/common";

import { settings } from "./settings";

const logger = new Logger("FakeCalls");

const KEY = "FakeCalls_Added";

/** Marks a dispatch as ours, so the interceptor leaves it alone */
const SYNTHETIC = "__vcFakeCalls";

export interface FakeCall {
    /** built from startedAt, which is what puts the call in the right place */
    id: string;
    channelId: string;
    /** who started it - the author of the call, as far as Discord is concerned */
    authorId: string;
    /** epoch ms, so it survives a trip through storage */
    startedAt: number;
    /** null means it is still going, which is what makes the timer count up */
    endedAt: number | null;
    /** everybody who was on it; you being absent is what makes it a missed call */
    participants: string[];
}

/** channelId -> the calls invented in it, oldest first */
let added = new Map<string, FakeCall[]>();

const DISCORD_EPOCH = 1420070400000n;

/** The id a call started at that moment would have had - see the same note in Fake Messages */
function idAt(at: number): string {
    try {
        return String((BigInt(Math.floor(at)) - DISCORD_EPOCH) << 22n);
    } catch {
        return String((BigInt(Date.now()) - DISCORD_EPOCH) << 22n);
    }
}

export const isFake = (channelId: string, messageId: string) =>
    !!added.get(channelId)?.some(one => one.id === messageId);

export const countIn = (channelId: string) => added.get(channelId)?.length ?? 0;

export const total = () => {
    let n = 0;
    for (const list of added.values()) n += list.length;
    return n;
};

/** How many conversations have at least one */
export const chats = () => added.size;

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
        if (settings.store.persist) set(KEY, [...added]);
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

    const stored = await get<[string, FakeCall[]][] | Record<string, FakeCall[]>>(KEY);
    if (!stored) return;

    added = Array.isArray(stored) ? new Map(stored) : new Map(Object.entries(stored));
}

/** Called when the persist setting is switched off, so nothing is left behind on disk */
export function forgetSaved() {
    del(KEY);
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

// ---------------------------------------------------------------- adding and removing

export function addCall(call: Omit<FakeCall, "id">): FakeCall {
    const one: FakeCall = { ...call, id: idAt(call.startedAt) };
    const list = added.get(one.channelId) ?? [];

    // Two started in the same second would share an id, and a channel cannot hold one twice.
    while (list.some(held => held.id === one.id)) {
        one.id = String(BigInt(one.id) + 1n);
    }

    list.push(one);
    list.sort((a, b) => (BigInt(a.id) < BigInt(b.id) ? -1 : 1));
    added.set(one.channelId, list);

    save();
    showNow(one);
    settle(one.channelId);

    return one;
}

export function removeCall(channelId: string, messageId: string): boolean {
    const list = added.get(channelId);
    if (!list) return false;

    const kept = list.filter(one => one.id !== messageId);
    if (kept.length === list.length) return false;

    if (kept.length) added.set(channelId, kept);
    else added.delete(channelId);

    save();
    hideNow(channelId, messageId);

    return true;
}

export function clearChannel(channelId: string): number {
    const list = added.get(channelId);
    if (!list) return 0;

    added.delete(channelId);
    save();

    batched(() => {
        for (const one of list) hideNow(channelId, one.id);
    });

    return list.length;
}

export function clearAll() {
    const held = [...added];
    added = new Map();
    save();

    batched(() => {
        for (const [channelId, list] of held) {
            for (const one of list) hideNow(channelId, one.id);
        }
    });
}

// ---------------------------------------------------------------- putting one on screen

/**
 * A call as it would have arrived from the API.
 *
 * There is no duration in it. The client works that out from the two timestamps, which is
 * why a call only needs a beginning and an end to say how long it lasted - and why an end of
 * null reads as still going, with the timer counting up by itself.
 */
function rawCall(one: FakeCall) {
    const author: any = UserStore.getUser(one.authorId);

    return {
        id: one.id,
        type: 3,
        channel_id: one.channelId,
        content: "",
        timestamp: new Date(one.startedAt).toISOString(),
        edited_timestamp: null,
        author: author
            ? {
                id: author.id,
                username: author.username,
                global_name: author.globalName ?? null,
                discriminator: author.discriminator ?? "0",
                avatar: author.avatar ?? null,
                bot: !!author.bot,
                public_flags: author.publicFlags ?? 0
            }
            : { id: one.authorId, username: "unknown", global_name: null, discriminator: "0", avatar: null, bot: false },
        call: {
            ended_timestamp: one.endedAt === null ? null : new Date(one.endedAt).toISOString(),
            participants: one.participants
        },
        mentions: [],
        mention_roles: [],
        mention_everyone: false,
        attachments: [],
        embeds: [],
        components: [],
        pinned: false,
        tts: false,
        flags: 0
    };
}

/** Whether two ids are in the order the conversation is, oldest first */
function inOrder(a: string, b: string) {
    try {
        return BigInt(a) <= BigInt(b);
    } catch {
        // not a number, so not something that can be placed: leave it where it is
        return true;
    }
}

/**
 * Put a conversation back in date order after something was added to it.
 *
 * Discord takes a message that has just arrived to be the newest and puts it at the bottom,
 * whatever its date. That is right for a real one. One made to look a week old belongs a
 * week up - and left at the bottom it reads as sent today, under a date that says otherwise.
 * So once it is in, the loaded messages are put back in the order their ids give, which is
 * the order of their dates.
 *
 * Nothing is fetched, and nothing moves at all when it was already the newest.
 */
function settle(channelId: string) {
    try {
        const cache: any = MessageCache.getOrCreate(channelId);
        const list: any[] = cache?._array;
        if (!Array.isArray(list) || list.length < 2) return;

        let ordered = true;
        for (let i = 1; i < list.length; i++) {
            if (!inOrder(list[i - 1].id, list[i].id)) {
                ordered = false;
                break;
            }
        }
        if (ordered) return;

        const next = cache.mutate((copy: any) => {
            copy._array = [...copy._array].sort((a: any, b: any) => (a.id === b.id ? 0 : inOrder(a.id, b.id) ? -1 : 1));
        }, true);

        MessageCache.commit(next);
        MessageStore.emitChange();
    } catch (e) {
        logger.error("Could not put the conversation back in order", e);
    }
}

function showNow(one: FakeCall) {
    try {
        FluxDispatcher.dispatch({
            type: "MESSAGE_CREATE",
            channelId: one.channelId,
            message: rawCall(one),
            optimistic: false,
            isPushNotification: false,
            [SYNTHETIC]: true
        } as any);
    } catch (e) {
        logger.error("Could not show the call straight away", e);
    }
}

function hideNow(channelId: string, messageId: string) {
    try {
        FluxDispatcher.dispatch({
            type: "MESSAGE_DELETE",
            channelId,
            id: messageId,
            otherPluginBypass: true,
            mlDeleted: true,
            [SYNTHETIC]: true
        } as any);
    } catch (e) {
        logger.error("Could not take the call off the screen", e);
    }
}

/**
 * Take every invented one off the screen, without forgetting any of them.
 *
 * For stopping, and for the moment before a different list arrives from the shelf. What is on
 * screen came from the list as it was; if the list is about to change, the screen has to stop
 * showing the old one first or the two disagree until the channel is opened again.
 */
export function takeAllOffScreen() {
    batched(() => {
        for (const [channelId, list] of added) {
            for (const one of list) hideNow(channelId, one.id);
        }
    });
}

/** Put the ones belonging to a channel on screen now, for a channel that is already open */
export function showIn(channelId: string) {
    batched(() => {
        for (const one of added.get(channelId) ?? []) showNow(one);
    });

    settle(channelId);
}

// ---------------------------------------------------------------- message loads

/** Put the invented calls back into every page that is loaded - see Fake Messages */
export function interceptor(action: any) {
    if (action?.type !== "LOAD_MESSAGES_SUCCESS") return false;
    if (action[SYNTHETIC]) return false;

    try {
        const { channelId } = action;
        const list = added.get(channelId);
        if (!list?.length || !Array.isArray(action.messages)) return false;

        const ids = new Set(action.messages.map((m: any) => String(m?.id)));

        let oldest: string | null = null;
        for (const m of action.messages) {
            if (!m?.id) continue;
            if (oldest === null || BigInt(m.id) < BigInt(oldest)) oldest = String(m.id);
        }

        const mine = list.filter(one => {
            if (ids.has(one.id)) return false;
            if (action.hasMoreBefore && oldest !== null && BigInt(one.id) < BigInt(oldest)) return false;
            return true;
        });
        if (!mine.length) return false;

        action.messages = [...action.messages, ...mine.map(rawCall)]
            .sort((a: any, b: any) => (BigInt(a.id) < BigInt(b.id) ? 1 : -1));
    } catch (e) {
        logger.error("Could not add the invented calls to this page", e);
    }

    return false;
}
