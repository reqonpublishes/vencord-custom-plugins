/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { findGroupChildrenByChildId, NavContextMenuPatchCallback } from "@api/ContextMenu";
import { Logger } from "@utils/Logger";
import definePlugin from "@utils/types";
import { User } from "@vencord/discord-types";
import { findByPropsLazy } from "@webpack";
import { React, showToast, UserStore } from "@webpack/common";

const logger = new Logger("QuietDMs");
const ChannelActions = findByPropsLazy("openPrivateChannel", "ensurePrivateChannel");

/**
 * Open the DM with somebody in the sidebar, and stay where you are.
 *
 * Discord's own Message opens the DM and goes to it; for going down a list of friends one by
 * one, that is a trip back and a scroll each time. getOrEnsurePrivateChannel is the half that
 * opens it - the DM appears in the sidebar, closed ones reopened - without the going.
 */
function openQuietly(userId?: string) {
    if (!userId) return;
    const name = UserStore.getUser(userId)?.globalName ?? UserStore.getUser(userId)?.username ?? "them";

    Promise.resolve((ChannelActions as any).getOrEnsurePrivateChannel(userId))
        .then(() => showToast({ text: `DM with ${name} opened`, variant: "success" }))
        .catch((e: unknown) => {
            logger.error("Could not open the DM", e);
            showToast({ text: `Could not open the DM with ${name}`, variant: "critical" });
        });
}

// The right-click menu's Message, on a person: opens the DM without leaving the page
const userCtx: NavContextMenuPatchCallback = (children, { user }: { user?: User; }) => {
    if (!user?.id) return;

    const group = findGroupChildrenByChildId("message-user", children);
    const at = group?.findIndex(child => child?.props?.id === "message-user") ?? -1;
    if (!group || at === -1) return;

    group[at] = React.cloneElement(group[at]!, { action: () => openQuietly(user.id) });
};

export default definePlugin({
    name: "QuietDMs",
    description: "Message opens the DM in the sidebar without leaving the page you are on.",
    authors: [{ name: "reqon", id: 497562304498368513n }],

    patches: [
        {
            // The chat button on a row of the Friends list
            find: "peopleListItemRef=",
            replacement: {
                match: /handleMessageClick=(\i)=>\{/,
                replace: "handleMessageClick=$1=>{if($self.quiet($1,this.props.user))return;"
            }
        }
    ],

    quiet(event: any, user?: User) {
        event?.stopPropagation?.();
        openQuietly(user?.id);
        return true;
    },

    contextMenus: {
        "user-context": userCtx
    }
});
