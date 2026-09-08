/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";

import { findGroupChildrenByChildId, NavContextMenuPatchCallback } from "@api/ContextMenu";
import { migratePluginSettings } from "@api/Settings";
import definePlugin from "@utils/types";
import { Channel, Message, User } from "@vencord/discord-types";
import { ChannelStore, FluxDispatcher, Menu, SelectedChannelStore } from "@webpack/common";

import { settings } from "./settings";
import { GatedIcon, isShiftHeldForMenu, shiftGated, startShiftTracking, stopShiftTracking } from "./shiftGate";
import {
    catchUpAll,
    hasHidesIn,
    hideChannel,
    hideMessage,
    hideRange,
    interceptor,
    onChannelSelect,
    showChannel,
    startStore,
    stopStore,
    trackNewMessage
} from "./store";

const HideIcon: GatedIcon = ({ height = 20, width = 20, className, innerRef }) => (
    <svg ref={innerRef} viewBox="0 0 24 24" height={height} width={width} className={className}>
        <path
            fill="currentColor"
            d="M2.7 3.4 21.3 22l1.4-1.4-3.3-3.3A12.5 12.5 0 0 0 23 12s-4-7-11-7a10.7 10.7 0 0 0-4.7 1.1L4.1 2 2.7 3.4Zm6.1 6.1 5.7 5.7a4 4 0 0 1-5.7-5.7Z"
        />
        <path
            fill="currentColor"
            d="M12 19c-7 0-11-7-11-7a13.4 13.4 0 0 1 3.6-4.2l2.9 2.9a4 4 0 0 0 5.8 5.8l2.4 2.4A11 11 0 0 1 12 19Z"
        />
    </svg>
);

const ShowIcon: GatedIcon = ({ height = 20, width = 20, className, innerRef }) => (
    <svg ref={innerRef} viewBox="0 0 24 24" height={height} width={width} className={className}>
        <path
            fill="currentColor"
            d="M12 5C5 5 1 12 1 12s4 7 11 7 11-7 11-7-4-7-11-7Zm0 12a5 5 0 1 1 0-10 5 5 0 0 1 0 10Zm0-2a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"
        />
    </svg>
);

const ShiftHideIcon = shiftGated(HideIcon);

let interceptorRegistered = false;

/** First half of a range selection: the message "Select From Here" was used on */
let anchor: { channelId: string; messageId: string; } | null = null;

const shouldOffer = () => {
    const mode = settings.store.button;
    return mode !== "never" && (mode !== "shift" || isShiftHeldForMenu());
};

// Built fresh on every right click, so it can just read the live Shift state: nothing
// appears in the menu unless Shift is down, which keeps the menu looking untouched.
const messageCtx: NavContextMenuPatchCallback = (children, { message }: { message: Message; }) => {
    if (!message || !settings.store.messageMenu || !shouldOffer()) return;

    const channelId = message.channel_id;

    children.push(
        <Menu.MenuItem
            id="vc-chm-message"
            key="vc-chm-message"
            label="Hide Message"
            icon={HideIcon}
            leadingAccessory={{ type: "icon", icon: HideIcon }}
            action={() => hideMessage(channelId, message.id)}
        />
    );

    const armed = anchor?.channelId === channelId;

    children.push(
        <Menu.MenuItem
            id="vc-chm-range"
            key="vc-chm-range"
            label={armed ? "Hide To Here" : "Select From Here"}
            icon={HideIcon}
            leadingAccessory={{ type: "icon", icon: HideIcon }}
            action={() => {
                if (!armed) {
                    anchor = { channelId, messageId: message.id };
                    return;
                }

                hideRange(channelId, anchor!.messageId, message.id);
                anchor = null;
            }}
        />
    );

    if (armed) {
        children.push(
            <Menu.MenuItem
                id="vc-chm-range-cancel"
                key="vc-chm-range-cancel"
                label="Cancel Selection"
                icon={ShowIcon}
                leadingAccessory={{ type: "icon", icon: ShowIcon }}
                action={() => void (anchor = null)}
            />
        );
    }
};

function channelEntry(channelId: string) {
    // covers both a wholesale hidden channel and individually hidden messages in it
    const hidden = hasHidesIn(channelId);
    const Icon = hidden ? ShowIcon : HideIcon;

    return (
        <Menu.MenuItem
            id="vc-chm-channel"
            key="vc-chm-channel"
            label={hidden ? "View Messages" : "Hide Messages"}
            icon={Icon}
            leadingAccessory={{ type: "icon", icon: Icon }}
            action={() => hidden ? showChannel(channelId) : hideChannel(channelId)}
        />
    );
}

/**
 * Work out which conversation a menu is about.
 *
 * Right clicking a channel hands us one directly. Right clicking a person often doesn't,
 * and in the friends list there is no open channel to fall back on either, so their DM is
 * looked up from the user instead.
 */
function resolveChannelId(channel?: Channel, user?: User) {
    return channel?.id
        ?? (user && ChannelStore.getDMFromUserId(user.id))
        ?? SelectedChannelStore.getChannelId();
}

/** Drop the entry in next to View Icon / View Avatar, or at the end if neither is there */
function placeEntry(children: any[], channelId: string) {
    const item = channelEntry(channelId);

    const group = findGroupChildrenByChildId(["view-icon", "view-avatar"], children);
    if (!group) {
        children.push(item);
        return;
    }

    const at = group.findIndex(c => c?.props?.id === "view-icon" || c?.props?.id === "view-avatar");
    group.splice(at + 1, 0, item);
}

/** Right-clicking a DM or channel in the sidebar */
const channelCtx: NavContextMenuPatchCallback = (children, { channel }: { channel?: Channel; }) => {
    if (!settings.store.channelMenu) return;

    const channelId = resolveChannelId(channel);
    if (channelId) placeEntry(children, channelId);
};

/** Right-clicking a person, in the friends list or anywhere else */
const userCtx: NavContextMenuPatchCallback = (children, { channel, user }: { channel?: Channel; user?: User; }) => {
    if (!settings.store.userMenu) return;

    const channelId = resolveChannelId(channel, user);
    if (channelId) placeEntry(children, channelId);
};

/** The ... menu on someone's profile, which hands us a user rather than a channel */
const profileCtx: NavContextMenuPatchCallback = (children, { user }: { user?: User; }) => {
    if (!settings.store.profileMenu) return;

    const channelId = resolveChannelId(undefined, user);
    if (!channelId) return;

    children.push(channelEntry(channelId));
};

migratePluginSettings("CustomPluginHideMessages", "CustomHideMessages", "HideMessages");

export default definePlugin({
    name: "CustomPluginHideMessages",
    description: "Hide a message, a range of them, or a whole channel's history, in your own client only. Hold Shift to reveal the buttons. Nothing is deleted and nobody else is affected.",
    tags: ["Chat", "Appearance"],
    authors: [{ name: "reqon", id: 0n }],

    settings,

    contextMenus: {
        "message": messageCtx,
        "channel-context": channelCtx,
        "gdm-context": channelCtx,
        "thread-context": channelCtx,
        "user-context": userCtx,
        "user-profile-actions": profileCtx,
        "user-profile-overflow-menu": profileCtx
    },

    flux: {
        MESSAGE_CREATE({ message }: { message: Message; }) {
            trackNewMessage(message);
        },
        CHANNEL_SELECT({ channelId }: { channelId: string | null; }) {
            // a channel unhidden while you weren't looking reloads when you open it
            onChannelSelect(channelId);
        },
        CONNECTION_OPEN() {
            // Discord refetches the open channel whenever the gateway comes up, including
            // the very first time, which is the same moment plugins are allowed to start.
            // Re-applying here is what makes a restart come back already hidden.
            catchUpAll();
        }
    },

    messagePopoverButton: {
        icon: HideIcon,
        render(msg) {
            const mode = settings.store.button;
            if (mode === "never") return null;

            return {
                label: "Hide Message",
                icon: mode === "shift" ? ShiftHideIcon : HideIcon,
                message: msg,
                channel: ChannelStore.getChannel(msg.channel_id),
                onClick: () => hideMessage(msg.channel_id, msg.id)
            };
        }
    },

    async start() {
        startShiftTracking();

        // Registered before the store is read, not after: reading it is asynchronous, and
        // a channel that finishes loading in the meantime has to be seen. Flux has no
        // removeInterceptor, so this is registered once for the session and gated inside
        // the store instead.
        if (!interceptorRegistered) {
            interceptorRegistered = true;
            FluxDispatcher.addInterceptor(interceptor);
        }

        await startStore();
    },

    stop() {
        anchor = null;
        stopShiftTracking();
        stopStore();
    }
});
