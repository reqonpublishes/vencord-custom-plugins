/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

/**
 * Load a chat again, so what is on screen matches a change made to how its messages read.
 *
 * Shared by the plugins that change messages as they load: a change only reaches a chat that is
 * already loaded once Discord loads it again. Emptying the loaded messages first is what makes
 * the next load a real one; both of Discord's loaders are asked, since either can decline.
 */

import { Logger } from "@utils/Logger";
import { findByPropsLazy } from "@webpack";
import { FluxDispatcher, SelectedChannelStore } from "@webpack/common";

const logger = new Logger("Chat");

const Loaders = [
    findByPropsLazy("fetchMessages", "jumpToPresent"),
    findByPropsLazy("fetchMessages"),
    findByPropsLazy("jumpToPresent")
];

function callLoader(method: "fetchMessages" | "jumpToPresent", channelId: string) {
    for (const loader of Loaders) {
        try {
            const target: any = loader;
            if (typeof target?.[method] !== "function") continue;

            if (method === "fetchMessages") target.fetchMessages({ channelId, limit: 50 });
            else target.jumpToPresent(channelId, 50);
            return true;
        } catch { /* not on this build, keep looking */ }
    }

    return false;
}

export function reloadChat(channelId: string) {
    try {
        FluxDispatcher.dispatch({
            type: "LOAD_MESSAGES_SUCCESS",
            channelId,
            messages: [],
            isBefore: false,
            isAfter: false,
            hasMoreBefore: true,
            hasMoreAfter: false,
            limit: 50
        } as any);
    } catch (e) {
        logger.error("Could not empty the chat", e);
    }

    // Only the chat on screen needs loading now; any other loads itself, changed, when opened.
    if (SelectedChannelStore.getChannelId() !== channelId) return;

    const jumped = callLoader("jumpToPresent", channelId);
    const fetched = callLoader("fetchMessages", channelId);
    if (!jumped && !fetched) logger.warn("Could not find Discord's message loader - open the chat again to see the change");
}
