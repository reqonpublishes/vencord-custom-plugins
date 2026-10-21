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
export function knownList(key: string, current: () => string[] | null, stillHidden: (id: string) => boolean) {
    let known: Set<string> | null = null;
    let loading: Promise<void> | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;

    // Whether the plugin has looked at the list since it came on. Only then is the list worth
    // taking down: a plugin switched on and straight off again while Discord loads - which
    // is how one left off in Additional Settings starts - never saw anything, and taking the
    // list down then would count what is new as seen.
    let seen = false;

    // Hidden only because the screen was being shared, not because you asked for new ones to
    // be. Handed back when the plugin goes off, so a share leaves the lists as it found them.
    let lent: string[] = [];

    /**
     * Read what was taken down last time. Only once: after that, memory is the copy. A start
     * that comes while the read is still going waits for the same one, rather than finding
     * nothing taken down and counting everything as new.
     */
    function load() {
        loading ??= (async () => {
            const stored = await get<string[]>(key);
            if (Array.isArray(stored) && !known) known = new Set(stored);
        })();

        return loading;
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

        // Not what a share hid: those were never seen with the screen to yourself, so they
        // stay new - hidden again if the plugin restarts mid-share, and still new after it.
        // Unless you have since shown one yourself - opened that DM, unhid that friend - which
        // is seeing it, and the share has no more business hiding it again.
        lent = lent.filter(stillHidden);
        const borrowed = new Set(lent);
        known = new Set(now.filter(id => !borrowed.has(id)));
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

    /**
     * Something on the list changed while the plugin is on.
     *
     * Normally that is only something to take down. While the screen is being shared it may be
     * somebody new turning up live - a message from somebody whose DM was closed, a friend
     * request, a server invite accepted - and the share should not show them any more than it
     * shows what turned up before it began. So it is hidden for the rest of the share, and
     * given back after with everything else the share hid.
     */
    function arrived(hide: (ids: string[]) => string[]) {
        if (!seen) return;

        if (!(window as any).vcShareHideNew) {
            rememberSoon();
            return;
        }

        const now = fresh();
        if (!now.length) return;

        lent.push(...hide(now));
        remember();
    }

    /**
     * The share is over and the plugin is staying on: show again what only the share hid.
     *
     * A plugin the share switched on hands these back as it stops. One that was on already
     * keeps running, so it is told instead - or they would stay hidden for good.
     */
    function shareEnded(show: (ids: string[]) => void) {
        const ids = lent.filter(stillHidden);
        lent = [];
        if (!ids.length) return;

        show(ids);
        remember();
    }

    return { load, rememberSoon, cancel, catchUp, leave, giveBack, arrived, shareEnded };
}
