/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { getUserSetting } from "@api/UserSettings";
import { Logger } from "@utils/Logger";
import { findStore } from "@webpack";
import { showToast, UserStore } from "@webpack/common";

import { changes, CustomStatus, lookFor, NOTHING } from "./store";

const logger = new Logger("InspectProfiles");

/**
 * Status, custom status, what someone is doing, their recent activity and their board - the parts
 * of a profile that live outside the profile itself.
 *
 * The online status and activities come from the presence store, the board from the profile
 * store's widgets, and your own custom status from your account settings (measured: the bubble
 * on your own profile reads the setting, not your presence). Each is answered here for anybody
 * who has been changed, and left exactly as Discord has it for everybody else.
 */

let Presence: any = null;
let Profiles: any = null;
/** Recent activity on a profile: the games somebody played lately, with their streaks */
let Outbox: any = null;
let real: Record<string, any> = {};
let running = false;

export const realActivities = (id: string): any[] => (real.getActivities ?? Presence?.getActivities)?.call(Presence, id) ?? [];
export const realStatus = (id: string): string => (real.getStatus ?? Presence?.getStatus)?.call(Presence, id) ?? "offline";
export const realWidgets = (id: string): any[] | undefined => (real.getWidgets ?? Profiles?.getWidgets)?.call(Profiles, id);
export const realOutbox = (id: string): any => {
    const store = Outbox ?? findStore("ContentInventoryOutboxStore");
    return (real.getUserOutbox ?? store?.getUserOutbox)?.call(store, id);
};

const emojiOf = (emoji: CustomStatus["emoji"]) =>
    !emoji ? undefined : typeof emoji === "string" ? { name: emoji } : emoji;

/** A custom status as a presence carries it */
function customActivity(status: CustomStatus) {
    return {
        type: 4,
        name: "Custom Status",
        id: "custom",
        state: status.text || undefined,
        emoji: emojiOf(status.emoji),
        created_at: String(Date.now()),
    };
}

/**
 * One list per person, kept until either their real activities or the look change.
 *
 * Activities are read on every redraw of anything showing a person; a fresh array each time is
 * a new identity each time, and everything comparing old to new would redraw forever.
 */
const lists = new Map<string, { from: any; version: number; until: number; list: any[]; }>();

/**
 * A copied song, still playing.
 *
 * An activity carries when it started and when it ends, so a song copied a few minutes ago
 * sits at its last second, finished. Once its end has passed it starts again, as many times
 * as it takes to be playing now - in step with where the original would be. Anything without
 * an end, like the time spent in a game, is left to count up as it does.
 */
function replay(activity: any, now: number): { activity: any; until: number; } {
    const start = Number(activity?.timestamps?.start);
    const end = Number(activity?.timestamps?.end);
    if (!start || !end || end <= start) return { activity, until: Infinity };
    if (now < end) return { activity, until: end };

    const length = end - start;
    const from = now - ((now - start) % length);
    return { activity: { ...activity, timestamps: { ...activity.timestamps, start: from, end: from + length } }, until: from + length };
}

function activitiesFor(id: string, actual: any[]): any[] {
    if (!running) return actual;
    const look = lookFor(id);
    if (!look || (look.customStatus === undefined && look.activities === undefined)) return actual;

    const now = Date.now();
    const held = lists.get(id);
    if (held && held.from === actual && held.version === changes() && now < held.until) return held.list;

    const realCustom = (actual ?? []).filter(a => a?.type === 4);
    const realOther = (actual ?? []).filter(a => a?.type !== 4);
    const custom = look.customStatus === undefined ? realCustom
        : look.customStatus === NOTHING ? [] : [customActivity(look.customStatus)];

    let until = Infinity;
    const other = look.activities === undefined ? realOther : look.activities.map(a => {
        const playing = replay(a, now);
        until = Math.min(until, playing.until);
        return playing.activity;
    });

    const list = [...custom, ...other];
    lists.set(id, { from: actual, version: changes(), until, list });
    return list;
}

/**
 * The Recent activity entry Discord shows beside a game being played - where "Trending" and
 * streaks come from. Matched the way Discord matches it: the same game, by its app or its name.
 */
function matchingEntry(id: string, activity: any) {
    if (activity?.type !== 0) return undefined;
    const entries: any[] = outboxFor(id, real.getUserOutbox?.call(Outbox, id))?.entries ?? [];
    return entries.find(entry => {
        const extra = entry?.extra;
        if (!extra) return false;
        if (activity.application_id != null && activity.application_id === extra.application_id) return true;
        return activity.name === (extra.game_name ?? extra.activity_name);
    });
}

/** Recent activity, kept per person for the same reason as the activities */
const outboxes = new Map<string, { from: any; version: number; box: any; }>();

function outboxFor(id: string, actual: any) {
    if (!running) return actual;
    const entries = lookFor(id)?.recentActivity;
    if (entries === undefined) return actual;

    const held = outboxes.get(id);
    if (held && held.from === actual && held.version === changes()) return held.box;

    // Each entry names who played. They were somebody else's, so they are made out to whoever wears them.
    const box = {
        ...(actual ?? {}),
        lastFetched: actual?.lastFetched ?? Date.now(),
        entries: entries.map(entry => ({
            ...entry,
            author_id: id,
            participants: (entry.participants ?? []).map((who: string) => who === entry.author_id ? id : who)
        }))
    };
    outboxes.set(id, { from: actual, version: changes(), box });
    return box;
}

function statusFor(id: string, actual: string) {
    if (!running) return actual;
    const status = lookFor(id)?.status;
    if (!status) return actual;
    return status === "invisible" ? "offline" : status;
}

// ---------------------------------------------------------------- your own custom status

let setting: any = null;
let realSetting: Record<string, any> = {};

/** Your custom status as your settings would hold it, when you are wearing one */
function mySetting(): { active: boolean; value?: any; } {
    const me = UserStore.getCurrentUser()?.id;
    const status = me ? lookFor(me)?.customStatus : undefined;
    if (!running || status === undefined) return { active: false };
    if (status === NOTHING) return { active: true, value: undefined };

    const emoji = emojiOf(status.emoji) as any;
    return {
        active: true,
        value: { text: status.text ?? "", emojiId: emoji?.id ?? "0", emojiName: emoji?.name ?? "", expiresAtMs: "0" },
    };
}

function patchSetting() {
    try {
        setting = getUserSetting("status", "customStatus");
    } catch (e) {
        logger.error("Could not reach the custom status setting", e);
        return;
    }
    if (!setting) return;

    realSetting = { getSetting: setting.getSetting, useSetting: setting.useSetting, updateSetting: setting.updateSetting };

    setting.getSetting = function (...args: any[]) {
        const mine = mySetting();
        return mine.active ? mine.value : realSetting.getSetting.apply(this, args);
    };

    // The real hook is always called, so the number of hooks never changes between renders -
    // only what is handed back does.
    setting.useSetting = function (...args: any[]) {
        const actual = realSetting.useSetting.apply(this, args);
        const mine = mySetting();
        return mine.active ? mine.value : actual;
    };

    // Discord's own Set Custom Status box shows whatever the setting says - the fake one, while
    // you are wearing it. Saving that box unchanged would make the fake real, so that one save
    // is refused. Anything you actually type there goes through as normal.
    setting.updateSetting = function (next: any, ...rest: any[]) {
        const mine = mySetting();
        const same = mine.active && mine.value && next && (next.text ?? "") === mine.value.text && (next.emojiName ?? "") === mine.value.emojiName;
        if (same) {
            showToast({ text: "That is your fake status, so it was not set for real. Change it to set a real one", variant: "default" });
            return Promise.resolve();
        }
        return realSetting.updateSetting.call(this, next, ...rest);
    };
}

function unpatchSetting() {
    if (setting) Object.assign(setting, realSetting);
    setting = null;
}

// ---------------------------------------------------------------- on and off

export function startPresence() {
    if (running) return;

    Presence = findStore("PresenceStore");
    Profiles = findStore("UserProfileStore");
    Outbox = findStore("ContentInventoryOutboxStore");

    real = {
        getStatus: Presence?.getStatus,
        getActivities: Presence?.getActivities,
        getUnfilteredActivities: Presence?.getUnfilteredActivities,
        getPrimaryActivity: Presence?.getPrimaryActivity,
        getWidgets: Profiles?.getWidgets,
        getUserOutbox: Outbox?.getUserOutbox,
        isFetchingUserOutbox: Outbox?.isFetchingUserOutbox,
        getMatchingOutboxEntry: Outbox?.getMatchingOutboxEntry,
    };

    if (Presence) {
        Presence.getStatus = function (id: string, ...rest: any[]) { return statusFor(id, real.getStatus.call(this, id, ...rest)); };
        Presence.getActivities = function (id: string, ...rest: any[]) { return activitiesFor(id, real.getActivities.call(this, id, ...rest)); };
        if (real.getUnfilteredActivities) {
            Presence.getUnfilteredActivities = function (id: string, ...rest: any[]) { return activitiesFor(id, real.getUnfilteredActivities.call(this, id, ...rest)); };
        }
        if (real.getPrimaryActivity) {
            Presence.getPrimaryActivity = function (id: string, ...rest: any[]) {
                const look = lookFor(id);
                if (!running || look?.activities === undefined) return real.getPrimaryActivity.call(this, id, ...rest);
                return activitiesFor(id, real.getActivities.call(this, id)).find(a => a?.type !== 4) ?? null;
            };
        }
    }

    if (Profiles && real.getWidgets) {
        Profiles.getWidgets = function (id: string, ...rest: any[]) {
            const look = lookFor(id);
            return running && look?.widgets !== undefined ? look.widgets : real.getWidgets.call(this, id, ...rest);
        };
    }

    if (Outbox && real.getUserOutbox) {
        Outbox.getUserOutbox = function (id: string, ...rest: any[]) { return outboxFor(id, real.getUserOutbox.call(this, id, ...rest)); };
        if (real.getMatchingOutboxEntry) {
            Outbox.getMatchingOutboxEntry = function (query: any, ...rest: any[]) {
                const id = query?.userId;
                return running && id && lookFor(id)?.recentActivity !== undefined
                    ? matchingEntry(id, query.activity)
                    : real.getMatchingOutboxEntry.call(this, query, ...rest);
            };
        }
        // a worn list is already here, so the tab never waits on a fetch to show it
        if (real.isFetchingUserOutbox) {
            Outbox.isFetchingUserOutbox = function (id: string, ...rest: any[]) {
                return running && lookFor(id)?.recentActivity !== undefined ? false : real.isFetchingUserOutbox.call(this, id, ...rest);
            };
        }
    }

    patchSetting();
    running = true;
    redrawPresence();
}

export function stopPresence() {
    if (!running) return;
    running = false;

    if (Presence) for (const key of ["getStatus", "getActivities", "getUnfilteredActivities", "getPrimaryActivity"]) if (real[key]) Presence[key] = real[key];
    if (Profiles && real.getWidgets) Profiles.getWidgets = real.getWidgets;
    if (Outbox) for (const key of ["getUserOutbox", "isFetchingUserOutbox", "getMatchingOutboxEntry"]) if (real[key]) Outbox[key] = real[key];
    unpatchSetting();

    lists.clear();
    outboxes.clear();
    redrawPresence();
}

export function redrawPresence() {
    try {
        Presence?.emitChange?.();
        Outbox?.emitChange?.();
    } catch { /* nothing showing */ }
}
