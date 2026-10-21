/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { get, set } from "@api/DataStore";

/**
 * Everything a profile can be made to say.
 *
 * The same shape the phone keeps, field for field, so a look made on one reads the same on the
 * other. A field that is absent is left alone rather than blanked: "call them something else"
 * and "they have no name" are different things, and only one of them is ever meant.
 */
export interface Look {
    globalName?: string;
    username?: string;
    bio?: string;
    pronouns?: string;
    /** the day under Member Since, as epoch milliseconds */
    memberSince?: number;
    /** every badge the profile should show, by our key - see badges.ts */
    badges?: string[];
    /** the Nitro tier, 0 for none */
    premiumType?: number;
    /** the two colours behind the card, as 0xRRGGBB */
    themeColors?: [number, number];
    /** a picture address, or "none" for no picture at all */
    avatar?: string;
    banner?: string;
    /** the ring around the avatar, and what it was bought as */
    decoration?: string;
    decorationSku?: string;
    /** the plate behind the name in the member list */
    nameplate?: string;
    nameplateSku?: string;
    nameplatePalette?: string;
    /** what plays behind the card, and the frame around its top, by what they were bought as */
    profileEffect?: string;
    profileFrame?: string;
    /** the lettering of the name: which face, what it does, what colours */
    fontId?: number;
    effectId?: number;
    nameColors?: number[];
    /** the accounts listed under Connections, exactly as a profile carries them */
    connections?: Connection[];
    /** the dot on the avatar: online, idle, do not disturb, or invisible (shows as offline) */
    status?: "online" | "idle" | "dnd" | "invisible";
    /** the custom status, or "none" for no custom status at all */
    customStatus?: CustomStatus | typeof NOTHING;
    /** what they are doing - playing, listening, watching - as Discord's presence carries it */
    activities?: any[];
    /** the games under Recent activity on their profile, with their streaks, as Discord sends them */
    recentActivity?: any[];
    /** the widgets on their board, exactly as their profile carries them */
    widgets?: any[];
}

export interface CustomStatus {
    text?: string;
    /** a plain emoji, or one of a server's own as Discord describes it */
    emoji?: string | { name?: string; id?: string; animated?: boolean; };
}

export interface Connection {
    type: string;
    id: string;
    name: string;
    verified?: boolean;
    [more: string]: any;
}

/** Written down when somebody is meant to have none at all, as opposed to "leave theirs" */
export const NOTHING = "none";

interface State {
    /** userId -> how their profile should look */
    profiles: Record<string, Look>;
    /** a name you gave a look -> the look */
    presets: Record<string, Look>;
}

const KEY = "InspectProfiles_State";

let state: State = { profiles: {}, presets: {} };

let loading: Promise<void> | null = null;

/** Read once; after that memory is the copy. A second caller waits for the same read */
export function load() {
    loading ??= (async () => {
        const stored = await get<State>(KEY);
        if (stored) state = { profiles: stored.profiles ?? {}, presets: stored.presets ?? {} };
    })();

    return loading;
}

/** Told by Cloud Sync that the saved copy was replaced */
export function invalidate() {
    loading = null;
}

export const asRecord = () => state;

export function replaceAll(next: Partial<State>) {
    state = { profiles: next.profiles ?? {}, presets: next.presets ?? {} };
    save();
}

// ---------------------------------------------------------------- telling whoever draws

let version = 0;
const listeners = new Set<() => void>();

/** Goes up on every change, so a copy built before it can tell it is stale */
export const changes = () => version;

export function onChange(listener: () => void) {
    listeners.add(listener);
    return () => void listeners.delete(listener);
}

let saveQueued = false;

function save() {
    version++;
    for (const listener of listeners) {
        try {
            listener();
        } catch { /* one listener failing is no reason to stop telling the rest */ }
    }

    if (saveQueued) return;
    saveQueued = true;

    // Once per turn of the loop: a preset applied is a dozen fields, and a dozen writes of
    // the same object is eleven too many.
    setTimeout(() => {
        saveQueued = false;
        set(KEY, state);
    }, 0);
}

// ---------------------------------------------------------------- profiles

export const lookFor = (userId?: string | null): Look | undefined => (userId ? state.profiles[userId] : undefined);
export const editedIds = () => Object.keys(state.profiles);

/**
 * Keep only what says something.
 *
 * Absent means "leave theirs". An empty box in the editor is already turned into absent before
 * it gets here, so what arrives empty was meant: a stolen profile with no bio, no badges or no
 * connections, which has to take yours away rather than let it show through.
 */
export function tidy(look: Look): Look {
    const out: Look = {};

    for (const [key, value] of Object.entries(look) as [keyof Look, any][]) {
        if (value === undefined || value === null) continue;
        (out as any)[key] = value;
    }

    return out;
}

/** Make somebody look like this - the whole look, replacing what was there */
export function setLook(userId: string, look: Look) {
    const kept = tidy(look);

    if (!Object.keys(kept).length) {
        revert(userId);
        return;
    }

    state.profiles = { ...state.profiles, [userId]: kept };
    save();
}

/** Back to how they really are */
export function revert(userId: string): boolean {
    if (!state.profiles[userId]) return false;

    const { [userId]: _gone, ...rest } = state.profiles;
    state.profiles = rest;
    save();
    return true;
}

export function revertAll(): number {
    const n = editedIds().length;
    if (!n) return 0;

    state.profiles = {};
    save();
    return n;
}

// ---------------------------------------------------------------- presets

export const presetNames = () => Object.keys(state.presets).sort((a, b) => a.localeCompare(b));
export const presetCalled = (name: string): Look | undefined => state.presets[name];

/** As long a name as a row can show, tidied the way a name typed in a hurry needs */
export const tidyName = (name: string) => name.trim().replace(/\s+/g, " ").slice(0, 40);

export function savePreset(name: string, look: Look): "saved" | "unnamed" | "empty" {
    const called = tidyName(name);
    if (!called) return "unnamed";

    const kept = tidy(look);
    if (!Object.keys(kept).length) return "empty";

    state.presets = { ...state.presets, [called]: kept };
    save();
    return "saved";
}

export function deletePreset(name: string): boolean {
    if (!state.presets[name]) return false;

    const { [name]: _gone, ...rest } = state.presets;
    state.presets = rest;
    save();
    return true;
}

/** What is in a look, so a row says what it would do before anybody presses it */
export function summary(look?: Look): string {
    if (!look) return "Nothing in it";

    const parts: string[] = [];
    const said: [keyof Look, string][] = [
        ["globalName", "name"], ["username", "username"], ["bio", "bio"], ["pronouns", "pronouns"],
        ["memberSince", "member since"], ["avatar", "picture"], ["banner", "banner"],
        ["decoration", "decoration"], ["nameplate", "nameplate"], ["profileEffect", "effect"], ["profileFrame", "frame"],
    ];
    for (const [key, word] of said) if (look[key] !== undefined) parts.push(word);

    if (look.badges?.length) parts.push(`${look.badges.length} badge${look.badges.length === 1 ? "" : "s"}`);
    if (look.premiumType) parts.push("Nitro");
    if (look.themeColors || look.nameColors?.length) parts.push("colours");
    if (look.connections?.length) parts.push(`${look.connections.length} connection${look.connections.length === 1 ? "" : "s"}`);
    if (look.status || look.customStatus) parts.push("status");
    if (look.activities?.length || look.recentActivity?.length) parts.push("activity");
    if (look.widgets?.length) parts.push("board");

    return parts.length ? parts.join(", ") : "Nothing in it";
}
