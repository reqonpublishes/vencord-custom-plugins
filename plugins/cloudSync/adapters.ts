/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { get, set } from "@api/DataStore";

/**
 * What each plugin keeps, translated to and from the shape the shelf holds.
 *
 * The plugins are not touched directly. Each one stores its state under its own key, and
 * this reads and writes those keys - so a plugin needs to know nothing about syncing, and
 * adding one here is an adapter rather than a change to it.
 *
 * The shelf's shape is the phone's, because the phone's is the plainer of the two: records
 * keyed by id rather than the flat arrays this client unpacks into Maps at startup. Keeping
 * the simpler one in the middle means the translation lives here, once, instead of being
 * half-done on both sides.
 */

/** A hidden span, by its two ends. */
type Range = [from: string, to: string];

interface DesktopHides {
    /** "channelId:messageId" */
    messages: string[];
    ranges: [string, Range[]][];
    channels: [string, string][];
}

export interface Adapter {
    /** the plugin whose data this is, so it can be restarted after a fetch */
    plugin: string;
    /** what it is called on the shelf, shared with the phone */
    shelfKey: string;
    /** for the settings page */
    label: string;
    /** read this client's storage into the shelf's shape, or null when there is nothing */
    read(): Promise<Record<string, any> | null>;
    /**
     * Write the shelf's shape into this client's storage.
     *
     * `held` is whatever is already on the shelf for this plugin, so anything this client
     * has no concept of - words the phone hides everywhere, say - survives the round trip
     * instead of being dropped by the side that cannot show it.
     */
    write(held: Record<string, any>): Promise<void>;
}

const HIDES_KEY = "HideMessages_Hidden";
const EDITS_KEY = "InspectMessages_Edits";
const FAKES_KEY = "FakeMessages_Added";
const DMS_KEY = "HideDMs_Hidden";

/** Group the flat "channel:message" list into the records the shelf holds. */
function groupHidden(flat: string[]): Record<string, string[]> {
    const out: Record<string, string[]> = {};

    for (const key of flat ?? []) {
        const at = key.indexOf(":");
        if (at === -1) continue;

        const channelId = key.slice(0, at);
        (out[channelId] ??= []).push(key.slice(at + 1));
    }

    return out;
}

const hideMessages: Adapter = {
    plugin: "HideMessages",
    shelfKey: "hideMessages",
    label: "Hide Messages",

    async read() {
        const stored = await get<DesktopHides>(HIDES_KEY);
        if (!stored) return null;

        return {
            messages: groupHidden(stored.messages ?? []),
            ranges: Object.fromEntries(stored.ranges ?? []),
            channels: Object.fromEntries(stored.channels ?? [])
        };
    },

    async write(held) {
        const messages: string[] = [];
        for (const [channelId, ids] of Object.entries(held.messages ?? {})) {
            for (const id of (ids as string[]) ?? []) messages.push(channelId + ":" + id);
        }

        await set(HIDES_KEY, {
            messages,
            ranges: Object.entries(held.ranges ?? {}) as [string, Range[]][],
            // The phone keeps a cutoff per channel, which is what this client keeps too.
            channels: Object.entries(held.channels ?? {}).map(([id, cutoff]) => [id, String(cutoff)])
        } satisfies DesktopHides);
    }
};

const inspectMessages: Adapter = {
    plugin: "InspectMessages",
    shelfKey: "inspectMessages",
    label: "Inspect Messages",

    async read() {
        const stored = await get<Map<string, any> | Record<string, any>>(EDITS_KEY);
        if (!stored) return null;

        const edits = stored instanceof Map ? Object.fromEntries(stored) : stored;
        return { edits };
    },

    async write(held) {
        // A Map, because that is what this plugin reads back and what it keeps in memory.
        await set(EDITS_KEY, new Map(Object.entries(held.edits ?? {})));
    }
};

const fakeMessages: Adapter = {
    plugin: "FakeMessages",
    shelfKey: "fakeMessages",
    label: "Fake Messages",

    async read() {
        const stored = await get<[string, any[]][] | Record<string, any[]>>(FAKES_KEY);
        if (!stored) return null;

        return { messages: Array.isArray(stored) ? Object.fromEntries(stored) : stored };
    },

    async write(held) {
        // Stored as pairs, which is what this client reads back into a Map on the way up.
        await set(FAKES_KEY, Object.entries(held.messages ?? {}));
    }
};

const hideDMs: Adapter = {
    plugin: "HideDMs",
    shelfKey: "hideDMs",
    label: "Hide DMs",

    async read() {
        const stored = await get<[string, string][] | Record<string, string>>(DMS_KEY);
        if (!stored) return null;

        return { chats: Array.isArray(stored) ? Object.fromEntries(stored) : stored };
    },

    async write(held) {
        await set(DMS_KEY, Object.entries(held.chats ?? {}));
    }
};

/** The parts of a hidden-friends record this client keeps. The phone keeps more. */
const FRIEND_KEYS = ["hidden", "hiddenWas", "blocked", "blockedWas", "pending", "incoming", "dismissed", "friended"];

const hideFriends: Adapter = {
    plugin: "HideFriends",
    shelfKey: "hideFriends",
    label: "Hide Friends",

    async read() {
        const stored = await get<Record<string, any>>("HideFriends_State");
        if (!stored) return null;

        const out: Record<string, any> = {};
        for (const key of FRIEND_KEYS) out[key] = stored[key] ?? {};
        return out;
    },

    async write(held) {
        const next: Record<string, any> = {};
        for (const key of FRIEND_KEYS) next[key] = held[key] ?? {};
        await set("HideFriends_State", next);
    }
};

const hideServers: Adapter = {
    plugin: "HideServers",
    shelfKey: "hideServers",
    label: "Hide Servers",

    async read() {
        const stored = await get<[string, string][] | Record<string, string>>("HideServers_Hidden");
        if (!stored) return null;

        return { hidden: Array.isArray(stored) ? Object.fromEntries(stored) : stored };
    },

    async write(held) {
        await set("HideServers_Hidden", Object.entries(held.hidden ?? {}));
    }
};

const fakeCalls: Adapter = {
    plugin: "FakeCalls",
    shelfKey: "fakeCalls",
    label: "Fake Calls",

    async read() {
        const stored = await get<[string, any[]][] | Record<string, any[]>>("FakeCalls_Added");
        if (!stored) return null;

        return { calls: Array.isArray(stored) ? Object.fromEntries(stored) : stored };
    },

    async write(held) {
        await set("FakeCalls_Added", Object.entries(held.calls ?? {}));
    }
};

/**
 * The badge numbers, which live in this plugin's settings rather than under a key of its own.
 *
 * What is shared is how far each badge is moved, not the number it shows. The two devices are
 * the same account, so the real count underneath is the same on both and the same distance
 * lands on the same number - and a request that really arrives moves both.
 */
const fakeNotifications: Adapter = {
    plugin: "FakeNotifications",
    shelfKey: "fakeNotifications",
    label: "Fake Notifications",

    async read() {
        const held: any = (window as any).Vencord?.Settings?.plugins?.FakeNotifications;
        if (!held) return null;

        return {
            friends: typeof held.friends === "number" ? held.friends : null,
            requests: typeof held.requests === "number" ? held.requests : null
        };
    },

    async write(held) {
        const mine: any = (window as any).Vencord?.Settings?.plugins?.FakeNotifications;
        if (!mine) return;

        mine.friends = typeof held.friends === "number" ? held.friends : null;
        mine.requests = typeof held.requests === "number" ? held.requests : null;
    }
};

export const ADAPTERS: Adapter[] = [
    hideMessages, inspectMessages, fakeMessages, hideDMs, hideFriends, hideServers, fakeCalls, fakeNotifications
];

/**
 * Lay what this client has over what the shelf holds, for one plugin.
 *
 * Replacing outright would mean a message unhidden here coming back on the next fetch, and
 * merging everything would mean it never going away - so the collections this client owns
 * are replaced, and each surviving entry keeps any field it does not understand. The phone
 * records who wrote a rewritten message; this client has no use for that and must still not
 * be the reason it is lost.
 */
export function overlay(held: Record<string, any>, ours: Record<string, any>): Record<string, any> {
    const out: Record<string, any> = { ...held };

    for (const [name, value] of Object.entries(ours)) {
        const before = held?.[name];

        if (!value || typeof value !== "object" || Array.isArray(value) || !before || typeof before !== "object") {
            out[name] = value;
            continue;
        }

        const merged: Record<string, any> = {};
        for (const [id, entry] of Object.entries(value)) {
            const was = (before as Record<string, any>)[id];

            merged[id] = (entry && typeof entry === "object" && !Array.isArray(entry)
                && was && typeof was === "object" && !Array.isArray(was))
                ? { ...was, ...entry }
                : entry;
        }

        out[name] = merged;
    }

    return out;
}
