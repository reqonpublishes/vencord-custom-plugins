/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./shared.css";
import "./styles.css";

import { NavContextMenuPatchCallback } from "@api/ContextMenu";
import definePlugin from "@utils/types";
import { Channel, Message, User } from "@vencord/discord-types";
import { ChannelStore, Menu } from "@webpack/common";

import { ClockIcon, CloseIcon, FlagIcon } from "./icons";
import { place } from "./menu";
import { settings } from "./settings";
import { covers, isWhole, load, movedChats, movesOf, shiftOf, start, stop } from "./store";
import { openFakeTime } from "./TimeModal";
import { About } from "./ui";

const item = (id: string, label: string, icon: any, action: () => void) => (
    <Menu.MenuItem
        id={id}
        key={id}
        label={label}
        icon={icon}
        leadingAccessory={{ type: "icon", icon }}
        action={action}
    />
);

const entry = (channelId: string) =>
    item("vc-cft-time", shiftOf(channelId) ? "Change Fake Time" : "Fake Time", ClockIcon, () => openFakeTime(channelId));

const channelCtx: NavContextMenuPatchCallback = (children, { channel }: { channel?: Channel; }) => {
    if (!channel?.id || !settings.store.channelMenu || channel.type === 4) return;
    place(children, 58, entry(channel.id));
};

const userCtx: NavContextMenuPatchCallback = (children, { user, channel }: { user?: User; channel?: Channel; }) => {
    if (!settings.store.userMenu) return;
    const channelId = channel?.id ?? (user && ChannelStore.getDMFromUserId(user.id));
    if (channelId) place(children, 58, entry(channelId));
};

/** First half of picking a part: the message "Fake Time From Here" was used on */
let anchor: { channelId: string; messageId: string; } | null = null;

/** Ids are numbers too long for a plain number: shorter is older, then the digits decide */
const older = (a: string, b: string) => a.length !== b.length ? a.length < b.length : a < b;

// The same two steps as Hide Messages' From Here / Up To Here, so a part is picked one way everywhere.
const messageCtx: NavContextMenuPatchCallback = (children, { message }: { message?: Message; }) => {
    if (!message?.id || !settings.store.messageMenu) return;

    const channelId = message.channel_id;
    const armed = anchor?.channelId === channelId;

    // a part this message is already in opens straight away
    const part = !armed && movesOf(channelId).filter(move => !isWhole(move) && covers(move, message.id)).at(-1);
    if (part) place(children, 58, item("vc-cft-part", "Change Fake Time", ClockIcon, () => openFakeTime(channelId, { from: part.from, to: part.to })));

    place(children, 59, item("vc-cft-range", armed ? "Fake Time Up To Here" : "Fake Time From Here...", armed ? ClockIcon : FlagIcon, () => {
        if (!armed) {
            anchor = { channelId, messageId: message.id };
            return;
        }

        // picked in either order: the older one is where the part starts
        const [from, to] = older(message.id, anchor!.messageId) ? [message.id, anchor!.messageId] : [anchor!.messageId, message.id];
        anchor = null;
        openFakeTime(channelId, { from, to });
    }));

    if (armed) place(children, 60, item("vc-cft-range-cancel", "Cancel Selection", CloseIcon, () => void (anchor = null)));
};

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export default definePlugin({
    name: "FakeTime",
    description: "Move a conversation, or part of one, to another time.",
    authors: [{ name: "reqon", id: 497562304498368513n }],

    settings,

    /** One line for Additional Settings */
    hubSummary() {
        const n = movedChats().length;
        return n ? `${plural(n, "conversation")} moved` : "";
    },

    settingsAboutComponent: () => (
        <About
            menus
            icon={ClockIcon}
            title="Move a conversation in time"
            steps={[
                <>Right-click a DM, a channel or a person, open <strong>Fake Options</strong> and choose <strong>Fake Time</strong> to move the whole conversation.</>,
                <>To move part of it, right-click its first message and choose <strong>Fake Time From Here...</strong>, then its last and choose <strong>Fake Time Up To Here</strong>.</>,
                <>Set when the latest or first message was sent. The others move with it, the gaps between them kept, fake messages and calls included.</>
            ]}
        />
    ),

    contextMenus: {
        "channel-context": channelCtx,
        "gdm-context": channelCtx,
        "thread-context": channelCtx,
        "user-context": userCtx,
        "message": messageCtx
    },

    async start() {
        await load();
        start();
    },

    stop
});
