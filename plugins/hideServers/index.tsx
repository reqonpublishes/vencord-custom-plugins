/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./shared.css";

import { NavContextMenuPatchCallback } from "@api/ContextMenu";
import { migratePluginSettings } from "@api/Settings";
import definePlugin from "@utils/types";
import { Guild } from "@vencord/discord-types";
import { Menu } from "@webpack/common";

import { EyeIcon, EyeOffIcon } from "./icons";
import { settings } from "./settings";
import { hideServer, invalidate, isHidden, isLoaded, load, showServer, start, stop } from "./store";
import { About } from "./ui";

const guildCtx: NavContextMenuPatchCallback = (children, { guild }: { guild?: Guild; }) => {
    if (!guild?.id || !settings.store.guildMenu) return;

    const away = isHidden(guild.id);
    const Icon = away ? EyeIcon : EyeOffIcon;

    children.push(
        <Menu.MenuItem
            id="vc-chs-server"
            key="vc-chs-server"
            label={away ? "Unhide Server" : "Hide Server"}
            icon={Icon}
            leadingAccessory={{ type: "icon", icon: Icon }}
            action={() => away ? showServer(guild.id) : hideServer(guild.id)}
        />
    );
};

migratePluginSettings("HideServers", "CustomPluginHideServers");

export default definePlugin({
    name: "HideServers",
    description: "Hide servers from your server list. You stay in every one of them, nothing is left, and nobody is told.",
    tags: ["Servers", "Appearance", "Privacy"],
    authors: [{ name: "reqon", id: 497562304498368513n }],

    settings,

    settingsAboutComponent: () => (
        <About
            icon={EyeOffIcon}
            title="Hide servers from your server list"
            steps={[
                <>Right-click a server and choose <strong>Hide Server</strong>.</>,
                <>You stay a member and still get everything from it. It is only not drawn on the bar.</>,
                <>Everything you have hidden is listed below, with a way back.</>
            ]}
        />
    ),

    contextMenus: {
        "guild-context": guildCtx
    },

    /** Told by Cloud Sync that the saved copy was replaced, so the next start reads it again */
    dataChanged: invalidate,

    async start() {
        // Only the first start reads from disk. After that the list is already in memory,
        // and not waiting is what lets switching back on happen at once.
        if (!isLoaded()) await load();
        start();
    },

    stop() {
        // The bar goes back to how Discord has it; the list of what was hidden is kept.
        stop();
    }
});
