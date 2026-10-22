/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./shared.css";

import { NavContextMenuPatchCallback } from "@api/ContextMenu";
import { migratePluginSettings } from "@api/Settings";
import definePlugin from "@utils/types";
import { User } from "@vencord/discord-types";
import { FluxDispatcher, Menu, UserStore } from "@webpack/common";

import {
    attach,
    counts,
    detach,
    dismissRequest,
    forgetFresh,
    FRIEND,
    hideFresh,
    hideFriend,
    invalidate,
    isDismissed,
    isFriended,
    isHidden,
    isLoaded,
    load,
    PENDING_INCOMING,
    realList,
    realType,
    reapply,
    release,
    restoreRequest,
    showFriend
} from "./friends";
import { EyeIcon, IconComponent, PersonOffIcon, PersonRemoveIcon } from "./icons";
import { knownList } from "./known";
import { place } from "./menu";
import { unwatchMutuals, watchMutuals } from "./mutuals";
import { setRunning, settings } from "./settings";
import { About } from "./ui";

/** One entry, with its icon on both sides of the label the way Discord draws its own */
const item = (id: string, label: string, Icon: IconComponent, action: () => void) => (
    <Menu.MenuItem
        id={"vc-chf-" + id}
        key={id}
        label={label}
        icon={Icon}
        leadingAccessory={{ type: "icon", icon: Icon }}
        action={action}
    />
);

/** Each entry is offered only where it would do something */
const userCtx: NavContextMenuPatchCallback = (children, { user }: { user?: User; }) => {
    if (!user || !settings.store.userMenu) return;

    const { id } = user;
    if (id === UserStore.getCurrentUser()?.id) return;

    const type = realType(id);

    if (isHidden(id)) place(children, 30, item("show", "Unhide Friend", EyeIcon, () => showFriend(id)));
    else if (type === FRIEND && !isFriended(id)) place(children, 30, item("hide", "Hide Friend", PersonOffIcon, () => hideFriend(id)));

    if (isDismissed(id)) place(children, 31, item("restore", "Unhide Friend Request", EyeIcon, () => restoreRequest(id)));
    else if (type === PENDING_INCOMING) place(children, 31, item("dismiss", "Hide Friend Request", PersonRemoveIcon, () => dismissRequest(id)));
};

/** Whether somebody the share hid, as `id:type`, is still hidden - see realList */
function stillHidden(key: string) {
    const [id, type] = key.split(":");
    return Number(type) === FRIEND ? isHidden(id) : isDismissed(id);
}

/** Show again people the share hid, as `id:type` */
function showFresh(keys: string[]) {
    for (const key of keys) {
        const [id, type] = key.split(":");
        if (Number(type) === FRIEND) showFriend(id);
        else restoreRequest(id);
    }
}

const known = knownList("HideFriends_Known", realList, stillHidden);

/** Screen Share Protection says the share is over: show what only the share hid */
const onShareEnded = () => void setTimeout(() => alive && known.shareEnded(showFresh), 0);

/** Put away whoever turned up while the plugin could not see, if asked to, and take the list down */
function catchUp() {
    known.catchUp(!!settings.store.hideNew, hideFresh);
}

/** The saying-again booked by a reconnect, so switching off can call it off */
let connectTimer: ReturnType<typeof setTimeout> | null = null;

function cancelConnect() {
    if (connectTimer) clearTimeout(connectTimer);
    connectTimer = null;
}

const afterConnect = () => {
    // Nothing taken down between the reconnect and the catching up: that is the gap new
    // people come in through.
    known.cancel();

    // Out of the dispatch this is riding on: saying it again is dispatches of our own, and
    // none of those can happen inside another.
    cancelConnect();
    connectTimer = setTimeout(() => {
        connectTimer = null;
        if (!alive) return;

        reapply("hide");
        catchUp();
    }, 0);
};

/**
 * Somebody added, removed or changed while the plugin is on: seen, so not new next time - or,
 * while the screen is shared, a new friend or request turning up live, hidden until it ends.
 */
const onRelationship = () => void setTimeout(() => alive && known.arrived(hideFresh), 0);

const RELATIONSHIP_EVENTS = ["RELATIONSHIP_ADD", "RELATIONSHIP_UPDATE", "RELATIONSHIP_REMOVE"];

/** Whether the plugin is meant to be on */
let alive = false;

/**
 * Goes up on every start and stop. A start that had to wait checks it is still the latest
 * one: off and on again while the first was waiting is a second start, and only that one
 * should carry on.
 */
let runs = 0;

migratePluginSettings("HideFriends", "CustomPluginHideFriends");

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export default definePlugin({
    name: "HideFriends",
    description: "Hide friends from your friends list, one at a time or all at once, and hide friend requests. The real friendship is never touched and nobody is told.",
    tags: ["Friends", "Appearance", "Privacy"],
    authors: [{ name: "reqon", id: 497562304498368513n }],
    enabledByDefault: true,

    settings,

    /** One line for Additional Settings: how many people are hidden */
    hubSummary() {
        const n = counts();
        const parts = [
            n.hidden && `${plural(n.hidden, "friend")} hidden`,
            n.dismissed && `${plural(n.dismissed, "request")} hidden`
        ].filter(Boolean);

        return parts.join(", ");
    },

    settingsAboutComponent: () => (
        <About
            menus
            icon={PersonOffIcon}
            title="Hide friends and friend requests"
            steps={[
                <>Right-click a friend and choose <strong>Hide Friend</strong>. They show as not added until you unhide them.</>,
                <>Right-click someone who sent you a request and choose <strong>Hide Friend Request</strong> to take it out of Pending without answering it.</>,
                <>Hide everyone at once from the list below. Unhide them from the same list.</>
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
    dataChanged() {
        release("hide");
        invalidate("hide");
    },

    async start() {
        alive = true;
        const mine = ++runs;

        // Only the first start reads from disk. After that the list is already in memory,
        // and not waiting is what lets switching back on happen at once.
        if (!isLoaded("hide")) {
            await load("hide");
            if (mine !== runs) return;
        }

        attach("hide");
        FluxDispatcher.subscribe("CONNECTION_OPEN", afterConnect);
        watchMutuals();
        for (const type of RELATIONSHIP_EVENTS) FluxDispatcher.subscribe(type, onRelationship);
        window.addEventListener("vc-share-ended", onShareEnded);
        setRunning(true);

        await known.load();
        if (mine === runs) catchUp();
    },

    stop() {
        alive = false;
        runs++;
        cancelConnect();
        known.leave();
        for (const type of RELATIONSHIP_EVENTS) FluxDispatcher.unsubscribe(type, onRelationship);
        window.removeEventListener("vc-share-ended", onShareEnded);
        unwatchMutuals();
        setRunning(false);
        FluxDispatcher.unsubscribe("CONNECTION_OPEN", afterConnect);

        // Back as Discord has it, still on the list - switching the plugin off should give
        // everybody back without forgetting who you had put away.
        detach("hide");
        known.giveBack(forgetFresh);
    }
});
