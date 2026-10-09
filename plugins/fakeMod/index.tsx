/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./shared.css";

import { NavContextMenuPatchCallback } from "@api/ContextMenu";
import { definePluginSettings } from "@api/Settings";
import definePlugin, { OptionType } from "@utils/types";
import { User } from "@vencord/discord-types";
import { Alerts, Menu, showToast, UserStore } from "@webpack/common";

import { BlockIcon, ClockIcon, EyeIcon, FlagIcon, GavelIcon, IconComponent, ShieldIcon } from "./icons";
import { About } from "./ui";

const settings = definePluginSettings({
    profileMenu: {
        type: OptionType.BOOLEAN,
        displayName: "Show on profiles",
        description: "Adds the moderation entries to the ... menu on a profile",
        default: true
    },
    userMenu: {
        type: OptionType.BOOLEAN,
        displayName: "Show on people",
        description: "Adds the moderation entries to the menu when you right-click a person",
        default: true
    }
});

const nameOf = (user: User) => (user as any).globalName ?? user.username;

/**
 * Ask, the way Discord asks before anything it cannot take back, and then say it was done.
 *
 * None of it does anything. Nothing is sent, the person is not touched, and no report or
 * flag exists afterwards - the dialog and the notice are the whole of it.
 */
function confirm(title: string, body: string, confirmText: string, done: string) {
    Alerts.show({
        title,
        body,
        confirmText,
        cancelText: "Cancel",
        onConfirm: () => showToast(done, "success")
    });
}

const entry = (id: string, label: string, Icon: IconComponent, action: () => void, danger = false) => (
    <Menu.MenuItem
        id={"vc-cfmod-" + id}
        key={"vc-cfmod-" + id}
        label={label}
        color={danger ? "danger" : undefined}
        icon={Icon}
        leadingAccessory={{ type: "icon", icon: Icon }}
        action={action}
    />
);

const timeout = (user: User, id: string, label: string) => (
    <Menu.MenuItem
        id={"vc-cfmod-timeout-" + id}
        key={id}
        label={label}
        action={() => confirm(
            `Suspend ${nameOf(user)} for ${label.toLowerCase()}?`,
            "They will be logged out of every device and unable to sign in until the suspension ends. They are told why by email.",
            "Suspend",
            `${nameOf(user)} suspended for ${label.toLowerCase()}`
        )}
    />
);

function entries(user: User) {
    const name = nameOf(user);

    return (
        <Menu.MenuGroup key="vc-cfmod-group">
            {entry("standing", "View Account Standing", EyeIcon, () => Alerts.show({
                title: `${name}'s account standing`,
                body: "All good. No active violations, no open reports, and nothing awaiting review.",
                confirmText: "Close"
            }))}
            {entry("review", "Force Profile Review", ShieldIcon, () => confirm(
                `Send ${name}'s profile for review?`,
                "Their avatar, banner, bio and display name go to the review queue. Anything that breaks the guidelines is reset.",
                "Send for Review",
                `${name}'s profile sent for review`
            ))}
            {entry("flag", "Flag Account", FlagIcon, () => confirm(
                `Flag ${name}'s account?`,
                "The account is marked for a closer look, and new reports against it are handled first.",
                "Flag Account",
                `${name}'s account flagged`
            ))}
            <Menu.MenuItem
                id="vc-cfmod-timeout"
                key="vc-cfmod-timeout"
                label="Suspend Account"
                icon={ClockIcon}
                leadingAccessory={{ type: "icon", icon: ClockIcon }}
            >
                {timeout(user, "1d", "24 Hours")}
                {timeout(user, "7d", "7 Days")}
                {timeout(user, "30d", "30 Days")}
            </Menu.MenuItem>
            {entry("reset", "Reset Username", GavelIcon, () => confirm(
                `Reset ${name}'s username?`,
                "Their username and display name are replaced with generated ones, and they are asked to pick new ones the next time they sign in.",
                "Reset Username",
                `${name}'s username reset`
            ))}
            {entry("disable", "Disable Account", BlockIcon, () => confirm(
                `Disable ${name}'s account?`,
                "The account is closed and its owner is told by email. This can only be undone by an appeal.",
                "Disable Account",
                `${name}'s account disabled`
            ), true)}
        </Menu.MenuGroup>
    );
}

/**
 * Put the group straight after Discord's own Ignore / Block / Report, which is where
 * something like it would sit, or at the end of the menu if that group is not there.
 */
function place(children: any[], user?: User) {
    if (!user || user.id === UserStore.getCurrentUser()?.id) return;

    const group = entries(user);
    const has = (node: any): boolean => {
        const kids = node?.props?.children;
        const list = Array.isArray(kids) ? kids : kids ? [kids] : [];
        return list.some((kid: any) => kid?.props?.id === "report-user" || kid?.props?.id === "block" || has(kid));
    };

    const at = children.findIndex(has);
    if (at === -1) children.push(group);
    else children.splice(at + 1, 0, group);
}

const profileCtx: NavContextMenuPatchCallback = (children, { user }: { user?: User; }) => {
    if (settings.store.profileMenu) place(children, user);
};

const userCtx: NavContextMenuPatchCallback = (children, { user }: { user?: User; }) => {
    if (settings.store.userMenu) place(children, user);
};

export default definePlugin({
    name: "FakeMod",
    description: "Adds moderation entries to profiles and people's menus, as if you could review, flag, suspend and disable accounts. None of them do anything.",
    tags: ["Fun", "Appearance"],
    authors: [{ name: "reqon", id: 497562304498368513n }],

    settings,

    settingsAboutComponent: () => (
        <About
            icon={ShieldIcon}
            title="Menus that look like moderator tools"
            note="Only you see this. Every entry asks, says it was done, and does nothing: nothing is sent and nobody's account is touched."
            steps={[
                <>Open the <strong>...</strong> menu on a profile, or right-click a person.</>,
                <>Under Block and Report there is a group with <strong>Force Profile Review</strong>, <strong>Flag Account</strong>, <strong>Suspend Account</strong> and the rest.</>
            ]}
        />
    ),

    /** One line for Additional Settings */
    hubSummary() {
        return "Moderation entries are in the menus";
    },

    contextMenus: {
        "user-context": userCtx,
        "user-profile-actions": profileCtx,
        "user-profile-overflow-menu": profileCtx
    }
});
