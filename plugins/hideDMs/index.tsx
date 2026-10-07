/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";

import { NavContextMenuPatchCallback } from "@api/ContextMenu";
import definePlugin from "@utils/types";
import { Channel, User } from "@vencord/discord-types";
import { ChannelStore, FluxDispatcher, Menu } from "@webpack/common";

import { settings } from "./settings";
import { hideChat, hidJustNow, isHidden, load, reapply, showAll, showChat } from "./store";

const HideIcon = ({ height = 20, width = 20, className }: { height?: number; width?: number; className?: string; }) => (
    <svg viewBox="0 0 24 24" height={height} width={width} className={className}>
        <path
            fill="currentColor"
            d="M2.7 3.4 21.3 22l1.4-1.4-3.3-3.3A12.5 12.5 0 0 0 23 12s-4-7-11-7a10.7 10.7 0 0 0-4.7 1.1L4.1 2 2.7 3.4Zm6.1 6.1 5.7 5.7a4 4 0 0 1-5.7-5.7Z"
        />
    </svg>
);

const ShowIcon = ({ height = 20, width = 20, className }: { height?: number; width?: number; className?: string; }) => (
    <svg viewBox="0 0 24 24" height={height} width={width} className={className}>
        <path
            fill="currentColor"
            d="M12 5C5 5 1 12 1 12s4 7 11 7 11-7 11-7-4-7-11-7Zm0 12a5 5 0 1 1 0-10 5 5 0 0 1 0 10Zm0-2a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"
        />
    </svg>
);

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
    const Icon = away ? ShowIcon : HideIcon;

    return (
        <Menu.MenuItem
            id="vc-chd-dm"
            key="vc-chd-dm"
            label={away ? "Show DM" : "Hide DM"}
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

export default definePlugin({
    name: "CustomPluginHideDMs",
    description: "Take a conversation out of your DM list, for you only. Nothing is closed on Discord, the other person is told nothing, and the messages are all still there when you bring it back.",
    tags: ["Chat", "Appearance"],
    authors: [{ name: "reqon", id: 0n }],

    settings,

    contextMenus: {
        "channel-context": channelCtx,
        "gdm-context": channelCtx,
        "user-context": userCtx
    },

    async start() {
        await load();
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
