/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

/**
 * Conversations, and parts of them, moved to another time.
 *
 * Each is a move: the messages it covers read that much earlier or later, so the gaps between
 * them, their order and the day breaks all stay true to each other. A move covers a whole
 * conversation, or the messages from one to another - by id, which is when a message was sent,
 * so a fake message or call placed in between is covered too. A message takes the newest move
 * that covers it, which lets a part be moved inside a conversation that is moved as a whole.
 *
 * Nothing is changed where it is kept - the move is laid on each message as Discord loads it,
 * which is also what makes it cover a chat opened for the first time tomorrow.
 */

import { del, get, set } from "@api/DataStore";
import { Logger } from "@utils/Logger";
import { FluxDispatcher, MessageStore } from "@webpack/common";

import { reloadChat } from "./chat";
import { settings } from "./settings";

const logger = new Logger("FakeTime");

const KEY = "FakeTime_Moves";
/** where the moves were kept when a conversation could only move as a whole */
const OLD_KEY = "FakeTime_Shifts";

export interface Move {
    /** first message covered, by id; none means from the very start */
    from?: string;
    /** last message covered, by id; none means up to the newest */
    to?: string;
    /** how far, in milliseconds (negative is earlier) */
    ms: number;
    /** the first and last message as you picked them, so a list can say which part this is */
    first?: string;
    last?: string;
}

/** channelId -> its moves, oldest first */
let moves = new Map<string, Move[]>();
let running = false;

const listeners = new Set<() => void>();
export const onChange = (listener: () => void) => (listeners.add(listener), () => void listeners.delete(listener));

export const isWhole = (move: Move) => !move.from && !move.to;
export const movesOf = (channelId?: string | null): Move[] => (channelId && moves.get(channelId)) || [];

/** How far the whole conversation is moved */
export const shiftOf = (channelId?: string | null) => movesOf(channelId).find(isWhole)?.ms ?? 0;

/** Every move, the newest of each conversation last */
export const allMoves = () => [...moves.entries()].flatMap(([channelId, list]) => list.map(move => ({ channelId, move })));
export const movedChats = () => [...moves.keys()];

function changed() {
    for (const listener of listeners) listener();
    if (settings.store.persist) set(KEY, [...moves]);
}

export async function load() {
    if (!settings.store.persist) return;

    const stored = await get<[string, Move[]][]>(KEY);
    if (Array.isArray(stored)) {
        moves = new Map(stored.filter(([, list]) => Array.isArray(list) && list.length));
        return;
    }

    // from before parts could move: one whole-conversation shift per chat
    const old = await get<[string, number][]>(OLD_KEY);
    if (Array.isArray(old)) {
        moves = new Map(old.filter(([, ms]) => typeof ms === "number" && ms).map(([channelId, ms]) => [channelId, [{ ms }]]));
        set(KEY, [...moves]);
        del(OLD_KEY);
    }
}

export function forgetSaved() {
    del(KEY);
}

// ---------------------------------------------------------------- which move a message takes

/** Ids are numbers too long for a plain number: shorter is older, then the digits decide */
const older = (a: string, b: string) => a.length !== b.length ? a.length < b.length : a < b;
export const covers = (move: Move, id: string) => (!move.from || !older(id, move.from)) && (!move.to || !older(move.to, id));

/** How far one message is moved: by the newest move that covers it */
export function msFor(channelId: string | undefined, messageId: string | undefined): number {
    const list = movesOf(channelId);
    if (!list.length || !messageId) return 0;

    for (let i = list.length - 1; i >= 0; i--) {
        if (covers(list[i], messageId)) return list[i].ms;
    }
    return 0;
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
    const ms = msFor(channelId ?? raw?.channel_id, raw?.id);
    return ms ? moved(raw, ms) : raw;
};

/**
 * Lay the moves on whatever Discord is about to store: a page of a chat, a new or edited
 * message, and search results. Answers false always: nothing is ever held back.
 */
function interceptor(action: any): boolean {
    if (!running || !moves.size || !action) return false;

    try {
        switch (action.type) {
            case "LOAD_MESSAGES_SUCCESS":
                if (movesOf(action.channelId).length && Array.isArray(action.messages)) {
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

    for (const channelId of moves.keys()) reloadIfOpen(channelId);
}

export function stop() {
    running = false;
    for (const channelId of moves.keys()) reloadIfOpen(channelId);
}

/** A chat that is loaded is loaded again, so what is on screen takes the change */
function reloadIfOpen(channelId: string) {
    if ((MessageStore.getMessages(channelId) as any)?._array?.length) reloadChat(channelId);
}

// ---------------------------------------------------------------- changing them

const same = (a: Move, b: Pick<Move, "from" | "to">) => (a.from ?? "") === (b.from ?? "") && (a.to ?? "") === (b.to ?? "");

/** A conversation's moves, all at once - for undo, which puts back exactly what was there */
export function setMoves(channelId: string, list: Move[]) {
    if (list.length) moves.set(channelId, list.map(move => ({ ...move })));
    else moves.delete(channelId);

    changed();
    if (running) reloadIfOpen(channelId);
}

/** Move the messages from one to another (or the whole conversation, with neither); 0 takes it off */
export function setMove(channelId: string, part: Omit<Move, "ms">, ms: number) {
    const rounded = Math.round(ms / 1000) * 1000;
    const rest = movesOf(channelId).filter(move => !same(move, part));
    // a changed part becomes the newest, so it wins over whatever it overlaps
    setMoves(channelId, rounded ? [...rest, { ...part, ms: rounded }] : rest);
}

export const setShift = (channelId: string, ms: number) => setMove(channelId, {}, ms);
export const removeMove = (channelId: string, move: Move) => setMove(channelId, move, 0);

export function resetAll() {
    const ids = [...moves.keys()];
    moves.clear();
    changed();
    if (running) ids.forEach(reloadIfOpen);
}

// ---------------------------------------------------------------- reading real times

const fromId = (id: string) => Number(BigInt(id) >> 22n) + 1420070400000;
const loaded = (channelId: string): any[] => (MessageStore.getMessages(channelId) as any)?._array ?? [];

/** When one message was really sent: what is shown, less the move on it - or its id's own time */
export function realTimeOf(channelId: string, messageId: string): number {
    const shown = loaded(channelId).find(message => message.id === messageId);
    if (shown?.timestamp) return new Date(shown.timestamp).getTime() - msFor(channelId, messageId);

    try {
        return fromId(messageId);
    } catch {
        return Date.now();
    }
}

/**
 * When the newest message in a chat was really sent, for the window to start from.
 *
 * Read off what is loaded - or, for a chat not loaded yet, off the id Discord keeps of its last
 * message, which carries its own time.
 */
export function latestReal(channelId: string, lastMessageId?: string | null): number {
    const newest = loaded(channelId).at(-1);
    if (newest?.id) return realTimeOf(channelId, newest.id);

    try {
        if (lastMessageId) return fromId(lastMessageId);
    } catch { /* fall through */ }

    return Date.now();
}

/** The loaded messages a part covers, oldest first */
export const messagesIn = (channelId: string, part: Pick<Move, "from" | "to">) =>
    loaded(channelId).filter(message => covers({ ...part, ms: 0 }, message.id));

/**
 * Whether a part, moved this far, would read out of order with the messages around it - later
 * than the one after it, or earlier than the one before. Discord keeps them in the order they
 * were sent whatever their times say, so the times would contradict the order on screen.
 */
export function outOfOrder(channelId: string, part: Pick<Move, "from" | "to">, ms: number): "before" | "after" | null {
    const list = loaded(channelId);
    const inside = list.filter(message => covers({ ...part, ms: 0 }, message.id));
    if (!inside.length) return null;

    const first = list.indexOf(inside[0]);
    const last = list.indexOf(inside[inside.length - 1]);
    const timeOf = (message: any) => new Date(message.timestamp).getTime();
    const ownMove = (message: any) => msFor(channelId, message.id);

    const before = list[first - 1];
    const after = list[last + 1];
    const firstAt = timeOf(inside[0]) - ownMove(inside[0]) + ms;
    const lastAt = timeOf(inside[inside.length - 1]) - ownMove(inside[inside.length - 1]) + ms;

    if (before && firstAt < timeOf(before)) return "before";
    if (after && lastAt > timeOf(after)) return "after";
    return null;
}

/** A move said in words: "2 hours 5 minutes earlier" */
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
