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
 * Status, custom status, what someone is doing, and their board - the parts of a profile that
 * live outside the profile itself.
 *
 * The online status and activities come from the presence store, the board from the profile
 * store's widgets, and your own custom status from your account settings (measured: the bubble
 * on your own profile reads the setting, not your presence). Each is answered here for anybody
 * who has been changed, and left exactly as Discord has it for everybody else.
 */

let Presence: any = null;
let Profiles: any = null;
let real: Record<string, any> = {};
let running = false;

export const realActivities = (id: string): any[] => (real.getActivities ?? Presence?.getActivities)?.call(Presence, id) ?? [];
export const realStatus = (id: string): string => (real.getStatus ?? Presence?.getStatus)?.call(Presence, id) ?? "offline";
export const realWidgets = (id: string): any[] | undefined => (real.getWidgets ?? Profiles?.getWidgets)?.call(Profiles, id);

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
const lists = new Map<string, { from: any; version: number; list: any[]; }>();

function activitiesFor(id: string, actual: any[]): any[] {
    if (!running) return actual;
    const look = lookFor(id);
    if (!look || (look.customStatus === undefined && look.activities === undefined)) return actual;

    const held = lists.get(id);
    if (held && held.from === actual && held.version === changes()) return held.list;

    const realCustom = (actual ?? []).filter(a => a?.type === 4);
    const realOther = (actual ?? []).filter(a => a?.type !== 4);
    const custom = look.customStatus === undefined ? realCustom
        : look.customStatus === NOTHING ? [] : [customActivity(look.customStatus)];

    const list = [...custom, ...(look.activities ?? realOther)];
    lists.set(id, { from: actual, version: changes(), list });
    return list;
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

    real = {
        getStatus: Presence?.getStatus,
        getActivities: Presence?.getActivities,
        getUnfilteredActivities: Presence?.getUnfilteredActivities,
        getPrimaryActivity: Presence?.getPrimaryActivity,
        getWidgets: Profiles?.getWidgets,
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
                return look.activities[0] ?? null;
            };
        }
    }

    if (Profiles && real.getWidgets) {
        Profiles.getWidgets = function (id: string, ...rest: any[]) {
            const look = lookFor(id);
            return running && look?.widgets !== undefined ? look.widgets : real.getWidgets.call(this, id, ...rest);
        };
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
    unpatchSetting();

    lists.clear();
    redrawPresence();
}

export function redrawPresence() {
    try {
        Presence?.emitChange?.();
    } catch { /* nothing showing */ }
}
