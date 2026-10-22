/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./shared.css";

import { NavContextMenuPatchCallback } from "@api/ContextMenu";
import { definePluginSettings, Settings } from "@api/Settings";
import definePlugin, { OptionType } from "@utils/types";
import { User } from "@vencord/discord-types";
import { FluxDispatcher, Menu, showToast, UserStore } from "@webpack/common";

import { InspectIcon, MasksIcon, UndoIcon } from "./icons";
import { forgetUnused, preload, whenReady } from "./images";
import { openInspect } from "./InspectModal";
import { place } from "./menu";
import { redrawPresence, startPresence, stopPresence } from "./presence";
import { ProfilesPanel } from "./ProfilesPanel";
import { avatarFor, bannerFor, joinedAt, presetForAccount, profileLoaded, realAccountCount, redraw, startRewriting, stopRewriting } from "./rewrite";
import { loadWhole, stealLook } from "./steal";
import { asRecord, editedIds, invalidate, load, lookFor, onChange, presetCalled, presetNames, revert, savePreset, setInSwitcher, setLook } from "./store";
import { About, menuChips } from "./ui";

const settings = definePluginSettings({
    entries: {
        type: OptionType.COMPONENT,
        component: menuChips(() => settings, "Right-click entries", "Which entries show when you right-click someone.",
            [{ key: "inspectEntry", label: "Inspect Profile" }, { key: "stealEntry", label: "Steal Profile" }, { key: "resetEntry", label: "Reset Profile" }])
    },
    menus: {
        type: OptionType.COMPONENT,
        component: menuChips(() => settings, "Show in menus", "Where those entries appear.",
            [{ key: "userMenu", label: "People" }, { key: "profileMenu", label: "Profiles" }])
    },
    inspectEntry: { type: OptionType.BOOLEAN, hidden: true, description: "", default: true },
    stealEntry: { type: OptionType.BOOLEAN, hidden: true, description: "", default: false },
    resetEntry: { type: OptionType.BOOLEAN, hidden: true, description: "", default: false },
    userMenu: { type: OptionType.BOOLEAN, hidden: true, description: "", default: true },
    profileMenu: { type: OptionType.BOOLEAN, hidden: true, description: "", default: true },
    // parts Steal leaves out - picked in the Presets tab
    stealSkip: { type: OptionType.CUSTOM, default: [] as string[] },
    // shop ids kept at the top of each kind in the Collectibles tab - picked by right-clicking
    favourites: { type: OptionType.CUSTOM, default: {} as Record<string, string[]> },
    profiles: {
        type: OptionType.COMPONENT,
        component: ProfilesPanel
    }
});

/** Whether Discord loaded with this switched on - the picture patches only go in then */
const enabledAtLoad = !!Settings.plugins.InspectProfiles?.enabled;

/** Keep somebody's whole profile as a preset, named after them */
async function steal(user: User) {
    // whatever has not loaded yet is asked for first, so the copy is the whole thing
    await loadWhole(user.id);

    const look = stealLook(user.id);
    // A name made only of symbols reads as nothing in a list, so the username stands in
    const shown = (user as any).globalName;
    const called = shown && /[\p{L}\p{N}]/u.test(shown) ? shown : user.username;
    if (!look || savePreset(called, look) !== "saved") {
        showToast({ text: "Could not read their profile", variant: "critical" });
        return;
    }

    showToast({
        text: profileLoaded(user.id) ? `Stole ${called}. Wear it from Presets` : `Stole ${called}. Discord would not send their full profile, so their bio and badges are missing`,
        variant: "success"
    });
}

const userMenu = (enabled: () => boolean): NavContextMenuPatchCallback => (children, { user }: { user?: User; }) => {
    if (!enabled() || !user?.id) return;

    const { inspectEntry, stealEntry, resetEntry } = settings.store;

    place(children, 6,
        inspectEntry !== false && <Menu.MenuItem
            id="vc-cip-inspect"
            key="vc-cip-inspect"
            label="Inspect Profile"
            icon={InspectIcon}
            leadingAccessory={{ type: "icon", icon: InspectIcon }}
            action={() => openInspect(user.id)}
        />,
        stealEntry && <Menu.MenuItem
            id="vc-cip-steal"
            key="vc-cip-steal"
            label="Steal Profile"
            icon={MasksIcon}
            leadingAccessory={{ type: "icon", icon: MasksIcon }}
            action={() => void steal(user)}
        />,
        resetEntry && lookFor(user.id) ? (
            <Menu.MenuItem
                id="vc-cip-reset"
                key="vc-cip-reset"
                label={user.id === UserStore.getCurrentUser()?.id ? "Reset My Profile" : "Reset Profile"}
                icon={UndoIcon}
                leadingAccessory={{ type: "icon", icon: UndoIcon }}
                action={() => {
                    revert(user.id);
                    showToast({ text: user.id === UserStore.getCurrentUser()?.id ? "Your real profile is back" : "Their real profile is back", variant: "default" });
                }}
            />
        ) : null
    );
};

/**
 * Your own full profile, while you wear a look.
 *
 * Discord only asks for it when you open your profile - not for the popout from your avatar
 * (measured) - so after a restart the popout has no profile for the look to land on: no bio,
 * badges or colours. Asked for once here instead, the same request opening it makes.
 */
function loadMine() {
    const me = UserStore.getCurrentUser()?.id;
    if (me && lookFor(me) && !profileLoaded(me)) void loadWhole(me);
}

let unwatch: (() => void) | null = null;

/** Running - the tab patch reads this, as it stays in Discord's code after a stop */
let active = false;

/** Every picture any changed profile or preset uses */
function picturesInUse() {
    const { profiles, presets } = asRecord();
    return [...Object.values(profiles), ...Object.values(presets)].flatMap(look => [look.avatar, look.banner]);
}

/** Pictures nothing uses any more are let go - a little after the last change, not on every one */
let tidyTimer: ReturnType<typeof setTimeout> | null = null;
function tidyPictures() {
    if (tidyTimer) clearTimeout(tidyTimer);
    tidyTimer = setTimeout(() => void forgetUnused(picturesInUse()), 5000);
}
let runs = 0;

/** Whether the Switch Accounts drag guard is on. Put on once: an interceptor cannot be taken off */
let guardingMoves = false;

export default definePlugin({
    name: "InspectProfiles",
    description: "Change how any profile looks, or steal one and wear it.",
    authors: [{ name: "reqon", id: 497562304498368513n }],
    enabledByDefault: true,
    dependencies: ["UserSettingsAPI"],

    settings,

    settingsAboutComponent: () => (
        <About
            menus
            icon={InspectIcon}
            title="Make any profile look how you want"
            steps={[
                <>Right-click anybody, yourself included, and choose <strong>Inspect Profile</strong>. The preview updates as you type.</>,
                <><strong>Steal Profile</strong> keeps everything about them as a preset: names, bio, date, badges, pictures, colours and connections.</>,
                <>Open your own profile and wear a preset from the <strong>Presets</strong> tab.</>
            ]}
        />
    ),

    patches: [
        {
            // Where every user picture and banner address is built. Each answers with the chosen
            // address first, so a picture from anywhere draws everywhere Discord draws one.
            find: "getGuildMemberAvatarURLSimple:",
            replacement: [
                {
                    // the avatar
                    match: /(function \i\((\i)\)\{)(let \i=arguments\.length>1&&void 0!==arguments\[1\]&&arguments\[1\],\i=arguments\.length>2&&void 0!==arguments\[2\]\?arguments\[2\]:\i\.\i,\i=arguments\.length>3)/,
                    replace: "$1{const vcIP=$self.avatarFor($2);if(vcIP)return vcIP;}$3"
                },
                {
                    // a server avatar, which a card shows over the plain one
                    match: /(function \i\((\i)\)\{)(let\{userId:\i,avatar:\i,guildId:\i\}=\2)/,
                    replace: "$1{const vcIP=$self.avatarFor({id:$2.userId});if(vcIP)return vcIP;}$3"
                },
                {
                    // the banner
                    match: /(function \i\((\i)\)\{)(let \i,\{id:\i,banner:\i,canAnimate:\i,size:\i\}=\2;)/,
                    replace: "$1{const vcIP=$self.bannerFor($2);if(vcIP)return vcIP;}$3"
                },
                {
                    // a server banner
                    match: /(function \i\((\i)\)\{)(let \i,\{id:\i,guildId:\i,banner:\i,canAnimate:)/,
                    replace: "$1{const vcIP=$self.bannerFor($2);if(vcIP)return vcIP;}$3"
                }
            ]
        },
        {
            // The tabs of the full profile. Your own always has Board and Wishlist, to edit them;
            // while you wear a look, it gets the tabs the look's owner has instead.
            find: 'location:"UserProfileModalV2Tabs"',
            replacement: {
                match: /(\i)=(\i)\.id===(\i)\?\.id,(\i)=(\i)\(\2\.id\)/,
                replace: "$1=$2.id===$3?.id&&!$self.wearing($2.id),$4=!$self.boardFromLook($2.id)&&$5($2.id)"
            }
        },
        {
            // Switch Accounts. A preset you put there is a row of its own; choosing it wears the
            // preset rather than logging in, and its X takes it off the list rather than
            // forgetting an account. Choosing yourself while wearing a look takes it off.
            find: '"MultiAccountActionCreators"',
            replacement: [
                {
                    match: /(function \i\((\i),\i,\i\)\{)(\i\.log\(`Switching account to )/,
                    replace: "$1if($self.switchTo($2))return Promise.resolve();$3"
                },
                {
                    match: /(function \i\((\i)\)\{)(\i\.\i\.dispatch\(\{type:"MULTI_ACCOUNT_REMOVE_ACCOUNT")/,
                    replace: "$1if($self.removeFromSwitcher($2))return;$3"
                }
            ]
        },
        {
            // Member Since on a profile, which works the day out from the id rather than reading
            // it off the user - so the day chosen has to be answered here as well.
            find: /textClassName:\i,tooltipDelay:\i\}=\i/,
            replacement: {
                match: /(\i\.default\.extractTimestamp\((\i)\))/,
                replace: "$self.joinedAt($2,$1)"
            }
        }
    ],

    avatarFor,
    joinedAt,

    /** A Switch Accounts row was chosen. True when it was ours to handle, so nothing logs in */
    switchTo(accountId: string) {
        if (!active) return false;
        const me = UserStore.getCurrentUser()?.id;
        if (!me) return false;

        const name = presetForAccount(accountId);
        if (name) {
            const look = presetCalled(name);
            if (!look) return false;

            setLook(me, { ...look });
            showToast({ text: `You now look like ${name}`, variant: "success" });
            return true;
        }

        if (accountId === me && lookFor(me)) {
            revert(me);
            showToast({ text: "You look like yourself again", variant: "success" });
            return true;
        }

        return false;
    },

    /** A preset row's X: off the list, the preset itself kept */
    removeFromSwitcher(accountId: string) {
        const name = active && presetForAccount(accountId);
        if (!name) return false;

        setInSwitcher(name, false);
        return true;
    },

    /** Whether you are wearing a look - your profile then shows the tabs anyone else's would */
    wearing(userId: string) {
        return active && userId === UserStore.getCurrentUser()?.id && !!lookFor(userId);
    },

    /** Whether the look you wear decides the Board: shown only when it has something on it */
    boardFromLook(userId: string) {
        return active && userId === UserStore.getCurrentUser()?.id && lookFor(userId)?.widgets !== undefined;
    },
    bannerFor,

    /** Whether the picture patches went in, which is only when Discord loaded with this on */
    patchesLive() {
        return enabledAtLoad;
    },

    /** One line for Additional Settings */
    hubSummary() {
        const n = editedIds().length;
        const p = presetNames().length;
        return [n && `${n} changed`, p && `${p} preset${p === 1 ? "" : "s"}`].filter(Boolean).join(", ");
    },

    /** Told by Cloud Sync that the saved copy was replaced, so the next start reads it again */
    dataChanged: invalidate,

    flux: {
        // the plugin starts before Discord knows who you are, and Discord is busiest just after
        // connecting, so your own profile is asked for a moment later
        CONNECTION_OPEN() {
            setTimeout(loadMine, 3000);
        }
    },

    contextMenus: {
        "user-context": userMenu(() => settings.store.userMenu !== false),
        "user-profile-actions": userMenu(() => settings.store.profileMenu !== false),
        "user-profile-overflow-menu": userMenu(() => settings.store.profileMenu !== false)
    },

    async start() {
        active = true;
        const mine = ++runs;

        // Dragging in Switch Accounts reorders the saved accounts by place in the list - and the
        // presets are only in the list shown. A drag that touches one of them is let go of here,
        // before it can shuffle the real accounts by places they do not have.
        if (!guardingMoves) {
            guardingMoves = true;
            FluxDispatcher.addInterceptor((action: any) =>
                action?.type === "MULTI_ACCOUNT_MOVE_ACCOUNT" && active
                && (action.from >= realAccountCount() || action.to >= realAccountCount()));
        }
        await load();
        if (mine !== runs) return;

        // Pictures kept on this computer are read before Discord first asks for them, and
        // anything showing is told to draw again as each one becomes ready.
        whenReady(redraw);
        await preload(picturesInUse());
        if (mine !== runs) return;

        startRewriting();
        startPresence();
        loadMine();
        unwatch = onChange(() => {
            redraw();
            redrawPresence();
            tidyPictures();
            loadMine();
        });
    },

    stop() {
        active = false;
        runs++;
        unwatch?.();
        unwatch = null;
        stopRewriting();
        stopPresence();
    }
});

