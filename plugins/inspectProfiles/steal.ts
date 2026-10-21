/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Settings } from "@api/Settings";

import { wholeLookOf } from "./rewrite";
import { Look } from "./store";

/**
 * The parts of a profile Steal can copy, so it can copy all of it or only some.
 *
 * Every part is on until switched off. Whatever is left out is simply not in the preset, so
 * wearing it keeps your own of that part.
 */
export const PARTS: { id: string; label: string; fields: (keyof Look)[]; }[] = [
    { id: "names", label: "Names", fields: ["globalName", "username"] },
    { id: "about", label: "Bio & pronouns", fields: ["bio", "pronouns"] },
    { id: "date", label: "Member since", fields: ["memberSince"] },
    { id: "pictures", label: "Avatar & banner", fields: ["avatar", "banner", "themeColors"] },
    { id: "badges", label: "Badges & Nitro", fields: ["badges", "premiumType"] },
    { id: "collectibles", label: "Collectibles", fields: ["decoration", "decorationSku", "nameplate", "nameplateSku", "nameplatePalette", "profileEffect", "profileFrame", "fontId", "effectId", "nameColors"] },
    { id: "connections", label: "Connections", fields: ["connections"] },
    { id: "status", label: "Status", fields: ["status", "customStatus"] },
    { id: "activity", label: "Activity", fields: ["activities"] },
    { id: "board", label: "Board", fields: ["widgets"] },
];

const store = () => Settings.plugins.InspectProfiles as any;

/** The parts switched off, kept rather than the parts on so a new part starts on */
export const skippedParts = (): string[] => store()?.stealSkip ?? [];

export function toggleStealPart(id: string) {
    const skipped = skippedParts();
    store().stealSkip = skipped.includes(id) ? skipped.filter(p => p !== id) : [...skipped, id];
}

/** Somebody's profile, with only the chosen parts in it */
export function stealLook(userId: string): Look | null {
    const whole = wholeLookOf(userId);
    if (!whole) return null;

    const skipped = new Set(PARTS.filter(p => skippedParts().includes(p.id)).flatMap(p => p.fields));
    const look: Look = {};
    for (const [key, value] of Object.entries(whole) as [keyof Look, any][]) {
        if (!skipped.has(key)) (look as any)[key] = value;
    }
    return look;
}
