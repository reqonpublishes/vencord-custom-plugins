/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { del, get, set } from "@api/DataStore";
import { Logger } from "@utils/Logger";
import { FluxDispatcher, RelationshipStore, UserStore } from "@webpack/common";

import { settings } from "./settings";

const logger = new Logger("HideFriends");

const KEY = "HideFriends_State";

/** Marks a relationship event as ours, so nothing treats it as news from Discord */
const OURS = "__vcHideFriends";

/** The relationship types Discord uses. Nothing invents its own. */
export const NONE = 0;
export const FRIEND = 1;
export const BLOCKED = 2;
export const PENDING_INCOMING = 3;
export const PENDING_OUTGOING = 4;

/** What a relationship really was, so putting it back is exact rather than a guess */
interface Was {
    type: number;
    nickname?: string | null;
    since?: string | null;
}

interface Stored {
    /** userId -> the name they had when hidden, so the list stays readable */
    hidden: Record<string, string>;
    hiddenWas: Record<string, Was>;
    /** userId -> somebody this client treats as blocked, without Discord being told */
    blocked: Record<string, string>;
    blockedWas: Record<string, Was>;
    /** userId -> when a request to them was pretended, so it shows as pending */
    pending: Record<string, number>;
    /** userId -> somebody shown as having sent you a request they never sent */
    incoming: Record<string, string>;
    /** userId -> a real request, taken off this client without being answered */
    dismissed: Record<string, string>;
    /** userId -> somebody shown as a friend after accepting a request they never sent */
    friended: Record<string, string>;
}

const blank = (): Stored => ({
    hidden: {},
    hiddenWas: {},
    blocked: {},
    blockedWas: {},
    pending: {},
    incoming: {},
    dismissed: {},
    friended: {}
});

let held: Stored = blank();

// ---------------------------------------------------------------- reading

export const isHidden = (id?: string | null) => !!id && id in held.hidden;
export const isBlocked = (id?: string | null) => !!id && id in held.blocked;
export const isPending = (id?: string | null) => !!id && id in held.pending;
export const isIncoming = (id?: string | null) => !!id && id in held.incoming;
export const isDismissed = (id?: string | null) => !!id && id in held.dismissed;
export const isFriended = (id?: string | null) => !!id && id in held.friended;

/** Anybody this client is pretending something about */
export const isPretended = (id?: string | null) =>
    isHidden(id) || isBlocked(id) || isPending(id) || isIncoming(id) || isFriended(id);

export const counts = () => ({
    hidden: Object.keys(held.hidden).length,
    blocked: Object.keys(held.blocked).length,
    pending: Object.keys(held.pending).length,
    incoming: Object.keys(held.incoming).length,
    dismissed: Object.keys(held.dismissed).length,
    friended: Object.keys(held.friended).length
});

export const listed = () => ({
    hidden: Object.entries(held.hidden),
    blocked: Object.entries(held.blocked),
    incoming: Object.entries(held.incoming),
    pending: Object.keys(held.pending),
    dismissed: Object.entries(held.dismissed),
    friended: Object.entries(held.friended)
});

export function nameOf(id: string): string {
    const user: any = UserStore.getUser(id);
    return user?.globalName ?? user?.username ?? held.hidden[id] ?? held.blocked[id] ?? id;
}

/** Somebody on one of the lists as the settings page draws them */
export function infoOf(id: string, stored?: string): { name: string; image: string | null; detail: string; } {
    const user: any = UserStore.getUser(id);
    if (!user) return { name: stored || id, image: null, detail: "Not loaded on this device" };

    return {
        name: user.globalName ?? user.username,
        image: user.getAvatarURL?.(undefined, 64) ?? null,
        detail: "@" + user.username
    };
}

// ---------------------------------------------------------------- persistence

const save = () => void (settings.store.persist && set(KEY, held));

export async function load() {
    if (!settings.store.persist) {
        held = blank();
        return;
    }

    const stored = await get<Partial<Stored>>(KEY);
    if (stored) held = { ...blank(), ...stored };
}

/** Called when the persist setting is switched off, so nothing is left behind on disk */
export function forgetSaved() {
    del(KEY);
}

/** The shape the phone writes, for the sync plugin */
export const asRecord = (): Stored => held;

export function replaceAll(next: Partial<Stored>) {
    restoreEverything(false);
    held = { ...blank(), ...next };
    save();
    reapply();
}

// ---------------------------------------------------------------- saying it to the client

function snapshot(id: string): Was {
    let type = NONE;
    let nickname: string | null = null;
    let since: string | null = null;

    try {
        type = (RelationshipStore as any).getRelationshipType?.(id) ?? NONE;
        nickname = (RelationshipStore as any).getNickname?.(id) ?? null;
        since = (RelationshipStore as any).getSince?.(id) ?? null;
    } catch (e) {
        logger.error("Could not read what the relationship was", e);
    }

    return { type, nickname, since };
}

function say(type: number, id: string, since?: string | null, nickname?: string | null) {
    FluxDispatcher.dispatch({
        type: "RELATIONSHIP_ADD",
        relationship: {
            id,
            type,
            nickname: nickname ?? null,
            since: since ?? new Date().toISOString(),
            user: UserStore.getUser(id)
        },
        [OURS]: true
    } as any);
}

function unsay(id: string, type: number) {
    FluxDispatcher.dispatch({
        type: "RELATIONSHIP_REMOVE",
        relationship: { id, type },
        [OURS]: true
    } as any);
}

/** Put the relationship back to whatever it really was */
function putBack(id: string, was?: Was) {
    if (!was || !was.type || was.type === NONE) {
        unsay(id, FRIEND);
        return;
    }

    say(was.type, id, was.since, was.nickname);
}

// ---------------------------------------------------------------- the pretences

/** Show somebody as not added. The friendship itself is untouched. */
export function hideFriend(id: string): boolean {
    if (isHidden(id)) return false;

    held.hiddenWas[id] = snapshot(id);
    held.hidden[id] = nameOf(id);
    save();

    unsay(id, FRIEND);
    return true;
}

export function showFriend(id: string): boolean {
    if (!isHidden(id)) return false;

    const was = held.hiddenWas[id];
    delete held.hidden[id];
    delete held.hiddenWas[id];
    save();

    putBack(id, was);
    return true;
}

/** Everybody on the friends list at once */
export function hideAllFriends(): number {
    let ids: string[] = [];
    try {
        ids = (RelationshipStore as any).getFriendIDs?.() ?? [];
    } catch (e) {
        logger.error("Could not read the friends list", e);
    }

    let n = 0;
    for (const id of ids) {
        if (hideFriend(id)) n++;
    }

    return n;
}

export function showAllFriends(): number {
    const ids = Object.keys(held.hidden);
    for (const id of ids) showFriend(id);
    return ids.length;
}

/** Treat somebody as blocked here, without Discord being told */
export function blockUser(id: string): boolean {
    if (isBlocked(id)) return false;

    held.blockedWas[id] = snapshot(id);
    held.blocked[id] = nameOf(id);
    save();

    // Said as a real block, so the client does everything it does for one: their messages
    // collapse, their calls do not ring, and it all stops when it is lifted again.
    say(BLOCKED, id);
    return true;
}

export function unblockUser(id: string): boolean {
    if (!isBlocked(id)) return false;

    const was = held.blockedWas[id];
    delete held.blocked[id];
    delete held.blockedWas[id];
    save();

    putBack(id, was);
    return true;
}

/** A request this client shows as sent, which was never sent */
export function sendRequest(id: string): boolean {
    if (isPending(id)) return false;

    held.pending[id] = Date.now();
    save();

    say(PENDING_OUTGOING, id);
    return true;
}

/** A request this client shows as received, which nobody sent */
export function receiveRequest(id: string): boolean {
    if (isIncoming(id)) return false;

    held.incoming[id] = nameOf(id);
    save();

    say(PENDING_INCOMING, id);
    return true;
}

/** Take a pretended request away again */
export function clearRequest(id: string): boolean {
    // Read before it is forgotten: which kind it was decides what is taken away.
    const incoming = isIncoming(id);
    if (!incoming && !isPending(id)) return false;

    delete held.pending[id];
    delete held.incoming[id];
    save();

    unsay(id, incoming ? PENDING_INCOMING : PENDING_OUTGOING);
    return true;
}

/**
 * Show somebody as a friend who is not one.
 *
 * What accepting a request nobody sent has to mean. Clearing it and stopping there answers
 * honestly and gives the game away in the same breath.
 */
export function addFakeFriend(id: string): boolean {
    if (isFriended(id)) return false;

    held.friended[id] = nameOf(id);
    save();

    say(FRIEND, id);
    return true;
}

export function removeFakeFriend(id: string): boolean {
    if (!isFriended(id)) return false;

    delete held.friended[id];
    save();

    unsay(id, FRIEND);
    return true;
}

/** Take a real request off this client without answering it */
export function dismissRequest(id: string): boolean {
    if (isDismissed(id)) return false;

    held.dismissed[id] = nameOf(id);
    save();

    unsay(id, PENDING_INCOMING);
    return true;
}

export function restoreRequest(id: string): boolean {
    if (!isDismissed(id)) return false;

    delete held.dismissed[id];
    save();

    // Nothing is said here. The request is real, so Discord hands it back on the next
    // reconnect by itself - and inventing one now would be this client making it up.
    return true;
}

/**
 * Put everything back the way Discord has it.
 *
 * `forget` is what tells a reset from a pause: switching the plugin off should put people
 * back without losing the list, while clearing it should lose the list too.
 */
export function restoreEverything(forget = true) {
    for (const id of Object.keys(held.hidden)) putBack(id, held.hiddenWas[id]);
    for (const id of Object.keys(held.blocked)) putBack(id, held.blockedWas[id]);
    for (const id of Object.keys(held.pending)) unsay(id, PENDING_OUTGOING);
    for (const id of Object.keys(held.incoming)) unsay(id, PENDING_INCOMING);
    for (const id of Object.keys(held.friended)) unsay(id, FRIEND);

    if (!forget) return;

    held = blank();
    save();
}

/**
 * Say all of it again.
 *
 * Discord rebuilds its relationships from the server on every launch and every reconnect,
 * and the server has never heard of any of this - so without this everybody comes back.
 */
export function reapply() {
    for (const id of Object.keys(held.hidden)) unsay(id, FRIEND);
    for (const id of Object.keys(held.blocked)) say(BLOCKED, id);
    for (const id of Object.keys(held.friended)) say(FRIEND, id);
    for (const id of Object.keys(held.pending)) say(PENDING_OUTGOING, id);
    for (const id of Object.keys(held.dismissed)) unsay(id, PENDING_INCOMING);

    // Last: hiding somebody takes them out, and a pretended request puts them back as a
    // request - so for anybody who is both, the request is the one that should survive.
    for (const id of Object.keys(held.incoming)) say(PENDING_INCOMING, id);
}

export const isOurEvent = (action: any) => !!action?.[OURS];
