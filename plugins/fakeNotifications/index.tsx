/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./shared.css";
import "./styles.css";

import { migratePluginSettings } from "@api/Settings";
import definePlugin from "@utils/types";
import { MessageRequestStore, RelationshipStore } from "@webpack/common";

import { BellIcon } from "./icons";
import { settings } from "./settings";
import { About } from "./ui";

export type Which = "friends" | "requests";

/** Off means every badge reads true, whatever has been set */
let active = false;

/**
 * How far a badge is moved, or nothing when it has been left alone.
 *
 * Kept as a difference rather than as the number to show, because a badge that counts is
 * still a badge: set it to a hundred while thirty are really waiting and the next request
 * should make it a hundred and one, not leave it stuck. A difference does that by itself.
 */
export function shiftFor(which: Which): number | null {
    const value = settings.store[which];
    return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** What a badge would say with this plugin out of the way */
export function realCount(which: Which): number {
    try {
        const store: any = which === "friends" ? RelationshipStore : MessageRequestStore;
        const real = which === "friends" ? store.vcRealPendingCount?.() : store.vcRealRequestsCount?.();
        return Number(real) || 0;
    } catch {
        return 0;
    }
}

/**
 * Tell the badges to look again.
 *
 * Changing what a count answers does not make anything ask for it, so a badge would sit on
 * the number it last read until something else happened to redraw it.
 */
export function nudge() {
    for (const store of [RelationshipStore, MessageRequestStore] as any[]) {
        try {
            store?.emitChange?.();
        } catch { /* not on this build */ }
    }
}

/** Say what a badge should read; how far it moved is worked out from what is really there */
export function setShown(which: Which, wanted: number | null) {
    settings.store[which] = wanted === null ? null : wanted - realCount(which);
    nudge();
}

migratePluginSettings("FakeNotifications", "CustomPluginFakeNotifications");

export default definePlugin({
    name: "FakeNotifications",
    description: "Set the numbers on your friend request and message request badges. Nothing is read, answered or sent, and the real requests are all still there.",
    tags: ["Notifications", "Appearance"],
    authors: [{ name: "reqon", id: 497562304498368513n }],

    settings,

    settingsAboutComponent: () => (
        <About
            icon={BellIcon}
            title="Set the numbers on your badges"
            steps={[
                <>Type the number each badge should show. Leave a box empty for the real one.</>,
                <>The badge keeps counting: a new request still adds one to whatever you set.</>
            ]}
        />
    ),

    // Patched inside the functions themselves rather than wrapped from outside. Something
    // that keeps hold of the function and calls it later walks straight past a wrapper - that
    // is how a badge came to show the real number beside a tab showing the invented one - and
    // nothing can walk past code that is part of the function.
    //
    // The original body is kept as a method of its own, so the real count is still there to
    // be asked for and the invented one is that plus however far it was moved.
    patches: [
        {
            find: "getPendingCount(){",
            replacement: {
                match: /getPendingCount\(\)\{/,
                replace: "getPendingCount(){return $self.shown(\"friends\",this.vcRealPendingCount());}vcRealPendingCount(){"
            }
        },
        {
            find: "getMessageRequestsCount(){",
            replacement: {
                match: /getMessageRequestsCount\(\)\{/,
                replace: "getMessageRequestsCount(){return $self.shown(\"requests\",this.vcRealRequestsCount());}vcRealRequestsCount(){"
            }
        }
    ],

    shown(which: Which, real: number) {
        // The patch is part of Discord's code for as long as the window lives, so stopping
        // the plugin cannot take it out. It answers with the truth instead.
        if (!active) return real;

        const shift = shiftFor(which);
        if (shift === null) return real;

        const count = Number(real);
        return Math.max(0, (Number.isFinite(count) ? count : 0) + shift);
    },

    /** Whether Discord loaded with the patches in, which is the only time they can go in */
    patchesLive() {
        return typeof (RelationshipStore as any)?.vcRealPendingCount === "function";
    },

    start() {
        active = true;
        nudge();
    },

    stop() {
        active = false;
        nudge();
    }
});
