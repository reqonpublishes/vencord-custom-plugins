/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./shared.css";
import "./styles.css";

import { NavContextMenuPatchCallback } from "@api/ContextMenu";
import definePlugin from "@utils/types";
import { User } from "@vencord/discord-types";
import { FluxDispatcher, Menu, UserStore } from "@webpack/common";

import {
    attach,
    BLOCKED,
    counts,
    detach,
    Fake,
    fakeAs,
    fakeOf,
    FRIEND,
    invalidate,
    isHidden,
    isLoaded,
    load,
    PENDING_INCOMING,
    PENDING_OUTGOING,
    realType,
    reapply,
    release,
    unfake
} from "./friends";
import { BlockIcon, IconComponent, MailIcon, PersonAddIcon, PersonRemoveIcon, SendIcon } from "./icons";
import { place } from "./menu";
import { settings } from "./settings";
import { About } from "./ui";
import { done } from "./undo";

/** Each kind of fake, what it is called, and where it sits in the menu */
export const KINDS: { fake: Fake; add: string; remove: string; icon: IconComponent; rank: number; }[] = [
    { fake: "friended", add: "Fake Friend", remove: "Remove Fake Friend", icon: PersonAddIcon, rank: 35 },
    { fake: "incoming", add: "Fake Incoming Request", remove: "Remove Fake Request", icon: MailIcon, rank: 36 },
    { fake: "pending", add: "Fake Outgoing Request", remove: "Remove Fake Request", icon: SendIcon, rank: 37 },
    { fake: "blocked", add: "Fake Block", remove: "Remove Fake Block", icon: BlockIcon, rank: 38 }
];

/** One entry, with its icon on both sides of the label the way Discord draws its own */
const item = (id: string, label: string, Icon: IconComponent, action: () => void) => (
    <Menu.MenuItem
        id={"vc-cff-" + id}
        key={id}
        label={label}
        icon={Icon}
        leadingAccessory={{ type: "icon", icon: Icon }}
        action={action}
    />
);

/**
 * Whether a fake would show anything, given what they really are. A request to somebody who
 * is really a friend is nothing anybody would see - unless Hide Friends is hiding them.
 */
function offered(fake: Fake, id: string): boolean {
    const type = realType(id);
    const friend = type === FRIEND && !isHidden(id);

    switch (fake) {
        case "friended": return type !== FRIEND;
        case "incoming": return !friend && type !== PENDING_INCOMING;
        case "pending": return !friend && type !== PENDING_OUTGOING;
        case "blocked": return type !== BLOCKED;
    }
}

/**
 * Somebody faked shows the one way back. Anybody else shows what can be faked about them.
 * A person is only ever one fake at a time, so picking another replaces the first.
 */
const userCtx: NavContextMenuPatchCallback = (children, { user }: { user?: User; }) => {
    if (!user || !settings.store.userMenu) return;

    const { id } = user;
    if (id === UserStore.getCurrentUser()?.id) return;

    const now = fakeOf(id);
    if (now) {
        const kind = KINDS.find(one => one.fake === now)!;
        place(children, kind.rank, item("remove", kind.remove, PersonRemoveIcon, () => done(kind.remove, () => unfake(id), () => fakeAs(id, now))));
        return;
    }

    for (const kind of KINDS) {
        if (offered(kind.fake, id)) place(children, kind.rank, item(kind.fake, kind.add, kind.icon, () => done(kind.add, () => fakeAs(id, kind.fake), () => unfake(id))));
    }
};

/** The saying-again booked by a reconnect, so switching off can call it off */
let connectTimer: ReturnType<typeof setTimeout> | null = null;

/** Discord rebuilds its relationships on every reconnect, so everything is said again - outside the dispatch it rides on */
const afterConnect = () => {
    if (connectTimer) clearTimeout(connectTimer);
    connectTimer = setTimeout(() => {
        connectTimer = null;
        if (alive) reapply("fake");
    }, 0);
};

let alive = false;
let runs = 0;

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export default definePlugin({
    name: "FakeFriends",
    description: "Fake a friend, a friend request either way, or a block, on your own Discord only. Accept, Decline and Unblock on anything fake never reach Discord.",
    tags: ["Friends", "Fun"],
    authors: [{ name: "reqon", id: 497562304498368513n }],

    settings,

    /** One line for Additional Settings: how much is faked */
    hubSummary() {
        const n = counts();
        return [
            n.friended && plural(n.friended, "friend"),
            (n.incoming + n.pending) && plural(n.incoming + n.pending, "request"),
            n.blocked && plural(n.blocked, "block")
        ].filter(Boolean).join(", ");
    },

    settingsAboutComponent: () => (
        <About
            menus
            icon={PersonAddIcon}
            title="Fake friends, requests and blocks"
            steps={[
                <>Right-click someone and open <strong>Fake</strong>: make them a friend, send yourself a request from them, show a request to them, or block them.</>,
                <>Or add someone by their user ID below, even if you share nothing with them.</>,
                <>Accept, Decline and Unblock on anything fake stay on this computer and never reach Discord.</>
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
        release("fake");
        invalidate("fake");
    },

    async start() {
        alive = true;
        const mine = ++runs;

        if (!isLoaded("fake")) {
            await load("fake");
            if (mine !== runs) return;
        }

        attach("fake");
        FluxDispatcher.subscribe("CONNECTION_OPEN", afterConnect);
    },

    stop() {
        alive = false;
        runs++;
        if (connectTimer) clearTimeout(connectTimer);
        connectTimer = null;
        FluxDispatcher.unsubscribe("CONNECTION_OPEN", afterConnect);

        // Everybody back as they really are, still on the lists for next time
        detach("fake");
    }
});
