/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { get, set } from "@api/DataStore";

/**
 * What was on a list the last time the plugin could see it.
 *
 * Kept up to date for as long as the plugin is on, and left alone while it is off. So when it
 * comes back on, whatever is on the list now and was not then turned up while it was off -
 * and that is what "hide new ones" puts away, leaving the list as it was left. Screen Share
 * Protection asks for the same while a share lasts, and gets it back afterwards.
 *
 * `current` gives the list as it stands, or null while Discord has not loaded it yet: taking
 * down an empty list before it has loaded would make everything look new afterwards.
 */
export function knownList(key: string, current: () => string[] | null) {
    let known: Set<string> | null = null;
    let loaded = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    // Whether the plugin has looked at the list since it came on. Only then is the list worth
    // taking down: a plugin switched on and straight off again while Discord loads - which
    // is how one left off in Additional Settings starts - never saw anything, and taking the
    // list down then would count what is new as seen.
    let seen = false;

    // Hidden only because the screen was being shared, not because you asked for new ones to
    // be. Handed back when the plugin goes off, so a share leaves the lists as it found them.
    let lent: string[] = [];

    /** Read what was taken down last time. Only once: after that, memory is the copy */
    async function load() {
        if (loaded) return;
        loaded = true;

        const stored = await get<string[]>(key);
        if (Array.isArray(stored) && !known) known = new Set(stored);
    }

    function cancel() {
        if (timer) clearTimeout(timer);
        timer = null;
    }

    /** Take the list down as it is now */
    function remember() {
        cancel();

        const now = current();
        if (!now) return;

        known = new Set(now);
        set(key, [...known]);
    }

    /** The same, once a run of changes has settled, so a burst of them is one write */
    function rememberSoon() {
        if (!seen) return;
        cancel();
        timer = setTimeout(remember, 1500);
    }

    /** On the list now and not when it was last taken down. Nothing, when it never was */
    function fresh(): string[] {
        const now = current();
        if (!now || !known) return [];

        const before = known;
        return now.filter(id => !before.has(id));
    }

    /**
     * The plugin is on and the list is loaded: put away what is new, if asked to, and take
     * the list down. Does nothing while Discord has not loaded the list yet.
     */
    function catchUp(hideNew: boolean, hide: (ids: string[]) => string[]) {
        if (!current()) return;

        // Screen Share Protection says so on the window, so this works without it installed
        const sharing = !!(window as any).vcShareHideNew;

        if (hideNew || sharing) {
            const done = hide(fresh());
            if (!hideNew) lent.push(...done);
        }

        remember();
        seen = true;
    }

    /** The plugin is going off: the list as it was last seen is what new is measured against */
    function leave() {
        if (seen) remember();
        else cancel();

        seen = false;
    }

    /**
     * After the plugin has put everything back on screen: take what a share hid off the
     * hidden list, without a word to Discord - it is already showing again.
     */
    function giveBack(forget: (ids: string[]) => void) {
        if (!lent.length) return;

        forget(lent);
        lent = [];
    }

    return { load, rememberSoon, cancel, catchUp, leave, giveBack };
}
