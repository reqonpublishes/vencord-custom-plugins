/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { del, get, set } from "@api/DataStore";
import { Logger } from "@utils/Logger";
import { ChannelStore, FluxDispatcher, UserStore } from "@webpack/common";

import { settings } from "./settings";

const logger = new Logger("FakeMessages");

const KEY = "FakeMessages_Added";

/** Marks a load we dispatched ourselves, so the interceptor leaves it alone */
const SYNTHETIC = "__vcFakeMessages";

export interface FakeMessage {
    id: string;
    channelId: string;
    authorId: string;
    content: string;
    /** epoch ms, so it survives a trip through storage */
    sentAt: number;
    /** show the "(edited)" marker */
    edited?: boolean;
    /** paint it as though it had mentioned you */
    highlight?: boolean;
}

/** channelId -> the messages invented in it, oldest first */
let added = new Map<string, FakeMessage[]>();

const DISCORD_EPOCH = 1420070400000n;

/**
 * The id a message sent at that moment would have had.
 *
 * Discord sorts a channel by id, not by timestamp, so an invented message needs an id that
 * puts it where its clock says it belongs. Built from the time rather than at random, which
 * is also what makes the order survive a reload: the same moment is always the same id.
 */
function idAt(sentAt: number): string {
    try {
        return String((BigInt(Math.floor(sentAt)) - DISCORD_EPOCH) << 22n);
    } catch {
        return String((BigInt(Date.now()) - DISCORD_EPOCH) << 22n);
    }
}

export const isFake = (channelId: string, messageId: string) =>
    !!added.get(channelId)?.some(one => one.id === messageId);

export const countIn = (channelId: string) => added.get(channelId)?.length ?? 0;

/** How many conversations have at least one */
export const chats = () => added.size;

export const total = () => {
    let n = 0;
    for (const list of added.values()) n += list.length;
    return n;
};

// ---------------------------------------------------------------- persistence

const save = () => void (settings.store.persist && set(KEY, [...added]));

export async function load() {
    if (!settings.store.persist) {
        added = new Map();
        return;
    }

    const stored = await get<[string, FakeMessage[]][] | Record<string, FakeMessage[]>>(KEY);
    if (!stored) return;

    added = Array.isArray(stored) ? new Map(stored) : new Map(Object.entries(stored));
}

/** Called when the persist setting is switched off, so nothing is left behind on disk */
export function forgetSaved() {
    del(KEY);
}

/** Everything the sync plugin needs, in the shape the phone writes */
export const asRecord = (): Record<string, FakeMessage[]> => Object.fromEntries(added);

export function replaceAll(next: Record<string, FakeMessage[]>) {
    added = new Map(Object.entries(next ?? {}));
    save();
}

// ---------------------------------------------------------------- adding and removing

export function addMessage(message: Omit<FakeMessage, "id">): FakeMessage {
    const one: FakeMessage = { ...message, id: idAt(message.sentAt) };

    const list = added.get(one.channelId) ?? [];

    // Two invented in the same second would share an id, and a channel cannot hold the same
    // id twice - the second would replace the first on screen and could not be removed.
    while (list.some(held => held.id === one.id)) {
        one.id = String(BigInt(one.id) + 1n);
    }

    list.push(one);
    list.sort((a, b) => (BigInt(a.id) < BigInt(b.id) ? -1 : 1));
    added.set(one.channelId, list);

    save();
    showNow(one);

    return one;
}

export function removeMessage(channelId: string, messageId: string): boolean {
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

    for (const one of list) hideNow(channelId, one.id);
    return list.length;
}

export function clearAll() {
    const held = [...added];
    added = new Map();
    save();

    for (const [channelId, list] of held) {
        for (const one of list) hideNow(channelId, one.id);
    }
}

// ---------------------------------------------------------------- putting one on screen

/**
 * The raw shape a message load carries.
 *
 * Not a finished record: this is what the gateway and the API send, and what the store turns
 * into one. Building the raw shape means the record is made by the same code that makes every
 * other message, so anything reading it afterwards finds exactly what it expects.
 */
function rawMessage(one: FakeMessage) {
    const author: any = UserStore.getUser(one.authorId);
    const me: any = UserStore.getCurrentUser();

    const named = author
        ? {
            id: author.id,
            username: author.username,
            global_name: author.globalName ?? null,
            discriminator: author.discriminator ?? "0",
            avatar: author.avatar ?? null,
            bot: !!author.bot,
            public_flags: author.publicFlags ?? 0
        }
        : { id: one.authorId, username: "unknown", global_name: null, discriminator: "0", avatar: null, bot: false };

    return {
        id: one.id,
        type: 0,
        channel_id: one.channelId,
        guild_id: (ChannelStore.getChannel(one.channelId) as any)?.guild_id ?? undefined,
        content: one.content,
        timestamp: new Date(one.sentAt).toISOString(),
        edited_timestamp: one.edited ? new Date(one.sentAt).toISOString() : null,
        author: named,
        // A highlighted message is one that mentioned you, which is a fact about the message
        // rather than a colour on the row - so it is said the way Discord says it.
        mentions: one.highlight && me
            ? [{ id: me.id, username: me.username, discriminator: me.discriminator ?? "0", avatar: me.avatar ?? null }]
            : [],
        mention_roles: [],
        mention_everyone: false,
        attachments: [],
        embeds: [],
        reactions: [],
        pinned: false,
        tts: false,
        flags: 0
    };
}

/** Show one straight away, rather than waiting for the channel to be opened again */
function showNow(one: FakeMessage) {
    try {
        FluxDispatcher.dispatch({
            type: "MESSAGE_CREATE",
            channelId: one.channelId,
            message: rawMessage(one),
            optimistic: false,
            isPushNotification: false,
            [SYNTHETIC]: true
        } as any);
    } catch (e) {
        logger.error("Could not show the message straight away", e);
    }
}

/** Take one off the screen, touching nothing on the server */
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
        logger.error("Could not take the message off the screen", e);
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
    for (const [channelId, list] of added) {
        for (const one of list) hideNow(channelId, one.id);
    }
}

/** Put the ones belonging to a channel on screen now, for a channel that is already open */
export function showIn(channelId: string) {
    for (const one of added.get(channelId) ?? []) showNow(one);
}

// ---------------------------------------------------------------- message loads

/**
 * Put the invented messages back into every page that is loaded.
 *
 * A dispatch puts one on screen now; this is what keeps it there. Discord rebuilds a channel
 * from what the server sent whenever you reopen it, and the server has never heard of these,
 * so they are spliced into the page as it arrives, in id order, as if it had.
 */
export function interceptor(action: any) {
    if (action?.type !== "LOAD_MESSAGES_SUCCESS") return false;
    if (action[SYNTHETIC]) return false;

    try {
        const { channelId } = action;
        const list = added.get(channelId);
        if (!list?.length || !Array.isArray(action.messages)) return false;

        const ids = new Set(action.messages.map((m: any) => String(m?.id)));

        // Only the ones belonging to the stretch being loaded. Paging back asks for older
        // messages, and an invented one older than the page would arrive again on every
        // page until it was reached - the same message, over and over.
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

        // A page arrives newest first. Sorting the whole thing afterwards costs less than
        // finding the place for each one, and does not care how the page arrived.
        action.messages = [...action.messages, ...mine.map(rawMessage)]
            .sort((a: any, b: any) => (BigInt(a.id) < BigInt(b.id) ? 1 : -1));
    } catch (e) {
        logger.error("Could not add the invented messages to this page", e);
    }

    return false;
}
