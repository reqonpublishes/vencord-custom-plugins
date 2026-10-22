/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { ChannelStore, GuildStore, IconUtils, UserStore } from "@webpack/common";

/**
 * A conversation as a list shows it: what it is called, where it is, and its picture - the
 * person for a DM, the server for a channel.
 *
 * The same file is in each plugin that lists conversations, so none depends on another.
 */
export function placeOf(channelId: string): { name: string; detail?: string; image?: string | null; } {
    const channel: any = ChannelStore.getChannel(channelId);
    if (!channel) return { name: "A conversation not loaded yet" };

    try {
        if (channel.isDM?.()) {
            const user: any = UserStore.getUser(channel.recipients?.[0]);
            return {
                name: user?.globalName ?? user?.username ?? "Direct message",
                detail: "Direct message",
                image: user ? IconUtils.getUserAvatarURL(user, false, 64) : null
            };
        }

        if (channel.isGroupDM?.()) {
            const names = (channel.recipients ?? []).map((id: string) => {
                const user: any = UserStore.getUser(id);
                return user?.globalName ?? user?.username;
            }).filter(Boolean);
            return { name: channel.name || names.join(", ") || "Group DM", detail: "Group DM" };
        }

        const guild: any = GuildStore.getGuild(channel.guild_id);
        return {
            name: "#" + channel.name,
            detail: guild?.name,
            image: guild?.icon ? IconUtils.getGuildIconURL({ id: guild.id, icon: guild.icon, size: 64 }) : null
        };
    } catch {
        return { name: channel.name ? "#" + channel.name : "A conversation" };
    }
}
