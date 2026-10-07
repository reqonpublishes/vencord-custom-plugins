/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";

import { NavContextMenuPatchCallback } from "@api/ContextMenu";
import { Logger } from "@utils/Logger";
import definePlugin from "@utils/types";
import { User } from "@vencord/discord-types";
import { findByPropsLazy } from "@webpack";
import { FluxDispatcher, Menu, RelationshipStore, UserStore } from "@webpack/common";

import { settings } from "./settings";
import {
    addFakeFriend, BLOCKED, blockUser, clearRequest, dismissRequest, FRIEND, hideFriend, isBlocked,
    isFriended, isHidden, isIncoming, isPending, load, PENDING_INCOMING, reapply, receiveRequest,
    removeFakeFriend, restoreEverything, sendRequest, showFriend, unblockUser
} from "./store";

const logger = new Logger("CustomPluginHideFriends");

const Actions = findByPropsLazy("addRelationship", "removeRelationship");

/** What the relationship really is, read past anything this client is pretending */
const typeOf = (id: string): number => {
    try {
        return (RelationshipStore as any).getRelationshipType?.(id) ?? 0;
    } catch {
        return 0;
    }
};

const userCtx: NavContextMenuPatchCallback = (children, { user }: { user?: User; }) => {
    if (!user || !settings.store.userMenu) return;

    const { id } = user;
    if (id === UserStore.getCurrentUser()?.id) return;

    const items: any[] = [];
    const type = typeOf(id);

    // Each entry is offered only where it would do something, so the menu reads as what can
    // be done to this person rather than as a list to be worked out.
    if (isHidden(id)) {
        items.push(<Menu.MenuItem id="vc-chf-show" key="show" label="Show Friend" action={() => showFriend(id)} />);
    } else if (type === FRIEND && !isFriended(id)) {
        items.push(<Menu.MenuItem id="vc-chf-hide" key="hide" label="Hide Friend" action={() => hideFriend(id)} />);
    }

    if (isBlocked(id)) {
        items.push(<Menu.MenuItem id="vc-chf-unblock" key="unblock" label="Unblock Here" action={() => unblockUser(id)} />);
    } else if (type !== BLOCKED) {
        items.push(<Menu.MenuItem id="vc-chf-block" key="block" label="Block Here Only" action={() => blockUser(id)} />);
    }

    if (isIncoming(id) || isPending(id)) {
        items.push(<Menu.MenuItem id="vc-chf-clear" key="clear" label="Remove Pretend Request" action={() => clearRequest(id)} />);
    } else if (type !== FRIEND || isHidden(id)) {
        items.push(
            <Menu.MenuItem id="vc-chf-receive" key="receive" label="Pretend They Sent a Request" action={() => receiveRequest(id)} />,
            <Menu.MenuItem id="vc-chf-send" key="send" label="Pretend You Sent a Request" action={() => sendRequest(id)} />
        );
    }

    if (isFriended(id)) {
        items.push(<Menu.MenuItem id="vc-chf-unfriend" key="unfriend" label="Remove Pretend Friend" action={() => removeFakeFriend(id)} />);
    }

    if (type === PENDING_INCOMING && !isIncoming(id)) {
        items.push(<Menu.MenuItem id="vc-chf-dismiss" key="dismiss" label="Hide Their Request" action={() => dismissRequest(id)} />);
    }

    if (!items.length) return;

    // One entry that opens, rather than five beside each other: these are all the same kind
    // of thing, and five more rows on every person is a menu nobody can find anything in.
    children.push(
        <Menu.MenuItem id="vc-chf-menu" key="vc-chf-menu" label="Only For Me">
            {items}
        </Menu.MenuItem>
    );
};

/** Who an action is about, however it was handed over */
const idIn = (target: any): string | undefined =>
    typeof target === "string" ? target : target?.userId ?? target?.id;

let realAdd: any = null;
let realRemove: any = null;

/**
 * Keep anything pretended from ever reaching Discord.
 *
 * The rows are real as far as this client is concerned, which is the point - and it means
 * Accept, Decline, Cancel and Unblock are real buttons that would go and do something about a
 * request nobody sent or a block that does not exist. Accepting a pretended request would
 * send them a real one, which is the one outcome a pretence must never have.
 *
 * So they are answered here instead, the way the real thing would look from this side.
 */
function guard() {
    const actions: any = Actions;
    if (!actions?.addRelationship || realAdd) return;

    realAdd = actions.addRelationship;
    realRemove = actions.removeRelationship;

    actions.addRelationship = function (this: any, ...args: any[]) {
        const id = idIn(args[0]);
        const type = args[0]?.type;

        // Blocking and ignoring go through here too, and those are real things to ask for.
        if (!id || (type != null && type !== FRIEND)) return realAdd.apply(this, args);

        if (isIncoming(id)) {
            clearRequest(id);

            // Hidden: the friendship is real and only this client said otherwise, so
            // accepting means showing it again rather than inventing a second one.
            if (isHidden(id)) showFriend(id);
            else addFakeFriend(id);

            return Promise.resolve();
        }

        if (isHidden(id)) {
            showFriend(id);
            return Promise.resolve();
        }

        return realAdd.apply(this, args);
    };

    actions.removeRelationship = function (this: any, ...args: any[]) {
        const id = idIn(args[0]);
        if (!id) return realRemove.apply(this, args);

        if (isPending(id) || isIncoming(id)) {
            clearRequest(id);
            return Promise.resolve();
        }

        if (isFriended(id)) {
            removeFakeFriend(id);
            return Promise.resolve();
        }

        // Only this client thinks they are blocked. Letting it through would remove the real
        // friendship underneath, which is what removeRelationship does to a friend.
        if (isBlocked(id)) {
            unblockUser(id);
            return Promise.resolve();
        }

        return realRemove.apply(this, args);
    };
}

function unguard() {
    const actions: any = Actions;
    if (!realAdd || !actions) return;

    actions.addRelationship = realAdd;
    actions.removeRelationship = realRemove;
    realAdd = null;
    realRemove = null;
}

/** Discord rebuilds its relationships on every reconnect, so everything is said again */
const afterConnect = () => {
    // Out of the dispatch this is riding on: saying it again is dispatches of our own, and
    // none of those can happen inside another.
    setTimeout(reapply, 0);
};

export default definePlugin({
    name: "CustomPluginHideFriends",
    description: "Show a friend as not added, or everybody at once, in your own client only. Also block someone here only, or pretend a request was sent or received. The real friendship is never touched and nobody is told.",
    tags: ["Friends", "Appearance"],
    authors: [{ name: "reqon", id: 0n }],

    settings,

    contextMenus: {
        "user-context": userCtx
    },

    async start() {
        await load();

        try {
            guard();
        } catch (e) {
            logger.error("Could not guard the relationship actions", e);
        }

        reapply();
        FluxDispatcher.subscribe("CONNECTION_OPEN", afterConnect);
    },

    stop() {
        FluxDispatcher.unsubscribe("CONNECTION_OPEN", afterConnect);
        unguard();

        // Back as Discord has it, still on the list - switching the plugin off should give
        // everybody back without forgetting who you had put away.
        restoreEverything(false);
    }
});
