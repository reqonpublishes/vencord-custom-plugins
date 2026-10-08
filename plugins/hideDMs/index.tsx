/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./shared.css";

import { NavContextMenuPatchCallback } from "@api/ContextMenu";
import { migratePluginSettings } from "@api/Settings";
import definePlugin from "@utils/types";
import { Channel, User } from "@vencord/discord-types";
import { ChannelStore, FluxDispatcher, Menu } from "@webpack/common";

import { EyeIcon, EyeOffIcon } from "./icons";
import { settings } from "./settings";
import { hideChat, hidJustNow, invalidate, isHidden, isLoaded, load, reapply, showAll, showChat } from "./store";
import { About } from "./ui";

/**
 * Work out which conversation a menu is about.
 *
 * Right clicking a conversation hands us one directly. Right clicking a person often does
 * not, so their DM is looked up from them instead.
 */
function resolveChannelId(channel?: Channel, user?: User) {
    return channel?.id ?? (user && ChannelStore.getDMFromUserId(user.id)) ?? undefined;
}

function entry(channelId: string) {
    const away = isHidden(channelId);
    const Icon = away ? EyeIcon : EyeOffIcon;

    return (
        <Menu.MenuItem
            id="vc-chd-dm"
            key="vc-chd-dm"
            label={away ? "Unhide DM" : "Hide DM"}
            icon={Icon}
            leadingAccessory={{ type: "icon", icon: Icon }}
            action={() => away ? showChat(channelId) : hideChat(channelId)}
        />
    );
}

const channelCtx: NavContextMenuPatchCallback = (children, { channel }: { channel?: Channel; }) => {
    if (!settings.store.channelMenu) return;

    const channelId = resolveChannelId(channel);
    if (channelId) children.push(entry(channelId));
};

const userCtx: NavContextMenuPatchCallback = (children, { channel, user }: { channel?: Channel; user?: User; }) => {
    if (!settings.store.userMenu) return;

    const channelId = resolveChannelId(channel, user);
    if (channelId) children.push(entry(channelId));
};

/**
 * Opening a hidden conversation on purpose is what stops it being hidden.
 *
 * Search, a profile, the friends list - anything that reaches a conversation Discord has
 * closed brings it back, and that is a clear enough statement of intent to take it off the
 * list. Without this it would be put away again a moment later and look broken.
 */
const reopen = (action: any) => {
    // Not in the moment after a hide: closing the conversation on screen makes Discord
    // select another, and once that was this one coming straight back.
    if (hidJustNow()) return;

    if (isHidden(action?.channelId)) showChat(action.channelId);
};

/** Discord rebuilds its conversations on every reconnect, so what was hidden is said again */
const afterConnect = () => reapply();

migratePluginSettings("HideDMs", "CustomPluginHideDMs");

export default definePlugin({
    name: "HideDMs",
    description: "Hide conversations from your DM list. Nothing is closed, the other person is not told, and every message is still there when you unhide it.",
    tags: ["Chat", "Appearance", "Privacy"],
    authors: [{ name: "reqon", id: 497562304498368513n }],

    settings,

    settingsAboutComponent: () => (
        <About
            icon={EyeOffIcon}
            title="Hide conversations from your DM list"
            steps={[
                <>Right-click a DM or a person and choose <strong>Hide DM</strong>.</>,
                <>Opening a hidden DM from search or a profile unhides it.</>,
                <>Everything you have hidden is listed below, with a way back.</>
            ]}
        />
    ),

    contextMenus: {
        "channel-context": channelCtx,
        "gdm-context": channelCtx,
        "user-context": userCtx
    },

    /** Told by Cloud Sync that the saved copy was replaced, so the next start reads it again */
    dataChanged: invalidate,

    async start() {
        // Only the first start reads from disk. After that the list is already in memory,
        // and not waiting is what lets switching back on happen at once.
        if (!isLoaded()) await load();
        reapply();

        FluxDispatcher.subscribe("CHANNEL_SELECT", reopen);
        FluxDispatcher.subscribe("CONNECTION_OPEN", afterConnect);
    },

    stop() {
        FluxDispatcher.unsubscribe("CHANNEL_SELECT", reopen);
        FluxDispatcher.unsubscribe("CONNECTION_OPEN", afterConnect);

        // Back on screen, still on the list. Switching the plugin off should give the
        // conversations back without forgetting which ones you had put away.
        showAll(false);
    }
});
