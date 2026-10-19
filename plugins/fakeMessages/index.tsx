/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./shared.css";

import { findGroupChildrenByChildId, NavContextMenuPatchCallback } from "@api/ContextMenu";
import { migratePluginSettings } from "@api/Settings";
import definePlugin from "@utils/types";
import { Channel, Message } from "@vencord/discord-types";
import { FluxDispatcher, Menu, MessageStore, React, SelectedChannelStore } from "@webpack/common";

import { openAddMessage } from "./AddMessageModal";
import { editFake, startNative, stopNative } from "./discordActions";
import { openForward } from "./ForwardModal";
import { ChatAddIcon, PencilIcon, TrashIcon } from "./icons";
import { place } from "./menu";
import { settings } from "./settings";
import {
    chats,
    clearChannel,
    countIn,
    getFake,
    interceptor,
    invalidate,
    isFake,
    isRunning,
    load,
    removeMessage,
    setRunning,
    showLoaded,
    takeAllOffScreen,
    total
} from "./store";
import { About } from "./ui";

let interceptorRegistered = false;

const messageCtx: NavContextMenuPatchCallback = (children, { message }: { message: Message; }) => {
    if (!message || !settings.store.messageMenu) return;

    const channelId = message.channel_id;

    // Taking one back is offered where it is: on the message itself, which is the only place
    // somebody looking at it would think to ask.
    if (isFake(channelId, message.id)) {
        // Editing one is Inspect Messages' job - it rewrites the text, the time and the
        // edited tag of any message, and these are messages like any other. But its own
        // entry only shows while Shift is held, which nobody guesses on a message they made
        // up themselves, so the way in is offered here in plain sight.
        place(children, 44,
            <Menu.MenuItem
                id="vc-cfm-edit"
                key="vc-cfm-edit"
                label="Edit Fake Message"
                icon={PencilIcon}
                leadingAccessory={{ type: "icon", icon: PencilIcon }}
                action={() => editFake(message)}
            />
        );

        // Discord's own Forward is right there in the same menu, and would send a request for
        // a message Discord has never heard of. It is taken over for these: the same entry,
        // in the same place, opening a forward that stays on this computer.
        const group = findGroupChildrenByChildId("forward", children);
        const at = group?.findIndex(item => item?.props?.id === "forward") ?? -1;
        if (group && at !== -1) {
            const live = MessageStore.getMessage(channelId, message.id) ?? message;
            // A forward has no text of its own - what it says is the message inside it, and
            // forwarding it on carries that, the way Discord's own does.
            const inner = getFake(channelId, message.id)?.forward;
            group[at] = React.cloneElement(group[at] as React.ReactElement<any>, {
                action: () => openForward({
                    channelId,
                    messageId: message.id,
                    content: live.content || inner?.content || "",
                    sentAt: inner && !live.content ? inner.sentAt : new Date(live.timestamp as any).getTime()
                })
            });
        }

        place(children, 45,
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

    place(children, 40,
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

    place(children, 40,
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

    place(children, 45,
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

/** Whether the plugin is meant to be on. Checked after waiting, in case it was switched off meanwhile */
let alive = false;

migratePluginSettings("FakeMessages", "CustomPluginFakeMessages");

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export default definePlugin({
    name: "FakeMessages",
    description: "Add a message to any conversation that nobody sent. Choose who it is from, what it says and when. Nothing is sent to Discord and nobody else sees it.",
    tags: ["Chat", "Utility"],
    authors: [{ name: "reqon", id: 497562304498368513n }],

    settings,

    /** One line for Additional Settings: how many there are */
    hubSummary() {
        const n = total();
        return n ? `${plural(n, "fake message")} in ${plural(chats(), "conversation")}` : "No fake messages yet";
    },

    settingsAboutComponent: () => (
        <About
            icon={ChatAddIcon}
            title="Add messages nobody sent"
            steps={[
                <>Right-click a message and choose <strong>Add Fake Message Here</strong>, or right-click a DM or channel and choose <strong>Add Fake Message</strong>.</>,
                <>Right-click a fake message for <strong>Edit Fake Message</strong>, <strong>Forward</strong> and <strong>Remove Fake Message</strong>. Editing needs Inspect Messages on.</>,
                <>Discord's own Edit and Delete work on it too. A reply to it is sent as a normal message.</>
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
        // and not waiting is what lets switching back on happen at once. A start that comes
        // while that first read is still going waits for the same read.
        alive = true;
        const reading = load();
        if (reading) {
            await reading;

            // Switched off again while the list was being read, so it stays off - and if
            // another start already finished in the meantime, there is nothing left to do.
            if (!alive || isRunning()) return;
        }
        setRunning(true);
        startNative();

        // Added once and left: Vencord has no way to take an interceptor back off, so a
        // second start would stack another copy and every page would be processed twice.
        if (!interceptorRegistered) {
            interceptorRegistered = true;
            FluxDispatcher.addInterceptor(interceptor);
        }

        // Whatever is already loaded was loaded before this started, so nothing has spliced
        // anything into it. Everything else gets them as its pages arrive.
        showLoaded(SelectedChannelStore.getChannelId());
    },

    stop() {
        alive = false;
        // Off the screen, still on the list - stopping should leave the conversation as
        // Discord has it, and starting again should bring them back.
        setRunning(false);
        stopNative();
        takeAllOffScreen();
    }
});
