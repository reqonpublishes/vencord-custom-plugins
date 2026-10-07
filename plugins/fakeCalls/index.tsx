/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";

import { NavContextMenuPatchCallback } from "@api/ContextMenu";
import definePlugin from "@utils/types";
import { Channel, Message, User } from "@vencord/discord-types";
import { ChannelStore, FluxDispatcher, Menu, SelectedChannelStore } from "@webpack/common";

import { openAddCall } from "./AddCallModal";
import { settings } from "./settings";
import { clearChannel, countIn, interceptor, isFake, load, removeCall, showIn, takeAllOffScreen } from "./store";

const CallIcon = ({ height = 20, width = 20, className }: { height?: number; width?: number; className?: string; }) => (
    <svg viewBox="0 0 24 24" height={height} width={width} className={className}>
        <path
            fill="currentColor"
            d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.4 11.4 0 0 0 3.6.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.57a1 1 0 0 1-.25 1L6.6 10.8Z"
        />
    </svg>
);

let interceptorRegistered = false;

/** A call only means something between people, so it is offered in DMs and group DMs */
const isPrivate = (channelId: string) => {
    const channel: any = ChannelStore.getChannel(channelId);
    return !!channel && !channel.guild_id;
};

const messageCtx: NavContextMenuPatchCallback = (children, { message }: { message: Message; }) => {
    if (!message || !settings.store.messageMenu) return;

    const channelId = message.channel_id;

    if (isFake(channelId, message.id)) {
        children.push(
            <Menu.MenuItem
                id="vc-cfc-remove"
                key="vc-cfc-remove"
                label="Remove Added Call"
                icon={CallIcon}
                leadingAccessory={{ type: "icon", icon: CallIcon }}
                action={() => removeCall(channelId, message.id)}
            />
        );
        return;
    }

    if (!isPrivate(channelId)) return;

    children.push(
        <Menu.MenuItem
            id="vc-cfc-add"
            key="vc-cfc-add"
            label="Add Call Here"
            icon={CallIcon}
            leadingAccessory={{ type: "icon", icon: CallIcon }}
            action={() => openAddCall({
                channelId,
                startedAt: new Date(message.timestamp as any).getTime() + 60_000
            })}
        />
    );
};

function entries(children: any[], channelId: string) {
    if (!isPrivate(channelId)) return;

    children.push(
        <Menu.MenuItem
            id="vc-cfc-channel-add"
            key="vc-cfc-channel-add"
            label="Add Call"
            icon={CallIcon}
            leadingAccessory={{ type: "icon", icon: CallIcon }}
            action={() => openAddCall({ channelId })}
        />
    );

    const held = countIn(channelId);
    if (!held) return;

    children.push(
        <Menu.MenuItem
            id="vc-cfc-channel-clear"
            key="vc-cfc-channel-clear"
            label={held === 1 ? "Remove 1 Added Call" : `Remove ${held} Added Calls`}
            icon={CallIcon}
            leadingAccessory={{ type: "icon", icon: CallIcon }}
            action={() => clearChannel(channelId)}
        />
    );
}

const channelCtx: NavContextMenuPatchCallback = (children, { channel }: { channel?: Channel; }) => {
    if (!settings.store.channelMenu || !channel?.id) return;
    entries(children, channel.id);
};

const userCtx: NavContextMenuPatchCallback = (children, { channel, user }: { channel?: Channel; user?: User; }) => {
    if (!settings.store.channelMenu) return;

    const channelId = channel?.id ?? (user && ChannelStore.getDMFromUserId(user.id));
    if (channelId) entries(children, channelId);
};

export default definePlugin({
    name: "CustomPluginFakeCalls",
    description: "Add a call to any DM: who rang, when, how long it lasted, and whether you picked up. In your own client only. Nothing is sent to Discord and nobody else sees it.",
    tags: ["Chat", "Utility"],
    authors: [{ name: "reqon", id: 0n }],

    settings,

    contextMenus: {
        "message": messageCtx,
        "channel-context": channelCtx,
        "gdm-context": channelCtx,
        "user-context": userCtx
    },

    async start() {
        await load();

        // Added once and left: there is no taking an interceptor back off, so a second
        // start would stack another copy and every page would be processed twice.
        if (!interceptorRegistered) {
            interceptorRegistered = true;
            FluxDispatcher.addInterceptor(interceptor);
        }

        // The channel on screen was loaded before this started - see Fake Messages.
        const here = SelectedChannelStore.getChannelId();
        if (here) showIn(here);
    },

    stop() {
        takeAllOffScreen();
    }
});
