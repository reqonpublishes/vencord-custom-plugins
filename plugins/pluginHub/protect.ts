/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Settings } from "@api/Settings";
import { Logger } from "@utils/Logger";
import { findStoreLazy } from "@webpack";

import { force, isOn, isView, setOn, usable } from "./hub";
import { lookingPlain, lookNormal, lookPlain } from "./plain";

const logger = new Logger("PluginHub");

const ApplicationStreamingStore: any = findStoreLazy("ApplicationStreamingStore");
const StreamerModeStore: any = findStoreLazy("StreamerModeStore");

/** The protection settings, read fresh each time */
const opt = (): any => Settings.plugins.PluginHub ?? {};

/** The plugins this switched on for a share, so only those are switched back off after it */
let raised: string[] | null = null;

/** The plugins left alone during the share running now, as they were when last looked at */
let skipped: string[] = [];

/**
 * Whether Plugin Hub is running and so watching for shares.
 *
 * The settings below are told of changes whether or not it is, and a share must not be
 * taken hold of by a plugin that is switched off.
 */
let watching = false;

const listeners = new Set<() => void>();

/** Told whenever protection starts or stops, so the settings page can say so */
export function onProtectionChange(listener: () => void) {
    listeners.add(listener);
    return () => void listeners.delete(listener);
}

/** Whether everything is being held on right now because the screen is being shown */
export const isProtecting = () => raised !== null;

/** What was switched on for the share running now, and nothing when there is none */
export const raisedForShare = (): string[] => raised ?? [];

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
        if (opt().streamerMode !== false && StreamerModeStore.enabled) return true;
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
    if (!watching) return;

    const want = opt().shareProtection !== false && beingWatched();
    if (want === isProtecting()) return;

    // Decided here, done a moment later. This is called from inside Discord telling its
    // stores about the share, and switching plugins is more telling of the same kind - which
    // cannot be started from in there, and is a lot to do in one go at the moment a stream
    // is trying to start.
    if (want) {
        // The ones that are off. Nothing is written down about these being switched: what
        // you chose stays exactly as you left it.
        const skip: string[] = opt().shareSkip ?? [];
        skipped = [...skip];
        raised = usable().filter(entry => isView(entry) && !isOn(entry.plugin) && !skip.includes(entry.plugin)).map(entry => entry.plugin);

        // Read by the hide plugins as they start: anything new since they were last on is
        // hidden for the length of the share too, and handed back after it.
        (window as any).vcShareHideNew = opt().shareHideNew !== false;

        spread(raised, true);
        if (opt().sharePlain) setTimeout(() => isProtecting() && lookPlain(), 0);
    } else {
        const mine = raised ?? [];
        raised = null;
        shareOver();
        lookNormal();

        // Only the ones still meant to be off. Anything switched on by hand during the
        // share was a decision, and is left alone.
        const off: string[] = opt().off ?? [];
        const still = mine.filter(name => off.includes(name));

        release(still);
    }

    mark();
    for (const listener of listeners) listener();
}

/**
 * Let go of what was held on for a share that is over.
 *
 * Asked to leave them on: then they are on, as if switched on by hand, and anything still
 * waiting to be started is started now rather than by a queue that has been called off.
 */
function release(names: string[], now = false) {
    if (opt().shareRestore === false) {
        cancel();
        for (const name of names) setOn(name, true);
    } else if (now) {
        cancel();
        for (const name of names) force(name, false);
    } else {
        spread(names, false);
    }
}

/** Which run of switching is the current one, so a share that ends at once cancels its own start */
let turn = 0;

/** What the current run has still to switch, so more can join it rather than replace it */
let waiting: string[] = [];

/** Call off whatever run is part way through */
function cancel() {
    turn++;
    waiting = [];
}

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
    waiting = [...names].sort((a, b) => (FIRST.indexOf(a) + 1 || 99) - (FIRST.indexOf(b) + 1 || 99));

    const next = () => {
        if (mine !== turn) return;

        const name = waiting.shift();
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
 * The share is over: stop asking for new things to be hidden, and tell the hide plugins that
 * stay on to show what the share hid. The ones that go off hand it back as they stop.
 */
function shareOver() {
    (window as any).vcShareHideNew = false;

    try {
        window.dispatchEvent(new CustomEvent("vc-share-ended"));
    } catch { /* they hand it back when they next stop */ }
}

/** Whether this page is taken out of the settings sidebar right now */
export const pageHidden = () => isProtecting() && (opt().shareHidePage === true || opt().sharePlain === true);

/** A protection setting changed: say again what is hidden, for a share already running */
export function refresh() {
    if (!watching) return;

    check();

    if (isProtecting()) {
        // Read by the hide plugins as they start, so this reaches the ones started from here
        // on. What the running ones already hid stays hidden until the share ends.
        (window as any).vcShareHideNew = opt().shareHideNew !== false;
        widen();

        // switched during a share: takes effect at once
        if (opt().sharePlain && !lookingPlain()) lookPlain();
        if (!opt().sharePlain && lookingPlain()) lookNormal();
    }

    mark();
    for (const listener of listeners) listener();
}

/**
 * A plugin taken off the skip list in the middle of a share is switched on for the rest of it.
 *
 * Only the ones just taken off, and only if they are off - so one you switched off by hand
 * during the share is not overruled by an unrelated change. One just put on the skip list is
 * left as it is until the share ends, which is when it would have been let go anyway.
 */
function widen() {
    const skip: string[] = opt().shareSkip ?? [];
    const freed = skipped.filter(name => !skip.includes(name));
    skipped = [...skip];

    const held = raised;
    if (!held || !freed.length) return;

    const more = usable()
        .filter(entry => isView(entry) && freed.includes(entry.plugin) && !isOn(entry.plugin) && !held.includes(entry.plugin))
        .map(entry => entry.plugin);
    if (!more.length) return;

    held.push(...more);

    // Joined onto whatever the share's start has still to do, rather than calling it off.
    spread([...waiting, ...more], true);
}

/**
 * Say on the window whether the screen is shared, for the other plugins to read.
 *
 * They keep their menu entries and hover buttons out of sight while it is, unless Ctrl is
 * held. Left on the window rather than asked of this plugin so that none of them depends on
 * this one being installed.
 */
function mark() {
    const shared = isProtecting() && opt().shareHideMenus !== false;
    if ((window as any).vcScreenShared === shared) return;

    (window as any).vcScreenShared = shared;

    // Told as well as left to be read: a plugin with something on screen has to take it
    // down now, not the next time it happens to look.
    try {
        window.dispatchEvent(new CustomEvent("vc-screen-shared", { detail: shared }));
    } catch { /* the flag is still there to be read */ }
}

export function startProtection() {
    watching = true;

    try {
        ApplicationStreamingStore.addChangeListener(check);
        StreamerModeStore.addChangeListener(check);
    } catch (e) {
        logger.error("Could not watch for screen sharing", e);
    }

    check();
}

export function stopProtection() {
    watching = false;

    try {
        ApplicationStreamingStore.removeChangeListener(check);
        StreamerModeStore.removeChangeListener(check);
    } catch { /* never attached */ }

    // Whatever a share's start has still to switch on is called off, so nothing is started
    // after this plugin has gone.
    cancel();
    lookNormal();

    // let go of whatever is being held, as if the share had ended - at once, since nothing of
    // this plugin's is left running to finish it later
    if (raised) {
        const mine = raised;
        raised = null;

        shareOver();

        const off: string[] = opt().off ?? [];
        release(mine.filter(name => off.includes(name)), true);
    }

    mark();
    for (const listener of listeners) listener();
}
