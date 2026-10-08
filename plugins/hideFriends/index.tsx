/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./shared.css";

import { NavContextMenuPatchCallback } from "@api/ContextMenu";
import { migratePluginSettings } from "@api/Settings";
import { Logger } from "@utils/Logger";
import definePlugin from "@utils/types";
import { User } from "@vencord/discord-types";
import { findByPropsLazy } from "@webpack";
import { FluxDispatcher, Menu, RelationshipStore, UserStore } from "@webpack/common";

import {
    BlockIcon, EyeIcon, EyeOffIcon, IconComponent, PersonAddIcon, PersonIcon, PersonOffIcon, PersonRemoveIcon,
    SendIcon, UndoIcon
} from "./icons";
import { place } from "./menu";
import { unwatchMutuals, watchMutuals } from "./mutuals";
import { settings } from "./settings";
import {
    addFakeFriend,
    BLOCKED,
    blockUser,
    clearRequest,
    counts,
    dismissRequest,
    FRIEND,
    hideFriend,
    invalidate,
    isBlocked,
    isFriended,
    isHidden,
    isIncoming,
    isLoaded,
    isPending,
    load,
    PENDING_INCOMING,
    reapply,
    receiveRequest,
    removeFakeFriend,
    restoreEverything,
    sendRequest,
    showFriend,
    unblockUser
} from "./store";
import { About } from "./ui";

const logger = new Logger("HideFriends");

const Actions = findByPropsLazy("addRelationship", "removeRelationship");

/** What the relationship really is, read past anything this client is pretending */
const typeOf = (id: string): number => {
    try {
        return (RelationshipStore as any).getRelationshipType?.(id) ?? 0;
    } catch {
        return 0;
    }
};

/** One entry, with its icon on both sides of the label the way Discord draws its own */
const item = (id: string, label: string, Icon: IconComponent, action: () => void, danger = false) => (
    <Menu.MenuItem
        id={"vc-chf-" + id}
        key={id}
        label={label}
        color={danger ? "danger" : undefined}
        icon={Icon}
        leadingAccessory={{ type: "icon", icon: Icon }}
        action={action}
    />
);

const userCtx: NavContextMenuPatchCallback = (children, { user }: { user?: User; }) => {
    if (!user || !settings.store.userMenu) return;

    const { id } = user;
    if (id === UserStore.getCurrentUser()?.id) return;

    const type = typeOf(id);

    // Hiding is the thing this is for, so it sits in the menu itself. Each entry is offered
    // only where it would do something, so the menu reads as what can be done to this
    // person rather than as a list to be worked out.
    if (isHidden(id)) {
        place(children, 30, item("show", "Unhide Friend", EyeIcon, () => showFriend(id)));
    } else if (type === FRIEND && !isFriended(id)) {
        place(children, 30, item("hide", "Hide Friend", EyeOffIcon, () => hideFriend(id)));
    }

    const fakes: any[] = [];

    if (isBlocked(id)) {
        fakes.push(item("unblock", "Remove Fake Block", UndoIcon, () => unblockUser(id)));
    } else if (type !== BLOCKED) {
        fakes.push(item("block", "Fake Block", BlockIcon, () => blockUser(id)));
    }

    if (isIncoming(id) || isPending(id)) {
        fakes.push(item("clear", "Remove Fake Request", UndoIcon, () => clearRequest(id)));
    } else if (type !== FRIEND || isHidden(id)) {
        fakes.push(
            item("receive", "Fake Incoming Request", PersonAddIcon, () => receiveRequest(id)),
            item("send", "Fake Outgoing Request", SendIcon, () => sendRequest(id))
        );
    }

    if (isFriended(id)) {
        fakes.push(item("unfriend", "Remove Fake Friend", PersonRemoveIcon, () => removeFakeFriend(id)));
    }

    if (type === PENDING_INCOMING && !isIncoming(id)) {
        fakes.push(item("dismiss", "Hide Their Friend Request", PersonOffIcon, () => dismissRequest(id)));
    }

    if (!fakes.length) return;

    // The rest open from one entry rather than sitting beside each other: they are all the
    // same kind of thing, and five more rows on every person is a menu nobody can find
    // anything in.
    place(children, 35,
        <Menu.MenuItem
            id="vc-chf-menu"
            key="vc-chf-menu"
            label="Fake Relationship"
            icon={PersonIcon}
            leadingAccessory={{ type: "icon", icon: PersonIcon }}
        >
            {fakes}
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

/** Whether the plugin is meant to be on. Checked after waiting, in case it was switched off meanwhile */
let alive = false;

migratePluginSettings("HideFriends", "CustomPluginHideFriends");

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export default definePlugin({
    name: "HideFriends",
    description: "Hide friends from your friends list, one at a time or all at once. Can also fake a block, a friend request or a friendship. The real friendship is never touched and nobody is told.",
    tags: ["Friends", "Appearance", "Privacy"],
    authors: [{ name: "reqon", id: 497562304498368513n }],

    settings,

    /** One line for Additional Settings: how many people are shown differently */
    hubSummary() {
        const n = counts();
        const fake = n.blocked + n.pending + n.incoming + n.friended;
        const parts = [
            n.hidden && `${plural(n.hidden, "friend")} hidden`,
            fake && `${fake} faked`,
            n.dismissed && `${plural(n.dismissed, "request")} hidden`
        ].filter(Boolean);

        return parts.length ? parts.join(", ") : "Nobody hidden or faked yet";
    },

    settingsAboutComponent: () => (
        <About
            icon={PersonOffIcon}
            title="Hide friends, or fake a relationship"
            steps={[
                <>Right-click a friend and choose <strong>Hide Friend</strong>. They read as not added until you unhide them.</>,
                <><strong>Fake Relationship</strong> in the same menu can fake a block, an incoming or outgoing friend request, or a friendship.</>,
                <>Accept, Decline and Unblock on anything fake are answered here and never reach Discord.</>
            ]}
        />
    ),

    contextMenus: {
        "user-context": userCtx,
        // the ... menu on a profile, which hands over a person the same way
        "user-profile-actions": userCtx,
        "user-profile-overflow-menu": userCtx
    },

    /** Told by Cloud Sync that the saved copy was replaced, so the next start reads it again */
    dataChanged: invalidate,

    async start() {
        // Only the first start reads from disk. After that the list is already in memory,
        // and not waiting is what lets switching back on happen at once.
        alive = true;
        if (!isLoaded()) {
            await load();

            // Switched off again while the list was being read, so it stays off.
            if (!alive) return;
        }

        try {
            guard();
        } catch (e) {
            logger.error("Could not guard the relationship actions", e);
        }

        reapply();
        FluxDispatcher.subscribe("CONNECTION_OPEN", afterConnect); watchMutuals();

    },

    stop() {
        alive = false;
        unwatchMutuals();
        FluxDispatcher.unsubscribe("CONNECTION_OPEN", afterConnect);
        unguard();

        // Back as Discord has it, still on the list - switching the plugin off should give
        // everybody back without forgetting who you had put away.
        restoreEverything(false);
    }
});
