/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";

import { findGroupChildrenByChildId, NavContextMenuPatchCallback } from "@api/ContextMenu";
import { migratePluginSettings } from "@api/Settings";
import definePlugin from "@utils/types";
import { Message } from "@vencord/discord-types";
import { ChannelStore, FluxDispatcher, Menu, SelectedChannelStore } from "@webpack/common";

import { hasEdits, loadEdits, patchRawMessage, patchRawMessages, reapplyChannel, restoreVisuals, startStyles, stopStyles } from "./edits";
import { openInspectModal } from "./InspectModal";
import { settings } from "./settings";
import { GatedIcon, isShiftHeldForMenu, shiftGated, startShiftTracking, stopShiftTracking } from "./shiftGate";

const InspectIcon: GatedIcon = ({ height = 20, width = 20, className, innerRef }) => (
    <svg ref={innerRef} viewBox="0 0 24 24" height={height} width={width} className={className}>
        <path
            fill="currentColor"
            d="M5 3h3v2H6a1 1 0 0 0-1 1v2H3V5a2 2 0 0 1 2-2Zm14 0a2 2 0 0 1 2 2v3h-2V6a1 1 0 0 0-1-1h-2V3h3ZM5 16v2a1 1 0 0 0 1 1h2v2H5a2 2 0 0 1-2-2v-3h2Z"
        />
        <path
            fill="currentColor"
            d="M9.7 7.2a1 1 0 0 0-1.3 1.2l3.4 10.2a1 1 0 0 0 1.8.1l1.7-3.4 3.4-1.7a1 1 0 0 0-.1-1.8L9.7 7.2Z"
        />
    </svg>
);

const ShiftInspectIcon = shiftGated(InspectIcon);

let enabled = false;
let interceptorRegistered = false;

/**
 * Rewrite messages as they arrive, before any store or component sees them.
 *
 * Doing it here rather than after the fact is what makes edits look native: the first
 * paint of a channel already has them, so there's no frame where the real message shows
 * through. This runs for every dispatched action, so the no-edits case costs two checks.
 */
function interceptor(action: any) {
    if (!enabled || !hasEdits()) return false;

    switch (action.type) {
        case "LOAD_MESSAGES_SUCCESS":
            patchRawMessages(action.messages);
            break;
        // a brand new message can never be one we've already edited, so MESSAGE_CREATE
        // is deliberately not handled here
        case "MESSAGE_UPDATE":
            patchRawMessage(action.message);
            break;
    }

    return false;
}

const shouldOffer = () => {
    const mode = settings.store.button;
    return mode !== "never" && (mode !== "shift" || isShiftHeldForMenu());
};

// Built when the menu opens, reading the Shift state as it was at that moment, so nothing
// appears unless Shift was down and nothing shifts around while the menu sits open.
const messageCtx: NavContextMenuPatchCallback = (children, { message }: { message: Message; }) => {
    if (!message || !settings.store.messageMenu || !shouldOffer()) return;

    const item = (
        <Menu.MenuItem
            id="vc-cim-inspect"
            key="vc-cim-inspect"
            label="Inspect Message"
            icon={InspectIcon}
            leadingAccessory={{ type: "icon", icon: InspectIcon }}
            action={() => openInspectModal(message)}
        />
    );

    // sits just above Copy Message ID, at the bottom with the other developer-ish entries
    const group = findGroupChildrenByChildId("devmode-copy-id", children, true);
    const at = group?.findIndex(c => c?.props?.id?.startsWith("devmode-copy-id")) ?? -1;

    if (group && at !== -1) group.splice(at, 0, item);
    else children.push(item);
};

migratePluginSettings("CustomPluginInspectMessages", "CustomPluginQuickInspect", "CustomQuickInspect", "QuickInspect");

export default definePlugin({
    name: "CustomPluginInspectMessages",
    description: "Rewrite any message's text, timestamp and edited marker, in your own client only. Hold Shift to reveal the buttons. Nothing is sent to Discord and nobody else sees it.",
    tags: ["Chat", "Utility"],
    authors: [{ name: "reqon", id: 0n }],
    dependencies: ["MessageUpdaterAPI"],

    settings,

    contextMenus: {
        "message": messageCtx
    },

    messagePopoverButton: {
        icon: InspectIcon,
        render(message: Message) {
            const mode = settings.store.button;
            if (mode === "never") return null;

            return {
                label: "Inspect",
                icon: mode === "shift" ? ShiftInspectIcon : InspectIcon,
                message,
                channel: ChannelStore.getChannel(message.channel_id),
                onClick: () => openInspectModal(message)
            };
        }
    },

    async start() {
        startShiftTracking();
        startStyles();

        await loadEdits();
        enabled = true;

        // Flux has no removeInterceptor, so this is registered once for the session and
        // gated on `enabled` instead.
        if (!interceptorRegistered) {
            interceptorRegistered = true;
            FluxDispatcher.addInterceptor(interceptor);
        }

        // messages already on screen when the plugin starts predate the interceptor
        const channelId = SelectedChannelStore.getChannelId();
        if (channelId && hasEdits()) reapplyChannel(channelId);
    },

    stop() {
        enabled = false;
        stopShiftTracking();
        stopStyles();
        // put messages back as they really are, but keep the saved edits for when it's re-enabled
        restoreVisuals();
    }
});
