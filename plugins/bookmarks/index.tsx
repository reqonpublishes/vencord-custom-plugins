/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./shared.css";
import "./styles.css";

import { NavContextMenuPatchCallback } from "@api/ContextMenu";
import definePlugin from "@utils/types";
import { Channel, User } from "@vencord/discord-types";
import { Menu, showToast, UserStore } from "@webpack/common";

import BookmarksPage from "./BookmarksPage";
import { BookmarkAddIcon, BookmarkIcon } from "./icons";
import { add, isBookmarked, load, remove } from "./store";
import { About } from "./ui";

/** The id of the tab, as Discord keeps track of which one is open */
const SECTION = "BOOKMARKED";

/** Who a menu is about: the person it was opened on, or the other side of a DM */
function personOf(user?: User, channel?: Channel): any {
    if (user) return user;

    const recipients: string[] = (channel as any)?.recipients ?? [];
    return (channel as any)?.type === 1 && recipients[0] ? UserStore.getUser(recipients[0]) : null;
}

const menu: NavContextMenuPatchCallback = (children, { user, channel }: { user?: User; channel?: Channel; }) => {
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

                    showToast(saved ? "Bookmark removed" : "Bookmarked. Find them under Friends, in Bookmarked", "success");
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
                    replace: "className:$1},{id:$self.SECTION,show:!0,className:$1,content:\"Bookmarked\",announceName:\"Bookmarked\"},{id:$2.SUGGESTIONS,show:"
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

    renderPage() {
        return <BookmarksPage />;
    },

    contextMenus: {
        "user-context": menu,
        "user-profile-actions": menu,
        "user-profile-overflow-menu": menu
    },

    async start() {
        await load();
    }
});
