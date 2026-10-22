/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

/**
 * Conversations moved to another time.
 *
 * Each is a shift: every message in the chat reads that much earlier or later, so the gaps
 * between them, the order and the day breaks all stay true to each other. Nothing is changed
 * where it is kept - the shift is laid on each message as Discord loads it, which is also what
 * makes it cover the messages Fake Messages and Fake Calls put there, and a chat opened for
 * the first time tomorrow.
 */

import { del, get, set } from "@api/DataStore";
import { Logger } from "@utils/Logger";
import { FluxDispatcher, MessageStore } from "@webpack/common";

import { reloadChat } from "./chat";
import { settings } from "./settings";

const logger = new Logger("FakeTime");

const KEY = "FakeTime_Shifts";

/** channelId -> how far its messages are moved, in milliseconds (negative is earlier) */
let shifts = new Map<string, number>();
let running = false;

const listeners = new Set<() => void>();
export const onChange = (listener: () => void) => (listeners.add(listener), () => void listeners.delete(listener));

export const shiftOf = (channelId?: string | null) => (channelId && shifts.get(channelId)) || 0;
export const shifted = () => [...shifts.entries()];

function changed() {
    for (const listener of listeners) listener();
    if (settings.store.persist) set(KEY, [...shifts]);
}

export async function load() {
    if (!settings.store.persist) return;
    const stored = await get<[string, number][]>(KEY);
    if (Array.isArray(stored)) shifts = new Map(stored.filter(([, ms]) => typeof ms === "number" && ms));
}

export function forgetSaved() {
    del(KEY);
}

// ---------------------------------------------------------------- moving messages as they load

const later = (iso: any, ms: number) => {
    const at = new Date(iso).getTime();
    return isNaN(at) ? iso : new Date(at + ms).toISOString();
};

/** A copy of one raw message with its times moved - a copy, so nothing kept elsewhere moves twice */
function moved(raw: any, ms: number) {
    if (!raw || typeof raw !== "object" || !raw.timestamp) return raw;

    const copy = { ...raw, timestamp: later(raw.timestamp, ms) };
    if (raw.edited_timestamp) copy.edited_timestamp = later(raw.edited_timestamp, ms);
    if (raw.call?.ended_timestamp) copy.call = { ...raw.call, ended_timestamp: later(raw.call.ended_timestamp, ms) };
    return copy;
}

const forChannel = (raw: any, channelId?: string) => {
    const ms = shiftOf(channelId ?? raw?.channel_id);
    return ms ? moved(raw, ms) : raw;
};

/**
 * Lay the shifts on whatever Discord is about to store: a page of a chat, a new or edited
 * message, and search results. Answers false always: nothing is ever held back.
 */
function interceptor(action: any): boolean {
    if (!running || !shifts.size || !action) return false;

    try {
        switch (action.type) {
            case "LOAD_MESSAGES_SUCCESS":
                if (shiftOf(action.channelId) && Array.isArray(action.messages)) {
                    action.messages = action.messages.map((raw: any) => forChannel(raw, action.channelId));
                }
                keepLast();
                break;

            case "MESSAGE_CREATE":
            case "MESSAGE_UPDATE":
                if (action.message) action.message = forChannel(action.message, action.channelId ?? action.message.channel_id);
                break;

            case "SEARCH_MESSAGES_SUCCESS":
                if (Array.isArray(action.messages)) {
                    action.messages = action.messages.map((group: any) => Array.isArray(group) ? group.map((raw: any) => forChannel(raw)) : forChannel(group));
                }
                break;
        }
    } catch (e) {
        logger.error("Could not move a message's time", e);
    }

    return false;
}

/**
 * Stay the last thing to look at a load.
 *
 * Fake Messages adds its messages to a page as it passes by. Anything after it sees them, and
 * anything before it does not - and a fake message that does not move with its conversation
 * gives the whole thing away. Interceptors run in the order they were added, so this one moves
 * itself to the end whenever something has been added after it.
 */
function keepLast() {
    const list: any[] | undefined = (FluxDispatcher as any)._interceptors;
    if (!Array.isArray(list) || list[list.length - 1] === interceptor) return;

    const at = list.indexOf(interceptor);
    if (at !== -1) list.splice(at, 1);
    list.push(interceptor);
}

let registered = false;

export function start() {
    running = true;
    if (!registered) {
        registered = true;
        FluxDispatcher.addInterceptor(interceptor);
    }
    // after every other plugin has started and added its own
    setTimeout(keepLast, 0);

    for (const channelId of shifts.keys()) reloadIfOpen(channelId);
}

export function stop() {
    running = false;
    for (const channelId of shifts.keys()) reloadIfOpen(channelId);
}

/** A chat that is loaded is loaded again, so what is on screen takes the change */
function reloadIfOpen(channelId: string) {
    if ((MessageStore.getMessages(channelId) as any)?._array?.length) reloadChat(channelId);
}

// ---------------------------------------------------------------- changing them

export function setShift(channelId: string, ms: number) {
    const rounded = Math.round(ms / 1000) * 1000;
    if ((shifts.get(channelId) ?? 0) === rounded) return;

    if (rounded) shifts.set(channelId, rounded);
    else shifts.delete(channelId);

    changed();
    if (running) reloadIfOpen(channelId);
}

export const resetShift = (channelId: string) => setShift(channelId, 0);

export function resetAll() {
    const ids = [...shifts.keys()];
    shifts.clear();
    changed();
    if (running) ids.forEach(reloadIfOpen);
}

/**
 * When the newest message in a chat was really sent, for the window to start from.
 *
 * Read off what is loaded, less any shift already on it - or, for a chat not loaded yet, off
 * the id Discord keeps of its last message, which carries its own time.
 */
export function latestReal(channelId: string, lastMessageId?: string | null): number {
    const loaded: any[] = (MessageStore.getMessages(channelId) as any)?._array ?? [];
    const newest = loaded[loaded.length - 1];
    if (newest?.timestamp) return new Date(newest.timestamp).getTime() - shiftOf(channelId);

    try {
        if (lastMessageId) return Number(BigInt(lastMessageId) >> 22n) + 1420070400000;
    } catch { /* fall through */ }

    return Date.now();
}

/** A shift said in words: "2 hours 5 minutes earlier" */
export function describe(ms: number): string {
    if (!ms) return "As it really is";

    let left = Math.abs(ms) / 60_000;
    const parts: string[] = [];
    for (const [size, word] of [[60 * 24, "day"], [60, "hour"], [1, "minute"]] as const) {
        const n = Math.floor(left / size);
        if (!n) continue;
        parts.push(`${n} ${word}${n === 1 ? "" : "s"}`);
        left -= n * size;
    }

    return (parts.join(" ") || "Under a minute") + (ms < 0 ? " earlier" : " later");
}
