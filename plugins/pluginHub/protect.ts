/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Settings } from "@api/Settings";
import { Logger } from "@utils/Logger";
import { findStoreLazy } from "@webpack";

import { force, isOn, isView, usable } from "./hub";

const logger = new Logger("PluginHub");

const ApplicationStreamingStore: any = findStoreLazy("ApplicationStreamingStore");
const StreamerModeStore: any = findStoreLazy("StreamerModeStore");

/** The plugins this switched on for a share, so only those are switched back off after it */
let raised: string[] | null = null;

const listeners = new Set<() => void>();

/** Told whenever protection starts or stops, so the settings page can say so */
export function onProtectionChange(listener: () => void) {
    listeners.add(listener);
    return () => void listeners.delete(listener);
}

/** Whether everything is being held on right now because the screen is being shown */
export const isProtecting = () => raised !== null;

/**
 * Whether somebody else can see this screen.
 *
 * Two things say so. Sharing your screen or a window through Discord is one. The other is
 * Streamer Mode, which Discord switches on by itself when it sees OBS or another recorder
 * running - so recording outside Discord is caught the same way Discord catches it.
 */
function beingWatched(): boolean {
    try {
        if (ApplicationStreamingStore.getCurrentUserActiveStream?.()) return true;
    } catch { /* not on this build: the other check still stands */ }

    try {
        if (Settings.plugins.PluginHub?.streamerMode !== false && StreamerModeStore.enabled) return true;
    } catch { /* same */ }

    return false;
}

/**
 * Hold every plugin on while the screen is shown, and let go when it stops.
 *
 * The plugins you had switched off are the ones that matter: off means the real friends list
 * and the real messages are on screen, which is exactly what should not be on a stream. They
 * are started for the length of the share and stopped again after it, and which ones you had
 * off is not rewritten - so ending the share, or Discord restarting in the middle of one,
 * leaves everything as you set it.
 *
 * Nothing is shown when it happens. A notice saying what was just hidden would be on the
 * stream too.
 */
export function check() {
    const want = Settings.plugins.PluginHub?.shareProtection !== false && beingWatched();
    if (want === isProtecting()) return;

    // Decided here, done a moment later. This is called from inside Discord telling its
    // stores about the share, and switching plugins is more telling of the same kind - which
    // cannot be started from in there, and is a lot to do in one go at the moment a stream
    // is trying to start.
    if (want) {
        raised = usable().filter(entry => isView(entry) && !isOn(entry.plugin)).map(entry => entry.plugin);
        spread(raised, true);
    } else {
        const mine = raised ?? [];
        raised = null;

        // Only the ones still meant to be off. Anything switched on by hand during the
        // share was a decision, and is left alone.
        const off: string[] = Settings.plugins.PluginHub?.off ?? [];
        spread(mine.filter(name => off.includes(name)), false);
    }

    mark();
    for (const listener of listeners) listener();
}

/** Which run of switching is the current one, so a share that ends at once cancels its own start */
let turn = 0;

/** The order they are switched in: what gives most away goes first */
const FIRST = ["HideDMs", "HideFriends", "HideServers", "FakeNotifications", "HideMessages"];

/**
 * Switch plugins one at a time, giving the window a turn between each.
 *
 * All at once is everything each of them does on starting, back to back, with nothing able
 * to draw until the last has finished. One at a time is the same work and the window stays
 * alive through it. A share takes far longer than this to reach anybody's screen.
 */
function spread(names: string[], on: boolean) {
    const mine = ++turn;
    const queue = [...names].sort((a, b) => (FIRST.indexOf(a) + 1 || 99) - (FIRST.indexOf(b) + 1 || 99));

    const next = () => {
        if (mine !== turn) return;

        const name = queue.shift();
        if (!name) {
            for (const listener of listeners) listener();
            return;
        }

        try {
            force(name, on);
        } catch (e) {
            logger.error("Screen share protection could not switch " + name, e);
        }

        setTimeout(next, 0);
    };

    setTimeout(next, 0);
}

/**
 * Say on the window whether the screen is shared, for the other plugins to read.
 *
 * They keep their menu entries and hover buttons out of sight while it is, unless Shift is
 * held. Left on the window rather than asked of this plugin so that none of them depends on
 * this one being installed.
 */
function mark() {
    (window as any).vcScreenShared = isProtecting();
}

export function startProtection() {
    try {
        ApplicationStreamingStore.addChangeListener(check);
        StreamerModeStore.addChangeListener(check);
    } catch (e) {
        logger.error("Could not watch for screen sharing", e);
    }

    check();
}

export function stopProtection() {
    try {
        ApplicationStreamingStore.removeChangeListener(check);
        StreamerModeStore.removeChangeListener(check);
    } catch { /* never attached */ }

    // let go of whatever is being held, as if the share had ended
    if (raised) {
        const mine = raised;
        raised = null;

        const off: string[] = Settings.plugins.PluginHub?.off ?? [];
        for (const name of mine) if (off.includes(name)) force(name, false);
    }

    mark();
}
