/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { clear, createStore, delMany, keys } from "@api/DataStore";
import { Settings } from "@api/Settings";

import { ENTRIES } from "./hub";

/** Cloud Sync's code is the way back to your phone's copy, so it is the one thing kept */
const KEEP_SETTINGS = new Set(["CloudSync"]);

/**
 * Everything these plugins have saved on this computer, gone: hidden lists, fakes, edits,
 * looks and their pictures, bookmarks, and every setting back to how it comes.
 *
 * Whether each plugin is enabled in Vencord is left alone, and so is Cloud Sync's code - the
 * copy in the cloud is not touched, and nothing is sent anywhere. Discord reloads after, so
 * nothing still held in memory is saved back.
 */
export async function deleteAllData() {
    const ours = [...ENTRIES.map(entry => entry.plugin), "PluginHub"];

    for (const name of ours) {
        if (KEEP_SETTINGS.has(name)) continue;
        const stored: any = Settings.plugins[name];
        if (!stored) continue;
        for (const key of Object.keys(stored)) if (key !== "enabled") delete stored[key];
    }

    const prefixes = ours.map(name => name + "_");
    const saved = (await keys()).filter(key => typeof key === "string" && prefixes.some(prefix => key.startsWith(prefix)));
    await delMany(saved);

    // the shop's pictures, kept in a store of their own
    await clear(createStore("InspectProfilesShop", "pictures")).catch(() => { });

    location.reload();
}
