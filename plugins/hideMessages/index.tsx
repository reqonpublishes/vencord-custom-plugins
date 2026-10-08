/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./shared.css";
import "./styles.css";

import { NavContextMenuPatchCallback } from "@api/ContextMenu";
import { migratePluginSettings } from "@api/Settings";
import definePlugin from "@utils/types";
import { Channel, Message, User } from "@vencord/discord-types";
import { ChannelStore, FluxDispatcher, Menu, SelectedChannelStore } from "@webpack/common";

import { CloseIcon, EyeIcon, EyeOffIcon, FlagIcon } from "./icons";
import { isShared, place } from "./menu";
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
    stats,
    stopStore
} from "./store";
import { About } from "./ui";

const HideIcon: GatedIcon = EyeOffIcon;
const ShowIcon: GatedIcon = EyeIcon;

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

    place(children, 10,
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

    place(children, 11,
        <Menu.MenuItem
            id="vc-chm-range"
            key="vc-chm-range"
            label={armed ? "Hide Up To Here" : "Hide From Here..."}
            icon={armed ? HideIcon : FlagIcon}
            leadingAccessory={{ type: "icon", icon: armed ? HideIcon : FlagIcon }}
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
        place(children, 12,
            <Menu.MenuItem
                id="vc-chm-range-cancel"
                key="vc-chm-range-cancel"
                label="Cancel Selection"
                icon={CloseIcon}
                leadingAccessory={{ type: "icon", icon: CloseIcon }}
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
            label={hidden ? "Unhide Messages" : "Hide Messages"}
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

/** Right-clicking a DM or channel in the sidebar */
const channelCtx: NavContextMenuPatchCallback = (children, { channel }: { channel?: Channel; }) => {
    if (!settings.store.channelMenu) return;

    const channelId = resolveChannelId(channel);
    if (channelId) place(children, 10, channelEntry(channelId));
};

/** Right-clicking a person, in the friends list or anywhere else */
const userCtx: NavContextMenuPatchCallback = (children, { channel, user }: { channel?: Channel; user?: User; }) => {
    if (!settings.store.userMenu) return;

    const channelId = resolveChannelId(channel, user);
    if (channelId) place(children, 10, channelEntry(channelId));
};

/** The ... menu on someone's profile, which hands us a user rather than a channel */
const profileCtx: NavContextMenuPatchCallback = (children, { user }: { user?: User; }) => {
    if (!settings.store.profileMenu) return;

    const channelId = resolveChannelId(undefined, user);
    if (!channelId) return;

    place(children, 10, channelEntry(channelId));
};

migratePluginSettings("HideMessages", "CustomPluginHideMessages", "CustomHideMessages");

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export default definePlugin({
    name: "HideMessages",
    description: "Hide a message, a range of them, or a whole conversation's history. Hold Shift to reveal the buttons. Nothing is deleted and nobody else is affected.",
    tags: ["Chat", "Appearance", "Privacy"],
    authors: [{ name: "reqon", id: 497562304498368513n }],

    settings,

    /** One line for Additional Settings: what is hidden right now */
    hubSummary() {
        const { messages, ranges, channels } = stats();
        const parts = [
            messages && plural(messages, "message"),
            ranges && plural(ranges, "range"),
            channels && plural(channels, "whole conversation")
        ].filter(Boolean);

        return parts.length ? parts.join(", ") + " hidden" : "Nothing hidden yet";
    },

    settingsAboutComponent: () => (
        <About
            icon={EyeOffIcon}
            title="Hide messages from your own view"
            steps={[
                <>Hold <kbd>Shift</kbd> and hover a message, or right-click it, and choose <strong>Hide Message</strong>.</>,
                <><strong>Hide From Here...</strong> then <strong>Hide Up To Here</strong> hides everything between two messages.</>,
                <>Right-click a DM, channel or person and choose <strong>Hide Messages</strong> to hide the whole history.</>
            ]}
        />
    ),

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
                icon: mode === "shift" || isShared() ? ShiftHideIcon : HideIcon,
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
