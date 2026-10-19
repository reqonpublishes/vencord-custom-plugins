/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./shared.css";
import "./styles.css";

import { NavContextMenuPatchCallback } from "@api/ContextMenu";
import { definePluginSettings, Settings } from "@api/Settings";
import definePlugin, { OptionType } from "@utils/types";
import { Channel, User } from "@vencord/discord-types";
import { findStoreLazy } from "@webpack";
import { FluxDispatcher, Menu, RelationshipStore, showToast, UserStore } from "@webpack/common";

import { BookmarkList } from "./BookmarkList";
import BookmarksPage from "./BookmarksPage";
import { BookmarkAddIcon, BookmarkIcon } from "./icons";
import { add, count, isBookmarked, load, remove } from "./store";
import { About } from "./ui";

const FriendsStore: any = findStoreLazy("FriendsStore");

const settings = definePluginSettings({
    people: {
        type: OptionType.COMPONENT,
        component: BookmarkList
    }
});

/** Whether Vencord had this switched on when Discord loaded, which is when the tab is put in */
const enabledAtLoad = !!Settings.plugins.Bookmarks?.enabled;

let running = false;

/** Whether the screen is being shared, as Plugin Hub's Screen Share Protection sees it */
const shared = () => !!(window as any).vcScreenShared;

/** A share starting or ending: the tab goes or comes back, and you are moved off it if you were on it */
function onShared() {
    leaveTab();
    redrawFriends();
}

/** Standing on the tab as it goes would leave its page up with no tab selected */
function leaveTab() {
    try {
        if (FriendsStore.getState?.()?.section === SECTION) {
            FluxDispatcher.dispatch({ type: "FRIENDS_SET_SECTION", section: "ALL" } as any);
        }
    } catch { /* nothing open to move */ }
}

/** Have the Friends page look again at which tabs it has */
function redrawFriends() {
    try {
        // The page keeps its list of tabs until something it is listening to changes, and
        // the relationships are what it listens to.
        RelationshipStore.emitChange?.();
        FriendsStore.emitChange?.();
    } catch { /* not open */ }
}

/** The id of the tab, as Discord keeps track of which one is open */
const SECTION = "BOOKMARKED";

/** Who a menu is about: the person it was opened on, or the other side of a DM */
function personOf(user?: User, channel?: Channel): any {
    if (user) return user;

    const recipients: string[] = (channel as any)?.recipients ?? [];
    return (channel as any)?.type === 1 && recipients[0] ? UserStore.getUser(recipients[0]) : null;
}

const menu: NavContextMenuPatchCallback = (children, { user, channel }: { user?: User; channel?: Channel; }) => {
    // A shared screen should not show who is worth keeping within reach.
    if (shared()) return;

    const person = personOf(user, channel);
    if (!person?.id || person.id === UserStore.getCurrentUser()?.id) return;

    const saved = isBookmarked(person.id);
    const Icon = saved ? BookmarkIcon : BookmarkAddIcon;

    children.push(
        <Menu.MenuGroup key="vc-bm-group">
            <Menu.MenuItem
                id="vc-bm-toggle"
                label={saved ? "Remove Bookmark" : "Bookmark"}
                icon={Icon}
                leadingAccessory={{ type: "icon", icon: Icon }}
                action={() => {
                    if (saved) remove(person.id);
                    else add(person);

                    showToast({ text: saved ? "Bookmark removed" : "Bookmarked. Find them under Friends, in Bookmarked", variant: "success" });
                }}
            />
        </Menu.MenuGroup>
    );
};

export default definePlugin({
    name: "Bookmarks",
    description: "Bookmark people so you can close their DM and still find them. Adds a Bookmarked tab to the Friends page, next to Pending.",
    tags: ["Friends", "Organisation", "Utility"],
    authors: [{ name: "reqon", id: 497562304498368513n }],

    settings,

    settingsAboutComponent: () => (
        <About
            icon={BookmarkIcon}
            title="Keep people within reach after closing their DM"
            note="Kept on this computer only. Nobody is told they were bookmarked."
            steps={[
                <>Right-click a person or a DM and choose <strong>Bookmark</strong>.</>,
                <>Close the DM whenever you like.</>,
                <>Open <strong>Friends</strong> and the <strong>Bookmarked</strong> tab to find them again. Click one to open their DM.</>
            ]}
        />
    ),

    patches: [
        {
            // The tabs along the top of the Friends page. Ours goes in straight after Pending.
            find: "#{intl::FRIENDS_SECTION_ONLINE}),className:",
            replacement: [
                {
                    match: /className:(\i\.\i)\},\{id:(\i\.\i)\.SUGGESTIONS,show:/,
                    replace: "className:$1},{id:$self.SECTION,show:$self.tabShown(),className:$1,content:\"Bookmarked\",announceName:\"Bookmarked\"},{id:$2.SUGGESTIONS,show:"
                },
                {
                    // What is drawn under the tabs. Add Friend has a page of its own and every
                    // other tab shares the list; this gives ours a page of its own as well.
                    match: /=(\i)===(\i\.\i)\.ADD_FRIEND\?(?=\(0,\i\.jsx\)\(\i,\{\}\):\(0,\i\.jsx\)\(\i,\{titleId:)/,
                    replace: "=$1===$self.SECTION?$self.renderPage():$1===$2.ADD_FRIEND?"
                }
            ]
        }
    ],

    SECTION,

    /**
     * Whether the tab is there. The tab is part of Discord's page for as long as the window
     * lives, so switching the plugin off cannot take it out - it is asked each time instead.
     */
    tabShown() {
        return running && !shared();
    },

    /** Whether Discord loaded with the tab in, which is the only time it can go in */
    patchesLive() {
        return enabledAtLoad;
    },

    /** One line for Additional Settings */
    hubSummary() {
        const n = count();
        return n ? `${n} ${n === 1 ? "person" : "people"} bookmarked` : "Nobody bookmarked yet";
    },

    renderPage() {
        return <BookmarksPage />;
    },

    contextMenus: {
        "user-context": menu,
        "user-profile-actions": menu,
        "user-profile-overflow-menu": menu
    },

    async start() {
        running = true;
        window.addEventListener("vc-screen-shared", onShared);
        redrawFriends();

        await load();
    },

    stop() {
        running = false;

        window.removeEventListener("vc-screen-shared", onShared);
        leaveTab();
        redrawFriends();
    }
});
