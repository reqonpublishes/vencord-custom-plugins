/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { findStore } from "@webpack";
import { FluxDispatcher } from "@webpack/common";

import { changes, isHidden } from "./store";

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

/** Each list Discord holds -> the same list with the hidden servers taken out, and when that was worked out */
const filtered = new WeakMap<object, { at: number; list: any[]; }>();

let patched = false;

const idOf = (entry: any): string | undefined => entry?.guild?.id ?? entry?.id ?? entry?.guildId;

/**
 * A list of mutual servers without the hidden ones.
 *
 * The same list is handed back for as long as nothing has changed. Discord compares what it
 * is given with what it had, and a fresh list on every ask reads as a change every time.
 */
function without(list: any) {
    if (!Array.isArray(list) || !list.length) return list;

    const at = changes();
    const held = filtered.get(list);
    if (held?.at === at) return held.list;

    const kept = list.filter(entry => !isHidden(idOf(entry)));
    const out = kept.length === list.length ? list : kept;

    filtered.set(list, { at, list: out });
    return out;
}

/**
 * Keep hidden servers out of other people's Mutual Servers.
 *
 * A server taken off the bar would still be listed on the profile of everyone else in it.
 * The profile's answer is replaced on the store itself rather than wrapped, so whatever asks
 * gets the list with the hidden ones left out.
 */
export function startMutuals() {
    if (patched) return;

    const store = profileStore();
    if (!store) return;

    if (typeof store?.getMutualGuilds !== "function") return;

    const proto = Object.getPrototypeOf(store);
    store.getMutualGuilds = function (this: any, ...args: any[]) {
        return without(proto.getMutualGuilds.apply(this, args));
    };

    patched = true;
}

export function stopMutuals() {
    if (!patched) return;

    delete profileStore().getMutualGuilds;
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
