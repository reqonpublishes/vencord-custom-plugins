/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Logger } from "@utils/Logger";
import { findStore } from "@webpack";
import { FluxDispatcher } from "@webpack/common";

import { changes, isBlocked, isHidden } from "./store";

const logger = new Logger("HideFriends");

/**
 * The real store, looked up when needed rather than held through a lazy stand-in. Answers
 * are replaced by putting our own on the store, and a stand-in keeps what is put on it for
 * itself - Discord, asking the real one, would never see them.
 */
let found: any = null;
function profileStore(): any {
    if (found) return found;

    try {
        found = findStore("UserProfileStore");
    } catch { /* not built yet */ }

    return found;
}

/** Each list Discord holds -> the same list with the hidden people taken out, and when that was worked out */
const filtered = new WeakMap<object, { at: number; list: any[]; }>();

let patched = false;

const idOf = (entry: any): string | undefined => entry?.user?.id ?? entry?.id ?? entry?.key;

/**
 * A list of mutual friends without anybody this client is showing as not a friend.
 *
 * The same list is handed back for as long as nothing has changed. Discord compares what it
 * is given with what it had, and a fresh list on every ask reads as a change every time.
 */
function without(list: any) {
    if (!Array.isArray(list) || !list.length) return list;

    const at = changes();
    const held = filtered.get(list);
    if (held?.at === at) return held.list;

    const kept = list.filter(entry => {
        const id = idOf(entry);
        return !id || !(isHidden(id) || isBlocked(id));
    });

    // Nobody taken out: hand back the very list Discord made, so nothing sees a difference.
    const out = kept.length === list.length ? list : kept;
    filtered.set(list, { at, list: out });
    return out;
}

/**
 * Keep hidden friends out of other people's Mutual Friends.
 *
 * Somebody shown as not added is gone from your friends list, and would still be sitting in
 * the Mutual Friends tab of everyone you both know - which says they are a friend as plainly
 * as the list did. The profile's answers are replaced on the store itself rather than
 * wrapped: whatever asks, and however it calls, gets the list with them left out.
 *
 * The number on the tab comes from the server before the list does. It is right once the
 * list has been loaded, which is when the tab is opened; until then it is the server's.
 */
export function startMutuals() {
    if (patched) return;

    const store = profileStore();
    if (!store) return;

    if (typeof store?.getMutualFriends !== "function") return;

    try {
        const proto = Object.getPrototypeOf(store);

        store.getMutualFriends = function (this: any, ...args: any[]) {
            return without(proto.getMutualFriends.apply(this, args));
        };

        store.getMutualFriendsCount = function (this: any, ...args: any[]) {
            const list = proto.getMutualFriends.apply(this, args);
            if (Array.isArray(list)) return without(list).length;

            return proto.getMutualFriendsCount.apply(this, args);
        };

        patched = true;
    } catch (e) {
        logger.error("Could not take hidden friends out of Mutual Friends", e);
    }
}

export function stopMutuals() {
    if (!patched) return;

    // Taking ours off leaves the store's own answers showing through again.
    delete profileStore().getMutualFriends;
    delete profileStore().getMutualFriendsCount;
    patched = false;

    redrawMutuals();
}

/** Tell any profile that is open to ask again */
export function redrawMutuals() {
    try {
        profileStore()?.emitChange?.();
    } catch { /* nothing open to redraw */ }
}

/**
 * Discord does not build its profile store until a profile is first needed, which can be
 * well after this plugin starts. So it is tried at start, and tried again as each profile is
 * asked for until it takes - by which point the store is certainly there, and the answer to
 * that very profile is already the filtered one.
 */
const tryAgain = () => startMutuals();

export function watchMutuals() {
    startMutuals();
    FluxDispatcher.subscribe("USER_PROFILE_FETCH_START", tryAgain);
    FluxDispatcher.subscribe("USER_PROFILE_MODAL_OPEN", tryAgain);
}

export function unwatchMutuals() {
    FluxDispatcher.unsubscribe("USER_PROFILE_FETCH_START", tryAgain);
    FluxDispatcher.unsubscribe("USER_PROFILE_MODAL_OPEN", tryAgain);
    stopMutuals();
}
