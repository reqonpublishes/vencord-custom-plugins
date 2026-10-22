/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

/**
 * Channels taken off a server's channel list.
 *
 * Done the way servers are: the row is drawn out of the list, nothing is taken out of the
 * client. You stay in the channel, it keeps receiving, and it is back the moment it is shown
 * again. Opened from a link or a search it still opens - only the list leaves it out.
 */

import { del, get, set } from "@api/DataStore";
import { ChannelStore, GuildStore } from "@webpack/common";

import { settings } from "./settings";

const KEY = "HideServers_Channels";

/** channelId -> its name and its server's id, as they were when hidden, so the list reads as names */
let hidden = new Map<string, { name: string; guild: string; }>();

let loaded = false;
let styleEl: HTMLStyleElement | null = null;
let running = false;
const listeners = new Set<() => void>();

export const isChannelHidden = (channelId?: string | null) => !!channelId && hidden.has(channelId);
export const hiddenChannels = () => [...hidden.entries()];
export const channelCount = () => hidden.size;
export const onChannelsChange = (listener: () => void) => (listeners.add(listener), () => void listeners.delete(listener));

/** Only channels in a server can be hidden: a DM is Hide DMs' business, a category holds others */
export function canHide(channel: any): boolean {
    return !!channel?.guild_id && channel.type !== 4;
}

function save() {
    paint();
    for (const listener of listeners) listener();
    if (settings.store.persist) set(KEY, [...hidden]);
}

export async function loadChannels() {
    if (loaded) return;
    loaded = true;

    const stored = settings.store.persist ? await get<[string, { name: string; guild: string; }][]>(KEY) : null;
    if (Array.isArray(stored)) hidden = new Map(stored);
}

/** Told that the saved copy changed behind its back */
export function invalidateChannels() {
    loaded = false;
}

export function forgetSavedChannels() {
    del(KEY);
}

/**
 * One rule per hidden channel, reaching up from its link to the row it sits in. A handful of
 * these cost nothing, and they need nothing kept in step with the list as Discord redraws it.
 */
function paint() {
    if (!styleEl) return;

    const rules = running
        ? [...hidden.keys()].map(id => `li:has(> div > div > [data-list-item-id="channels___${id}"])`)
        : [];

    styleEl.textContent = rules.length ? rules.join(",\n") + " { display: none !important; }" : "";
}

export function startChannels() {
    running = true;
    styleEl ??= document.head.appendChild(Object.assign(document.createElement("style"), { id: "vc-chs-channels" }));
    paint();
}

export function stopChannels() {
    running = false;
    styleEl?.remove();
    styleEl = null;
}

export function hideChannel(channelId: string) {
    const channel: any = ChannelStore.getChannel(channelId);
    if (!canHide(channel) || hidden.has(channelId)) return;

    hidden.set(channelId, { name: channel.name ?? channelId, guild: channel.guild_id });
    save();
}

export function showChannel(channelId: string) {
    if (!hidden.delete(channelId)) return;
    save();
}

export function showAllChannels() {
    if (!hidden.size) return;
    hidden.clear();
    save();
}

/** A hidden channel as the settings page draws it: its name, and the server it is in */
export function channelInfo(channelId: string): { name: string; detail: string; } {
    const saved = hidden.get(channelId);
    const channel: any = ChannelStore.getChannel(channelId);
    const guild: any = GuildStore.getGuild(channel?.guild_id ?? saved?.guild ?? "");

    return {
        name: "#" + (channel?.name ?? saved?.name ?? channelId),
        detail: guild?.name ?? (channel ? "" : "No longer in this server")
    };
}
