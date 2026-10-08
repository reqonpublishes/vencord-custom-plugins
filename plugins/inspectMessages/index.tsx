/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./shared.css";
import "./styles.css";

import { NavContextMenuPatchCallback } from "@api/ContextMenu";
import { migratePluginSettings } from "@api/Settings";
import { Logger } from "@utils/Logger";
import definePlugin from "@utils/types";
import { Message } from "@vencord/discord-types";
import { ChannelStore, FluxDispatcher, Menu, SelectedChannelStore } from "@webpack/common";

import {
    countEdits,
    hasEdits,
    loadEdits,
    noteSearch,
    patchRawMessage,
    patchRawMessages,
    patchSearch,
    reapplyChannel,
    restoreVisuals,
    startStyles,
    stopStyles
} from "./edits";
import { InspectIcon as InspectGlyph } from "./icons";
import { openInspectModal } from "./InspectModal";
import { isShared, place } from "./menu";
import { settings } from "./settings";
import { GatedIcon, isShiftHeldForMenu, shiftGated, startShiftTracking, stopShiftTracking } from "./shiftGate";
import { About } from "./ui";

const InspectIcon: GatedIcon = InspectGlyph;

const ShiftInspectIcon = shiftGated(InspectIcon);

const logger = new Logger("InspectMessages");

let enabled = false;

/** Whether the plugin is meant to be on. Checked after waiting, in case it was switched off meanwhile */
let alive = false;
let interceptorRegistered = false;

/**
 * Rewrite messages as they arrive, before any store or component sees them.
 *
 * Doing it here rather than after the fact is what makes edits look native: the first
 * paint of a channel already has them, so there's no frame where the real message shows
 * through. This runs for every dispatched action, so the no-edits case costs two checks.
 */
function interceptor(action: any) {
    // Noted even with nothing edited yet: the edit may come before the results do.
    if (action?.type === "SEARCH_RESULTS_QUERY_UPDATE") noteSearch(action);

    if (!enabled || !hasEdits()) return false;

    switch (action.type) {
        case "SEARCH_MESSAGES_SUCCESS":
            try {
                patchSearch(action);
            } catch (e) {
                logger.error("Could not apply edits to a search", e);
            }
            break;
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

    place(children, 15, item);
};

migratePluginSettings("InspectMessages", "CustomPluginInspectMessages", "CustomPluginQuickInspect", "CustomQuickInspect", "QuickInspect");

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export default definePlugin({
    name: "InspectMessages",
    description: "Change what any message says, when it was sent and whether it shows as edited. Hold Shift to reveal the buttons. Nothing is sent to Discord and nobody else sees it.",
    tags: ["Chat", "Utility"],
    authors: [{ name: "reqon", id: 497562304498368513n }],
    dependencies: ["MessageUpdaterAPI"],

    settings,

    /** One line for Additional Settings: how many messages read differently */
    hubSummary() {
        const n = countEdits();
        return n ? plural(n, "changed message") : "No changed messages yet";
    },

    settingsAboutComponent: () => (
        <About
            icon={InspectGlyph}
            title="Change how a message looks to you"
            steps={[
                <>Hold <kbd>Shift</kbd> and hover a message, or right-click it, and choose <strong>Inspect Message</strong>.</>,
                <>Change the text, the time it was sent, the edited tag or the mention highlight.</>,
                <>Open it again and press <strong>Revert</strong> to put the real message back.</>
            ]}
        />
    ),

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
                icon: mode === "shift" || isShared() ? ShiftInspectIcon : InspectIcon,
                message,
                channel: ChannelStore.getChannel(message.channel_id),
                onClick: () => openInspectModal(message)
            };
        }
    },

    async start() {
        startShiftTracking();
        startStyles();

        alive = true;
        await loadEdits();

        // Switched off again while the edits were being read, so it stays off.
        if (!alive) return;

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
        alive = false;
        enabled = false;
        stopShiftTracking();
        stopStyles();
        // put messages back as they really are, but keep the saved edits for when it's re-enabled
        restoreVisuals();
    }
});
