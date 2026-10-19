/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { del, get, set } from "@api/DataStore";
import { Logger } from "@utils/Logger";
import { ChannelStore, Flux, FluxDispatcher, MessageCache, MessageStore, SelectedChannelStore, UserStore } from "@webpack/common";

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
    /** a forward of another message, shown the way Discord shows a forwarded message */
    forward?: {
        channelId: string;
        messageId: string;
        content: string;
        sentAt: number;
    };
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

/** The stored one behind a message on screen, for when the record alone does not say enough */
export const getFake = (channelId: string, messageId: string) =>
    added.get(channelId)?.find(one => one.id === messageId);

/** Whether the plugin is on. The interceptor outlives a stop, so it has to ask */
let running = false;
export const setRunning = (on: boolean) => void (running = on);
export const isRunning = () => running;

export const countIn = (channelId: string) => added.get(channelId)?.length ?? 0;

/** How many conversations have at least one */
export const chats = () => added.size;

export const total = () => {
    let n = 0;
    for (const list of added.values()) n += list.length;
    return n;
};

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

/**
 * The read still in progress, if there is one.
 *
 * `loaded` is set the moment reading begins, so a start that comes while the first one is
 * still waiting on disk would otherwise take the list as read and show an empty one. Every
 * start waits on this instead.
 */
let reading: Promise<void> | null = null;

/** Read the list from disk if it has not been, and hand back anything still being read */
export function load(): Promise<void> | null {
    if (!loaded) {
        loaded = true;

        const mine: Promise<void> = read().finally(() => {
            if (reading === mine) reading = null;
        });
        reading = mine;
    }

    return reading;
}

async function read() {
    // Nothing on disk to read, and what is in memory is the only copy there is.
    if (!settings.store.persist) return;

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

    // Only the conversation you are looking at is told a message arrived. Telling any other
    // would mark it unread, move it up the DM list and could ping - and opening it then would
    // tell Discord you had read a message it has never heard of. Anywhere else it is slipped
    // into what is loaded, or left for the interceptor to add when the chat is opened.
    if (one.channelId === SelectedChannelStore.getChannelId()) {
        showNow(one);
        settle(one.channelId);
    } else {
        slipIn(one.channelId, [one]);
    }

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

    const raw = {
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

    // A forward, built the way one arrives from Discord: an empty message of its own, marked
    // as carrying a snapshot, pointing at where the original sits, with the original inside.
    if (one.forward) {
        const raw2: any = raw;
        raw2.content = "";
        raw2.flags = 1 << 14;
        raw2.message_reference = { type: 1, channel_id: one.forward.channelId, message_id: one.forward.messageId };
        raw2.message_snapshots = [{
            message: {
                type: 0,
                content: one.forward.content,
                attachments: [],
                embeds: [],
                mentions: [],
                mention_roles: [],
                components: [],
                timestamp: new Date(one.forward.sentAt).toISOString(),
                edited_timestamp: null,
                flags: 0
            }
        }];
    }

    // If this one has been rewritten with Inspect Messages, it is handed over already
    // rewritten. Inspect only gets to messages as they load, and these are put in by hand,
    // sometimes after it has looked - so it is asked directly rather than left to notice.
    try {
        const inspect = (window as any).Vencord?.Plugins?.plugins?.InspectMessages;
        if (inspect?.started) inspect.patchRaw?.(raw);
    } catch { /* shown as written, which is still right */ }

    return raw;
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

/**
 * Put the invented messages back into every page that is loaded.
 *
 * A dispatch puts one on screen now; this is what keeps it there. Discord rebuilds a channel
 * from what the server sent whenever you reopen it, and the server has never heard of these,
 * so they are spliced into the page as it arrives, in id order, as if it had.
 */
export function interceptor(action: any) {
    if (action?.type === "SEARCH_RESULTS_QUERY_UPDATE") {
        asked.set(String(action.id), { query: action.query, offset: action.offset });
        return false;
    }
    if (action?.type === "SEARCH_MESSAGES_SUCCESS") {
        addToSearch(action);
        return false;
    }

    if (action?.type !== "LOAD_MESSAGES_SUCCESS") return false;
    if (action[SYNTHETIC]) return false;

    // Switched off: a chat that reloads now should come back exactly as Discord has it.
    if (!running) return false;

    try {
        const { channelId } = action;
        const list = added.get(channelId);
        if (!list?.length || !Array.isArray(action.messages)) return false;

        const ids = new Set(action.messages.map((m: any) => String(m?.id)));

        // Only the ones belonging to the stretch being loaded. Paging back asks for older
        // messages, and an invented one older than the page would arrive again on every
        // page until it was reached - the same message, over and over. Jumping to an old
        // message loads the stretch around it, with more after it, and one newer than that
        // stretch belongs further down rather than in the middle of last year.
        let oldest: string | null = null;
        let newest: string | null = null;
        for (const m of action.messages) {
            if (!m?.id) continue;
            if (oldest === null || BigInt(m.id) < BigInt(oldest)) oldest = String(m.id);
            if (newest === null || BigInt(m.id) > BigInt(newest)) newest = String(m.id);
        }

        const mine = list.filter(one => {
            if (ids.has(one.id)) return false;
            if (action.hasMoreBefore && oldest !== null && BigInt(one.id) < BigInt(oldest)) return false;
            if (action.hasMoreAfter && newest !== null && BigInt(one.id) > BigInt(newest)) return false;
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

// ---------------------------------------------------------------- search

/** What each open search asked for, by the id Discord gives the search (a channel, a server or "DMS") */
const asked = new Map<string, { query: any; offset?: number; }>();

/** The filters this can answer for. A search using any other is left exactly as the server answered it */
const UNDERSTOOD = new Set([
    "content", "author_id", "channel_id", "min_id", "max_id", "sort_by", "sort_order", "offset", "cursor", "limit", "include_nsfw"
]);

const listOf = (value: any): string[] => value == null ? [] : (Array.isArray(value) ? value : [value]).map(String);

/**
 * What a message says on screen, which is not always what it was added with.
 *
 * One rewritten with Inspect Messages reads as rewritten everywhere else, so a search should
 * find it by the words it shows - not miss it for those and turn it up for the old ones.
 */
function shownText(message: { id: string; content: string; }): string {
    try {
        const inspect = (window as any).Vencord?.Plugins?.plugins?.InspectMessages;
        if (!inspect?.started) return message.content;

        const shown = { id: message.id, content: message.content };
        inspect.patchRaw?.(shown);
        return typeof shown.content === "string" ? shown.content : message.content;
    } catch {
        return message.content;
    }
}

/**
 * Whether a message would have been found by a search, had the server known about it.
 *
 * Discord matches words rather than a run of letters, so every word asked for has to be in
 * the text somewhere. Close enough to the real thing that a message turns up when you would
 * expect it to, without pretending to be the search engine.
 */
function wouldMatch(query: any, message: { id: string; channelId: string; authorId: string; content: string; }): boolean {
    if (!query) return false;

    for (const key of Object.keys(query)) {
        if (!UNDERSTOOD.has(key)) return false;
    }

    const words = String(query.content ?? "").toLowerCase().split(/\s+/).filter(Boolean);
    const text = shownText(message).toLowerCase();
    if (!words.every(word => text.includes(word))) return false;

    const authors = listOf(query.author_id);
    if (authors.length && !authors.includes(message.authorId)) return false;

    const channels = listOf(query.channel_id);
    if (channels.length && !channels.includes(message.channelId)) return false;

    try {
        const id = BigInt(message.id);
        if (query.min_id != null && id < BigInt(query.min_id)) return false;
        if (query.max_id != null && id > BigInt(query.max_id)) return false;
    } catch {
        return false;
    }

    return true;
}

/** Whether a channel is one of the places a search is looking in */
function inScope(searchId: string, channelId: string): boolean {
    if (searchId === channelId) return true;

    const channel: any = ChannelStore.getChannel(channelId);
    if (!channel) return false;

    return searchId === "DMS" ? !channel.guild_id : channel.guild_id === searchId;
}

/** Where each page of each search ended, so the page after it knows where to begin */
const pageEnds = new Map<string, Map<number, bigint>>();

/**
 * Put the invented messages a search should have found in among the ones it did.
 *
 * The server has never heard of them, so they are matched here against what was asked for
 * and slotted into the results by date, which is the order results come in.
 *
 * Results come a page at a time, and each invented message has to land on exactly one of
 * them. Which page this is comes from the search itself - how far in it starts - rather than
 * from looking at what is on it, because other plugins add to a page too and what is on it
 * stops being a reliable guide. A page takes the messages that fall between where the page
 * before it ended and where this one ends; the first page has no upper edge and the last no
 * lower one. Sorted any other way than by date there is no such thing as between, and they
 * all go on the first page.
 */
function addToSearch(action: any) {
    if (!running || !added.size || !Array.isArray(action?.data)) return;

    try {
        for (const result of action.data) {
            const searchId = String(result?.id ?? "");
            const ask = asked.get(searchId);
            if (!ask?.query || !Array.isArray(result.messages)) continue;

            const { query } = ask;
            const offset = Number(ask.offset) || 0;

            // Only by date, newest first, is an order this can slot something into.
            const byDate = (query.sort_by ?? "timestamp") === "timestamp" && (query.sort_order ?? "desc") === "desc";

            const found = new Set<string>();
            let newest: bigint | null = null;
            let oldest: bigint | null = null;
            for (const group of result.messages) {
                for (const one of group ?? []) {
                    if (!one?.id) continue;
                    found.add(String(one.id));

                    const id = BigInt(one.id);
                    if (newest === null || id > newest) newest = id;
                    if (oldest === null || id < oldest) oldest = id;
                }
            }

            const onPage = result.messages.length;
            const total = typeof result.totalResults === "number" ? result.totalResults : null;
            const more = oldest !== null && (total !== null ? offset + onPage < total : result.cursor != null);

            const key = searchId + "|" + JSON.stringify(query);
            let ends = pageEnds.get(key);
            if (!ends) {
                // one search at a time is all that is ever being paged through
                if (pageEnds.size > 20) pageEnds.clear();
                pageEnds.set(key, ends = new Map());
            }

            // Where the page before this one ended. If that page was never opened - somebody
            // jumped straight to page five - the top of this page stands in for it: a message
            // can go missing from between two unseen pages, but can never turn up twice.
            const upper = offset === 0 ? null : ends.get(offset) ?? newest;
            if (oldest !== null) ends.set(offset + onPage, oldest);

            const mine: FakeMessage[] = [];
            let matching = 0;

            for (const [channelId, list] of added) {
                if (!inScope(searchId, channelId)) continue;

                for (const one of list) {
                    if (!wouldMatch(query, one)) continue;
                    matching++;

                    if (found.has(one.id)) continue;

                    if (byDate) {
                        const id = BigInt(one.id);
                        if (upper !== null && id >= upper) continue;
                        if (more && id < oldest!) continue;
                    } else if (offset !== 0) {
                        continue;
                    }

                    mine.push(one);
                }
            }

            // The count is of the whole search, so it is the same on every page of it.
            if (total !== null) result.totalResults = total + matching;
            if (!mine.length) continue;

            const groups = [...result.messages, ...mine.map(one => [{ ...rawMessage(one), hit: true }])];
            if (byDate) {
                const idOf = (group: any[]) => BigInt((group.find(m => m?.hit) ?? group[0]).id);
                groups.sort((a, b) => (idOf(a) < idOf(b) ? 1 : -1));
            }

            result.messages = groups;
        }
    } catch (e) {
        logger.error("Could not add the invented messages to a search", e);
    }
}

/**
 * Put them on screen in every conversation that is already loaded, not only the open one.
 *
 * A conversation you have visited keeps its messages, and is not asked for again when you go
 * back to it - so one that was loaded before these arrived would not show them until it was
 * closed and reopened. That is what a sync from the cloud looked like: nothing, until you
 * left the chat and came back.
 *
 * The open one is told as a message arriving, which is what redraws it. The others have the
 * messages slipped into what they are holding, quietly: telling Discord a message had arrived
 * in a chat you are not looking at would mark it unread and could ping.
 */
export function showLoaded(open?: string | null) {
    for (const [channelId, list] of added) {
        if (channelId === open) showIn(channelId);
        else slipIn(channelId, list);
    }
}

/**
 * Put some into a conversation you are not looking at, without telling anything they arrived.
 *
 * Only where its messages are already loaded. Where they are not, there is nothing to put them
 * in, and nothing needed: the interceptor adds them when the conversation is opened.
 */
function slipIn(channelId: string, list: FakeMessage[]) {
    try {
        let cache: any = (MessageCache as any).get?.(channelId);
        if (!cache?.ready) return;

        let put = false;
        for (const one of list) {
            if (cache.has(one.id)) continue;

            cache = cache.receiveMessage(rawMessage(one));
            put = true;
        }
        if (!put) return;

        MessageCache.commit(cache);
        settle(channelId);
        MessageStore.emitChange();
    } catch (e) {
        logger.error("Could not add to a conversation that was already loaded", e);
    }
}
