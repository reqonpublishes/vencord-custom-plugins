/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";

import { NavContextMenuPatchCallback } from "@api/ContextMenu";
import definePlugin from "@utils/types";
import { Channel, Message } from "@vencord/discord-types";
import { FluxDispatcher, Menu, SelectedChannelStore } from "@webpack/common";

import { openAddMessage } from "./AddMessageModal";
import { settings } from "./settings";
import { clearChannel, countIn, interceptor, isFake, load, removeMessage } from "./store";

const AddIcon = ({ height = 20, width = 20, className }: { height?: number; width?: number; className?: string; }) => (
    <svg viewBox="0 0 24 24" height={height} width={width} className={className}>
        <path
            fill="currentColor"
            d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm1 11v4h-2v-4H7v-2h4V7h2v4h4v2h-4Z"
        />
    </svg>
);

const RemoveIcon = ({ height = 20, width = 20, className }: { height?: number; width?: number; className?: string; }) => (
    <svg viewBox="0 0 24 24" height={height} width={width} className={className}>
        <path
            fill="currentColor"
            d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm5 11H7v-2h10v2Z"
        />
    </svg>
);

let interceptorRegistered = false;

const messageCtx: NavContextMenuPatchCallback = (children, { message }: { message: Message; }) => {
    if (!message || !settings.store.messageMenu) return;

    const channelId = message.channel_id;

    // Taking one back is offered where it is: on the message itself, which is the only place
    // somebody looking at it would think to ask.
    if (isFake(channelId, message.id)) {
        children.push(
            <Menu.MenuItem
                id="vc-cfm-remove"
                key="vc-cfm-remove"
                label="Remove Added Message"
                icon={RemoveIcon}
                leadingAccessory={{ type: "icon", icon: RemoveIcon }}
                action={() => removeMessage(channelId, message.id)}
            />
        );
        return;
    }

    children.push(
        <Menu.MenuItem
            id="vc-cfm-add"
            key="vc-cfm-add"
            label="Add Message Here"
            icon={AddIcon}
            leadingAccessory={{ type: "icon", icon: AddIcon }}
            // Seeded from the message underneath: the same person, a moment later. Most
            // invented messages are a reply to something, so that is the cheaper default.
            action={() => openAddMessage({
                channelId,
                authorId: message.author?.id,
                sentAt: new Date(message.timestamp as any).getTime() + 60_000
            })}
        />
    );
};

const channelCtx: NavContextMenuPatchCallback = (children, props: { channel?: Channel; }) => {
    const channelId = props?.channel?.id;
    if (!channelId || !settings.store.channelMenu) return;

    children.push(
        <Menu.MenuItem
            id="vc-cfm-channel-add"
            key="vc-cfm-channel-add"
            label="Add Message"
            icon={AddIcon}
            leadingAccessory={{ type: "icon", icon: AddIcon }}
            action={() => openAddMessage({ channelId })}
        />
    );

    const held = countIn(channelId);
    if (!held) return;

    children.push(
        <Menu.MenuItem
            id="vc-cfm-channel-clear"
            key="vc-cfm-channel-clear"
            label={held === 1 ? "Remove 1 Added Message" : `Remove ${held} Added Messages`}
            icon={RemoveIcon}
            leadingAccessory={{ type: "icon", icon: RemoveIcon }}
            action={() => clearChannel(channelId)}
        />
    );
};

export default definePlugin({
    name: "CustomPluginFakeMessages",
    description: "Put a message in a conversation that nobody sent. Choose who it came from, what it says and when, in your own client only. Nothing is sent to Discord and nobody else sees it.",
    tags: ["Chat", "Utility"],
    authors: [{ name: "reqon", id: 0n }],

    settings,

    contextMenus: {
        "message": messageCtx,
        "channel-context": channelCtx,
        "gdm-context": channelCtx,
        "thread-context": channelCtx,
        "user-context": (children, props: { channel?: Channel; }) => channelCtx(children, props)
    },

    async start() {
        await load();

        // Added once and left: Vencord has no way to take an interceptor back off, so a
        // second start would stack another copy and every page would be processed twice.
        if (!interceptorRegistered) {
            interceptorRegistered = true;
            FluxDispatcher.addInterceptor(interceptor);
        }
    },

    stop() {
        // The interceptor stays, and answers with nothing once the store is empty of this
        // channel. Taking the messages off the screen is what stopping should look like.
        const here = SelectedChannelStore.getChannelId();
        if (here) clearChannelFromView(here);
    }
});

/**
 * Take the invented messages out of the channel on screen, without forgetting them.
 *
 * Stopping the plugin should leave the conversation as Discord has it, and starting it again
 * should bring them back - so nothing is deleted here, only taken off the screen.
 */
function clearChannelFromView(channelId: string) {
    if (!countIn(channelId)) return;

    FluxDispatcher.dispatch({
        type: "LOAD_MESSAGES",
        channelId
    } as any);
}
