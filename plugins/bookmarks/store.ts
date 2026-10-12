/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { get, set } from "@api/DataStore";
import { IconUtils, UserStore } from "@webpack/common";

const KEY = "Bookmarks_People";

export interface Bookmark {
    id: string;
    /** as they were when bookmarked, for when Discord no longer has them loaded */
    username: string;
    name: string;
    avatar: string | null;
    addedAt: number;
}

let held: Bookmark[] = [];
let loaded = false;

const listeners = new Set<() => void>();

/** Told whenever the list changes, so the page showing it can draw again */
export function onChange(listener: () => void) {
    listeners.add(listener);
    return () => void listeners.delete(listener);
}

function changed() {
    set(KEY, held);
    for (const listener of listeners) listener();
}

export async function load() {
    if (loaded) return;
    loaded = true;

    const stored = await get<Bookmark[]>(KEY);
    if (Array.isArray(stored)) held = stored;

    for (const listener of listeners) listener();
}

export const all = () => held;
export const count = () => held.length;
export const isBookmarked = (id?: string | null) => !!id && held.some(one => one.id === id);

/**
 * Remember somebody, along with enough to show them by.
 *
 * Closing a conversation is the point of bookmarking it, and once it is closed Discord may
 * stop keeping that person in memory. Their name and picture are written down here so the
 * list still reads as people rather than as numbers.
 */
export function add(user: any) {
    if (!user?.id || isBookmarked(user.id)) return;

    held = [...held, {
        id: user.id,
        username: user.username ?? "unknown",
        name: user.globalName ?? user.username ?? "Unknown user",
        avatar: user.avatar ?? null,
        addedAt: Date.now()
    }];
    changed();
}

export function remove(id: string) {
    if (!isBookmarked(id)) return;

    held = held.filter(one => one.id !== id);
    changed();
}

/**
 * Somebody on the list as they are now, falling back to how they were when bookmarked.
 *
 * What was written down is brought up to date whenever Discord does have them, so a changed
 * name or picture does not stay stale for ever.
 */
export function describe(bookmark: Bookmark): { name: string; username: string; image: string; } {
    const user: any = UserStore.getUser(bookmark.id);

    if (user) {
        return {
            name: user.globalName ?? user.username,
            username: user.username,
            image: user.getAvatarURL?.(undefined, 80) ?? ""
        };
    }

    let image = "";
    try {
        image = IconUtils.getUserAvatarURL({ id: bookmark.id, avatar: bookmark.avatar } as any, false, 80) ?? "";
    } catch { /* drawn with no picture, which is still a row */ }

    return { name: bookmark.name, username: bookmark.username, image };
}
