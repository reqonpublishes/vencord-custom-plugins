/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";

import { NavContextMenuPatchCallback } from "@api/ContextMenu";
import definePlugin from "@utils/types";
import { Guild } from "@vencord/discord-types";
import { Menu } from "@webpack/common";

import { settings } from "./settings";
import { hideServer, isHidden, load, showServer, start, stop } from "./store";

const HideIcon = ({ height = 20, width = 20, className }: { height?: number; width?: number; className?: string; }) => (
    <svg viewBox="0 0 24 24" height={height} width={width} className={className}>
        <path
            fill="currentColor"
            d="M2.7 3.4 21.3 22l1.4-1.4-3.3-3.3A12.5 12.5 0 0 0 23 12s-4-7-11-7a10.7 10.7 0 0 0-4.7 1.1L4.1 2 2.7 3.4Zm6.1 6.1 5.7 5.7a4 4 0 0 1-5.7-5.7Z"
        />
    </svg>
);

const guildCtx: NavContextMenuPatchCallback = (children, { guild }: { guild?: Guild; }) => {
    if (!guild?.id || !settings.store.guildMenu) return;

    const away = isHidden(guild.id);

    children.push(
        <Menu.MenuItem
            id="vc-chs-server"
            key="vc-chs-server"
            label={away ? "Show Server" : "Hide Server"}
            icon={HideIcon}
            leadingAccessory={{ type: "icon", icon: HideIcon }}
            action={() => away ? showServer(guild.id) : hideServer(guild.id)}
        />
    );
};

export default definePlugin({
    name: "CustomPluginHideServers",
    description: "Take a server off your server list, or all of them at once, in your own client only. You stay in the server, nothing is left, and nobody is told.",
    tags: ["Servers", "Appearance"],
    authors: [{ name: "reqon", id: 0n }],

    settings,

    contextMenus: {
        "guild-context": guildCtx
    },

    async start() {
        await load();
        start();
    },

    stop() {
        // The bar goes back to how Discord has it; the list of what was hidden is kept.
        stop();
    }
});
