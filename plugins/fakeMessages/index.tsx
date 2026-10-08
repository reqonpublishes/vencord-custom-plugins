/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./shared.css";

import { NavContextMenuPatchCallback } from "@api/ContextMenu";
import { migratePluginSettings } from "@api/Settings";
import definePlugin from "@utils/types";
import { Channel, Message } from "@vencord/discord-types";
import { FluxDispatcher, Menu, SelectedChannelStore } from "@webpack/common";

import { openAddMessage } from "./AddMessageModal";
import { ChatAddIcon, TrashIcon } from "./icons";
import { settings } from "./settings";
import { clearChannel, countIn, interceptor, invalidate, isFake, isLoaded, load, removeMessage, showIn, takeAllOffScreen } from "./store";
import { About } from "./ui";

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
                label="Remove Fake Message"
                color="danger"
                icon={TrashIcon}
                leadingAccessory={{ type: "icon", icon: TrashIcon }}
                action={() => removeMessage(channelId, message.id)}
            />
        );
        return;
    }

    children.push(
        <Menu.MenuItem
            id="vc-cfm-add"
            key="vc-cfm-add"
            label="Add Fake Message Here"
            icon={ChatAddIcon}
            leadingAccessory={{ type: "icon", icon: ChatAddIcon }}
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
            label="Add Fake Message"
            icon={ChatAddIcon}
            leadingAccessory={{ type: "icon", icon: ChatAddIcon }}
            action={() => openAddMessage({ channelId })}
        />
    );

    const held = countIn(channelId);
    if (!held) return;

    children.push(
        <Menu.MenuItem
            id="vc-cfm-channel-clear"
            key="vc-cfm-channel-clear"
            label={held === 1 ? "Remove 1 Fake Message" : `Remove ${held} Fake Messages`}
            color="danger"
            icon={TrashIcon}
            leadingAccessory={{ type: "icon", icon: TrashIcon }}
            action={() => clearChannel(channelId)}
        />
    );
};

migratePluginSettings("FakeMessages", "CustomPluginFakeMessages");

export default definePlugin({
    name: "FakeMessages",
    description: "Add a message to any conversation that nobody sent. Choose who it is from, what it says and when. Nothing is sent to Discord and nobody else sees it.",
    tags: ["Chat", "Utility"],
    authors: [{ name: "reqon", id: 497562304498368513n }],

    settings,

    settingsAboutComponent: () => (
        <About
            icon={ChatAddIcon}
            title="Add messages nobody sent"
            steps={[
                <>Right-click a message and choose <strong>Add Fake Message Here</strong> to put one right after it.</>,
                <>Or right-click a DM or channel and choose <strong>Add Fake Message</strong>.</>,
                <>Right-click a fake message and choose <strong>Remove Fake Message</strong> to take it back.</>
            ]}
        />
    ),

    contextMenus: {
        "message": messageCtx,
        "channel-context": channelCtx,
        "gdm-context": channelCtx,
        "thread-context": channelCtx,
        "user-context": (children, props: { channel?: Channel; }) => channelCtx(children, props)
    },

    /** Told by Cloud Sync that the saved copy was replaced, so the next start reads it again */
    dataChanged: invalidate,

    async start() {
        // Only the first start reads from disk. After that the list is already in memory,
        // and not waiting is what lets switching back on happen at once.
        if (!isLoaded()) await load();

        // Added once and left: Vencord has no way to take an interceptor back off, so a
        // second start would stack another copy and every page would be processed twice.
        if (!interceptorRegistered) {
            interceptorRegistered = true;
            FluxDispatcher.addInterceptor(interceptor);
        }

        // The channel on screen was loaded before this started, so nothing has spliced
        // anything into it. Everywhere else gets them as its pages arrive.
        const here = SelectedChannelStore.getChannelId();
        if (here) showIn(here);
    },

    stop() {
        // Off the screen, still on the list - stopping should leave the conversation as
        // Discord has it, and starting again should bring them back.
        takeAllOffScreen();
    }
});
