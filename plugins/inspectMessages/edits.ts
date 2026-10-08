/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { del, get, set } from "@api/DataStore";
import { updateMessage } from "@api/MessageUpdater";
import { Message } from "@vencord/discord-types";
import { findCssClassesLazy } from "@webpack";
import { ChannelStore, MessageStore, moment, UserStore } from "@webpack/common";

import { settings } from "./settings";

const KEY = "InspectMessages_Edits";
/** What the key was called back when this plugin was QuickInspect */
const LEGACY_KEY = "QuickInspect_Edits";

interface Snapshot {
    content: string;
    /** epoch ms, so it survives a trip through IndexedDB */
    timestamp: number;
    editedTimestamp: number | null;
    /** whether it was highlighted as a ping before we touched it */
    mentioned?: boolean;
}

interface StoredEdit {
    channelId: string;
    content?: string;
    timestamp?: number;
    editedTimestamp?: number | null;
    /** explicit "paint this as a ping", rather than guessing from the text */
    highlight?: boolean;
    /** what the message looked like before we ever touched it, so Revert has somewhere to go */
    original: Snapshot;
}

/**
 * Every message we've rewritten, keyed by message id. A Map rather than an object because
 * `size` and `get` are O(1) and both are read on the Flux hot path.
 *
 * Only the text and the timestamps change. A message keeps its id and its place in the
 * channel: reordering would mean re-keying it, which breaks replying and reacting.
 */
let edits = new Map<string, StoredEdit>();

const save = () => void (settings.store.persist && set(KEY, edits));

export async function loadEdits() {
    if (!settings.store.persist) {
        edits = new Map();
        return edits;
    }

    type Stored = Map<string, StoredEdit> | Record<string, StoredEdit>;

    // the rename shouldn't cost anyone their edits, so fall back to the old key once
    let stored = await get<Stored>(KEY);
    let migrated = false;
    if (stored === undefined) {
        stored = await get<Stored>(LEGACY_KEY);
        migrated = stored !== undefined;
    }

    // tolerate the plain-object shape written by earlier versions
    edits = stored instanceof Map ? stored : new Map(Object.entries(stored ?? {}));

    if (migrated) {
        set(KEY, edits);
        del(LEGACY_KEY);
    }

    return edits;
}

/** Called when the persist setting is switched off, so nothing is left behind on disk */
export function forgetSaved() {
    del(KEY);
    del(LEGACY_KEY);
}

export const hasEdits = () => edits.size > 0;
export const countEdits = () => edits.size;
export const isEdited = (id: string) => edits.has(id);
export const getOriginal = (id: string) => edits.get(id)?.original;

/** The highlight choice already saved for this message, if one was made */
export const getHighlight = (id: string) => edits.get(id)?.highlight;

export interface EditPatch {
    content?: string;
    timestamp?: Date;
    /** whether to paint the row as a mention */
    highlight?: boolean;
    /** a Date adds the "(edited)" marker, null removes it, undefined leaves it alone */
    editedTimestamp?: Date | null;
}

// @everyone and @here are parsed straight out of plain text, unlike user mentions
const EVERYONE_OR_HERE = /(?:^|[^\w<])@(?:everyone|here)/;

const selfMentions = () => {
    const me = UserStore.getCurrentUser()?.id;
    return me ? [`<@${me}>`, `<@!${me}>`] : [];
};

/**
 * Whether this content would ping us.
 *
 * Discord paints a message orange off `mentioned` on the record, which the server worked
 * out when the message arrived. Rewriting the text doesn't update it, so an edit that adds
 * a ping would render as a plain message and one that drops a ping would stay highlighted.
 */
function pingsMe(content: string) {
    if (!content) return false;
    if (EVERYONE_OR_HERE.test(content)) return true;

    return selfMentions().some(tag => content.includes(tag));
}

/**
 * Ping highlighting, drawn ourselves.
 *
 * Setting `mentioned` on the record isn't enough: Discord works that out from who the
 * message pings and never counts your own messages as pinging you, so an edited message of
 * yours saying @everyone stays plain no matter what the flag says. Painting the row
 * directly matches what a real ping looks like and works whoever wrote it.
 *
 * "off" is for the other direction: a message that really did ping you, edited to drop it,
 * would otherwise stay orange.
 */
type Highlight = "on" | "off";

/**
 * Discord's own message classes, so a faked ping uses the real thing.
 *
 * Painting our own orange never matched: the shade, the left bar and the hover state are
 * all themeable, and a hand-picked colour is obvious next to a genuine mention. Adding the
 * class Discord itself adds means the row is styled by Discord's stylesheet, so it looks
 * identical and follows whatever theme is in use.
 */
const MessageClasses = findCssClassesLazy("mentioned", "message");

const highlights = new Map<string, Highlight>();
/** rows we've added the class to, so it can be taken off again */
const marked = new Set<string>();

let styleEl: HTMLStyleElement | null = null;
let observer: MutationObserver | null = null;
let observed: Element | null = null;
let passScheduled = false;

function messageClasses() {
    try {
        const classes: any = MessageClasses;
        return classes?.mentioned ? classes : null;
    } catch {
        // not on this build; suppression still works, painting a ping doesn't
        return null;
    }
}

const tokensOf = (value: unknown) => String(value ?? "").split(" ").filter(Boolean);

const rowFor = (key: string) => document.getElementById(`chat-messages-${key.replace(":", "-")}`);

/** The element Discord itself puts the mentioned class on: the message inside the row */
function targetIn(row: HTMLElement, classes: any): HTMLElement {
    const first = tokensOf(classes.message)[0];
    const inner = first ? row.querySelector<HTMLElement>(`.${first}`) : null;

    return inner ?? (row.firstElementChild as HTMLElement | null) ?? row;
}

/**
 * Suppression only. Removing a real ping needs to beat Discord's own rule, which a class
 * can't do, so that half stays as a stylesheet override scoped to the row.
 */
function rebuildSuppression() {
    if (!styleEl) return;

    let css = "";
    for (const [key, state] of highlights) {
        if (state !== "off") continue;

        const sel = `#chat-messages-${key.replace(":", "-")}`;
        css += `${sel},${sel}>*{background-color:transparent!important;box-shadow:none!important}`;
    }

    styleEl.textContent = css;
}

/** Put Discord's class on the rows that should read as pings, and take it off the rest */
function applyHighlights() {
    passScheduled = false;

    const classes = messageClasses();
    if (!classes) return;

    const tokens = tokensOf(classes.mentioned);
    if (!tokens.length) return;

    for (const key of [...marked]) {
        if (highlights.get(key) === "on") continue;

        const row = rowFor(key);
        if (row) targetIn(row, classes).classList.remove(...tokens);
        marked.delete(key);
    }

    for (const [key, state] of highlights) {
        if (state !== "on") continue;

        const row = rowFor(key);
        if (!row) continue;

        targetIn(row, classes).classList.add(...tokens);
        marked.add(key);
    }
}

function schedulePass() {
    if (passScheduled) return;

    passScheduled = true;
    requestAnimationFrame(applyHighlights);
}

/** React rebuilds rows as you scroll, so the class has to be put back when it does */
function startObserver() {
    const row = document.querySelector('[id^="chat-messages-"]');
    const list = row?.parentElement;
    if (!list || observed === list) return;

    observer?.disconnect();
    observed = list;
    observer = new MutationObserver(schedulePass);
    observer.observe(list, { childList: true });
}

export function startStyles() {
    styleEl = document.createElement("style");
    styleEl.id = "vc-custom-inspect-messages";
    document.head.appendChild(styleEl);

    rebuildSuppression();
    schedulePass();
}

export function stopStyles() {
    observer?.disconnect();
    observer = null;
    observed = null;

    highlights.clear();
    applyHighlights();

    styleEl?.remove();
    styleEl = null;
}

/** What this edit should look like: a ping, deliberately not a ping, or left alone */
function wantedHighlight(entry: StoredEdit): Highlight | null {
    // an explicit choice wins; otherwise fall back to reading the text
    const on = entry.highlight ?? (entry.content !== undefined && pingsMe(entry.content));
    if (on) return "on";

    // a message that really did ping has to be actively un-painted
    return entry.original.mentioned ? "off" : null;
}

/** Whether the text alone would read as a ping. Used to seed the toggle. */
export const looksLikePing = pingsMe;

function syncHighlight(id: string, entry: StoredEdit) {
    const key = `${entry.channelId}:${id}`;
    const wanted = wantedHighlight(entry);

    if (highlights.get(key) === wanted) return;

    if (wanted) highlights.set(key, wanted);
    else highlights.delete(key);

    rebuildSuppression();
    startObserver();
    schedulePass();
}

function clearHighlight(channelId: string, id: string) {
    if (!highlights.delete(`${channelId}:${id}`)) return;

    rebuildSuppression();
    schedulePass();
}

/** Keep the raw payload's mention fields in step, since the record is built from them */
function applyMentionState(raw: any, content: string) {
    raw.mention_everyone = EVERYONE_OR_HERE.test(content);
    raw.mentioned = pingsMe(content);

    const me = UserStore.getCurrentUser()?.id;
    if (!me) return;

    const idOf = (u: any) => typeof u === "string" ? u : u?.id;
    const mentions: any[] = Array.isArray(raw.mentions) ? raw.mentions : [];
    const listed = mentions.some(u => idOf(u) === me);
    const wanted = selfMentions().some(tag => content.includes(tag));

    if (wanted && !listed) raw.mentions = [...mentions, { id: me }];
    else if (!wanted && listed) raw.mentions = mentions.filter(u => idOf(u) !== me);
    else raw.mentions = mentions;
}

export function toDate(timestamp: any): Date {
    if (timestamp == null) return new Date();
    if (timestamp instanceof Date) return timestamp;
    if (typeof timestamp.toDate === "function") return timestamp.toDate();
    return new Date(timestamp);
}

/**
 * Message records hold moment objects on most builds and plain Dates on others.
 * Copy whatever shape the message already uses so <Timestamp> keeps rendering it.
 */
function likeTimestamp(reference: any, date: Date) {
    const isMoment = reference != null && typeof reference === "object"
        && typeof reference.format === "function" && typeof reference.toDate === "function";

    if (!isMoment && reference instanceof Date) return date;

    try {
        return moment(date);
    } catch {
        return date;
    }
}

/**
 * Rewrite a raw API message in place, before the store turns it into a record.
 *
 * This is the zero-flicker path: patching the payload as it arrives means the first paint
 * already shows the edit, instead of painting the real message and correcting it a frame
 * later. Raw payloads are snake_case and carry ISO strings, unlike the records.
 */
export function patchRawMessage(raw: any) {
    const entry = raw && edits.get(raw.id);
    if (!entry) return;

    if (entry.content !== undefined) {
        raw.content = entry.content;
        applyMentionState(raw, entry.content);
        syncHighlight(raw.id, entry);
    }
    if (entry.timestamp !== undefined) raw.timestamp = new Date(entry.timestamp).toISOString();
    if (entry.editedTimestamp !== undefined) {
        raw.edited_timestamp = entry.editedTimestamp === null
            ? null
            : new Date(entry.editedTimestamp).toISOString();
    }
}

export function patchRawMessages(list: any[]) {
    if (!Array.isArray(list)) return;

    for (let i = 0; i < list.length; i++) patchRawMessage(list[i]);
}

/** Push a stored edit onto a message that's already a record in the cache */
function render(id: string, entry: StoredEdit) {
    const live = MessageStore.getMessage(entry.channelId, id);
    if (!live) return;

    const fields: Record<string, any> = {};
    if (entry.content !== undefined) {
        fields.content = entry.content;
        fields.mentioned = pingsMe(entry.content);
        fields.mentionEveryone = EVERYONE_OR_HERE.test(entry.content);
    }
    if (entry.timestamp !== undefined) {
        fields.timestamp = likeTimestamp(live.timestamp, new Date(entry.timestamp));
    }
    if (entry.editedTimestamp !== undefined) {
        fields.editedTimestamp = entry.editedTimestamp === null
            ? null
            : likeTimestamp(live.timestamp, new Date(entry.editedTimestamp));
    }

    syncHighlight(id, entry);
    updateMessage(entry.channelId, id, fields);
}

/** Put a message back the way we found it, without forgetting the edit */
function renderOriginal(id: string, entry: StoredEdit) {
    const live = MessageStore.getMessage(entry.channelId, id);
    if (!live) return;

    const fields: Record<string, any> = {
        content: entry.original.content,
        // older saved edits predate the snapshot, so work it out from the text instead
        mentioned: entry.original.mentioned ?? pingsMe(entry.original.content),
        mentionEveryone: EVERYONE_OR_HERE.test(entry.original.content),
        timestamp: likeTimestamp(live.timestamp, new Date(entry.original.timestamp)),
        editedTimestamp: entry.original.editedTimestamp === null
            ? null
            : likeTimestamp(live.timestamp, new Date(entry.original.editedTimestamp))
    };

    clearHighlight(entry.channelId, id);
    updateMessage(entry.channelId, id, fields);
}

export function applyEdit(message: Message, patch: EditPatch) {
    const channelId = message.channel_id;
    // the message handed to us can be a stale copy, the store always has the current one
    const live = MessageStore.getMessage(channelId, message.id) ?? message;
    const existing = edits.get(message.id);

    const entry: StoredEdit = {
        channelId,
        content: patch.content ?? existing?.content,
        timestamp: patch.timestamp ? patch.timestamp.getTime() : existing?.timestamp,
        editedTimestamp: patch.editedTimestamp !== undefined
            ? (patch.editedTimestamp === null ? null : patch.editedTimestamp.getTime())
            : existing?.editedTimestamp,
        highlight: patch.highlight ?? existing?.highlight,
        // capture the pristine values once, on the first edit only
        original: existing?.original ?? {
            content: live.content,
            timestamp: toDate(live.timestamp).getTime(),
            editedTimestamp: live.editedTimestamp ? toDate(live.editedTimestamp).getTime() : null,
            mentioned: !!(live as any).mentioned
        }
    };

    edits.set(message.id, entry);
    save();
    render(message.id, entry);
}

/** Undo one message and forget it */
export function resetEdit(id: string) {
    const entry = edits.get(id);
    if (!entry) return;

    edits.delete(id);
    save();
    renderOriginal(id, entry);
}

/** Undo everything and wipe the saved list */
export function clearAllEdits() {
    for (const [id, entry] of edits) renderOriginal(id, entry);

    edits.clear();
    if (settings.store.persist) set(KEY, edits);
}

/** Undo the on-screen changes but keep them saved, for when the plugin is turned off */
export function restoreVisuals() {
    for (const [id, entry] of edits) renderOriginal(id, entry);
}

/**
 * Apply saved edits to messages that were already on screen before we started.
 * Only needed when the plugin is enabled mid-session; every load after that is covered by
 * the interceptor, which is both earlier and cheaper.
 */
export function reapplyChannel(channelId: string) {
    for (const [id, entry] of edits) {
        if (entry.channelId === channelId) render(id, entry);
    }
}

// ---------------------------------------------------------------- search

/** What each open search asked for, by the id Discord gives the search (a channel, a server or "DMS") */
const asked = new Map<string, any>();

/** The filters this can answer for. A search using any other is left exactly as the server answered it */
const UNDERSTOOD = new Set([
    "content", "author_id", "channel_id", "min_id", "max_id", "sort_by", "sort_order", "offset", "cursor", "limit", "include_nsfw"
]);

const listOf = (value: any): string[] => value == null ? [] : (Array.isArray(value) ? value : [value]).map(String);

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
    const text = message.content.toLowerCase();
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

/** Remember what a search asked for. Cheap, and done whether or not anything is edited yet */
export function noteSearch(action: any) {
    asked.set(String(action.id), action.query);
}

/** A loaded message, put back into the shape the server sends, with our changes on it */
function rawFrom(id: string, entry: StoredEdit): any | null {
    const message: any = MessageStore.getMessage(entry.channelId, id);
    const author = message?.author;
    if (!message || !author) return null;

    // An embed is rebuilt by the client into a shape it cannot be handed back in, so a
    // message carrying one is left for the server to find.
    if (message.embeds?.length) return null;

    const raw = {
        id,
        type: message.type ?? 0,
        channel_id: entry.channelId,
        content: message.content ?? "",
        timestamp: toDate(message.timestamp).toISOString(),
        edited_timestamp: message.editedTimestamp ? toDate(message.editedTimestamp).toISOString() : null,
        author: {
            id: author.id,
            username: author.username,
            global_name: author.globalName ?? null,
            discriminator: author.discriminator ?? "0",
            avatar: author.avatar ?? null,
            bot: !!author.bot,
            public_flags: author.publicFlags ?? 0
        },
        attachments: message.attachments ?? [],
        embeds: [],
        mentions: [],
        mention_roles: [],
        mention_everyone: false,
        pinned: !!message.pinned,
        tts: false,
        flags: message.flags ?? 0,
        components: [],
        hit: true
    };

    patchRawMessage(raw);
    return raw;
}

/**
 * Make a search agree with what the messages now say.
 *
 * Three things, because the server searched the real text. A result that was rewritten is
 * shown as rewritten. One that only matched the words it used to have is taken out, since
 * it no longer says them. And one that says them now, and did not before, is put in - where
 * the message is loaded, so there is something to build the result from.
 */
export function patchSearch(action: any) {
    if (!Array.isArray(action?.data)) return;

    for (const result of action.data) {
        if (!Array.isArray(result?.messages)) continue;

        const searchId = String(result.id ?? "");
        const query = asked.get(searchId);
        const found = new Set<string>();
        let dropped = 0;

        result.messages = result.messages.filter((group: any[]) => {
            if (!Array.isArray(group)) return true;

            for (const one of group) {
                if (one?.id) found.add(String(one.id));
                patchRawMessage(one);
            }

            const hit = group.find(one => one?.hit) ?? group[0];
            const entry = hit && edits.get(hit.id);
            if (!entry || entry.content === undefined || !query?.content) return true;

            const still = wouldMatch({ content: query.content }, { id: hit.id, channelId: hit.channel_id, authorId: hit.author?.id ?? "", content: entry.content });
            if (!still) dropped++;

            return still;
        });

        // Only the first page: which page a rewritten message belongs on would need the
        // dates of pages not fetched yet, and the top of the results is where it is looked for.
        let put = 0;
        if (query?.content && !(query.offset > 0) && result.cursor?.type !== "score") {
            const extra: any[] = [];

            for (const [id, entry] of edits) {
                if (entry.content === undefined || found.has(id) || !inScope(searchId, entry.channelId)) continue;

                const message: any = MessageStore.getMessage(entry.channelId, id);
                if (!message) continue;
                if (!wouldMatch(query, { id, channelId: entry.channelId, authorId: message.author?.id ?? "", content: entry.content })) continue;

                const raw = rawFrom(id, entry);
                if (raw) extra.push([raw]);
            }

            if (extra.length) {
                put = extra.length;
                const idOf = (group: any[]) => BigInt((group.find(m => m?.hit) ?? group[0]).id);
                result.messages = [...result.messages, ...extra].sort((a, b) => (idOf(a) < idOf(b) ? 1 : -1));
            }
        }

        if (typeof result.totalResults === "number") result.totalResults = Math.max(0, result.totalResults - dropped + put);
    }
}
