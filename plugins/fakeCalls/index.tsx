/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./shared.css";

import { NavContextMenuPatchCallback } from "@api/ContextMenu";
import { migratePluginSettings } from "@api/Settings";
import definePlugin from "@utils/types";
import { Channel, Message, User } from "@vencord/discord-types";
import { ChannelStore, FluxDispatcher, Menu, SelectedChannelStore } from "@webpack/common";

import { openAddCall } from "./AddCallModal";
import { PhoneAddIcon, TrashIcon } from "./icons";
import { place } from "./menu";
import { settings } from "./settings";
import {
    chats,
    clearChannel,
    countIn,
    interceptor,
    invalidate,
    isFake,
    isLoaded,
    load,
    removeCall,
    showIn,
    takeAllOffScreen,
    total
} from "./store";
import { About } from "./ui";

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
        place(children, 55,
            <Menu.MenuItem
                id="vc-cfc-remove"
                key="vc-cfc-remove"
                label="Remove Fake Call"
                color="danger"
                icon={TrashIcon}
                leadingAccessory={{ type: "icon", icon: TrashIcon }}
                action={() => removeCall(channelId, message.id)}
            />
        );
        return;
    }

    if (!isPrivate(channelId)) return;

    place(children, 50,
        <Menu.MenuItem
            id="vc-cfc-add"
            key="vc-cfc-add"
            label="Add Fake Call Here"
            icon={PhoneAddIcon}
            leadingAccessory={{ type: "icon", icon: PhoneAddIcon }}
            action={() => openAddCall({
                channelId,
                startedAt: new Date(message.timestamp as any).getTime() + 60_000
            })}
        />
    );
};

function entries(children: any[], channelId: string) {
    if (!isPrivate(channelId)) return;

    place(children, 50,
        <Menu.MenuItem
            id="vc-cfc-channel-add"
            key="vc-cfc-channel-add"
            label="Add Fake Call"
            icon={PhoneAddIcon}
            leadingAccessory={{ type: "icon", icon: PhoneAddIcon }}
            action={() => openAddCall({ channelId })}
        />
    );

    const held = countIn(channelId);
    if (!held) return;

    place(children, 55,
        <Menu.MenuItem
            id="vc-cfc-channel-clear"
            key="vc-cfc-channel-clear"
            label={held === 1 ? "Remove 1 Fake Call" : `Remove ${held} Fake Calls`}
            color="danger"
            icon={TrashIcon}
            leadingAccessory={{ type: "icon", icon: TrashIcon }}
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

/** Whether the plugin is meant to be on. Checked after waiting, in case it was switched off meanwhile */
let alive = false;

migratePluginSettings("FakeCalls", "CustomPluginFakeCalls");

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export default definePlugin({
    name: "FakeCalls",
    description: "Add a call to any DM: who started it, when, how long it lasted, and whether you picked up. Nothing is sent to Discord and nobody is rung.",
    tags: ["Chat", "Utility"],
    authors: [{ name: "reqon", id: 497562304498368513n }],

    settings,

    /** One line for Additional Settings: how many there are */
    hubSummary() {
        const n = total();
        return n ? `${plural(n, "fake call")} in ${plural(chats(), "conversation")}` : "No fake calls yet";
    },

    settingsAboutComponent: () => (
        <About
            icon={PhoneAddIcon}
            title="Add calls that never happened"
            steps={[
                <>Right-click a message in a DM and choose <strong>Add Fake Call Here</strong> to put one right after it.</>,
                <>Or right-click a DM or a person and choose <strong>Add Fake Call</strong>.</>,
                <>Right-click a fake call and choose <strong>Remove Fake Call</strong> to take it back.</>
            ]}
        />
    ),

    contextMenus: {
        "message": messageCtx,
        "channel-context": channelCtx,
        "gdm-context": channelCtx,
        "user-context": userCtx
    },

    /** Told by Cloud Sync that the saved copy was replaced, so the next start reads it again */
    dataChanged: invalidate,

    async start() {
        // Only the first start reads from disk. After that the list is already in memory,
        // and not waiting is what lets switching back on happen at once.
        alive = true;
        if (!isLoaded()) {
            await load();

            // Switched off again while the list was being read, so it stays off.
            if (!alive) return;
        }

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
        alive = false;
        takeAllOffScreen();
    }
});
