/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./shared.css";
import "./styles.css";

import { NavContextMenuPatchCallback } from "@api/ContextMenu";
import definePlugin from "@utils/types";
import { Channel, User } from "@vencord/discord-types";
import { ChannelStore, Menu } from "@webpack/common";

import { ClockIcon } from "./icons";
import { place } from "./menu";
import { settings } from "./settings";
import { load, shifted, shiftOf, start, stop } from "./store";
import { openFakeTime } from "./TimeModal";
import { About } from "./ui";

const entry = (channelId: string) => (
    <Menu.MenuItem
        id="vc-cft-time"
        key="vc-cft-time"
        label={shiftOf(channelId) ? "Change Fake Time" : "Fake Time"}
        icon={ClockIcon}
        leadingAccessory={{ type: "icon", icon: ClockIcon }}
        action={() => openFakeTime(channelId)}
    />
);

const channelCtx: NavContextMenuPatchCallback = (children, { channel }: { channel?: Channel; }) => {
    if (!channel?.id || !settings.store.channelMenu || channel.type === 4) return;
    place(children, 58, entry(channel.id));
};

const userCtx: NavContextMenuPatchCallback = (children, { user, channel }: { user?: User; channel?: Channel; }) => {
    if (!settings.store.userMenu) return;
    const channelId = channel?.id ?? (user && ChannelStore.getDMFromUserId(user.id));
    if (channelId) place(children, 58, entry(channelId));
};

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export default definePlugin({
    name: "FakeTime",
    description: "Move a conversation to another time.",
    authors: [{ name: "reqon", id: 497562304498368513n }],

    settings,

    /** One line for Additional Settings */
    hubSummary() {
        const n = shifted().length;
        return n ? `${plural(n, "conversation")} moved` : "";
    },

    settingsAboutComponent: () => (
        <About
            menus
            icon={ClockIcon}
            title="Move a conversation in time"
            steps={[
                <>Right-click a DM, a channel or a person, open <strong>Fake Options</strong> and choose <strong>Fake Time</strong>.</>,
                <>Set when the latest message was sent. Every other message moves with it, the gaps between them kept.</>,
                <>Fake messages and calls in that chat move too, so you only set it once.</>
            ]}
        />
    ),

    contextMenus: {
        "channel-context": channelCtx,
        "gdm-context": channelCtx,
        "thread-context": channelCtx,
        "user-context": userCtx
    },

    async start() {
        await load();
        start();
    },

    stop
});
