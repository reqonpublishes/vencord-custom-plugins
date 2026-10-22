/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./shared.css";

import { NavContextMenuPatchCallback } from "@api/ContextMenu";
import { definePluginSettings } from "@api/Settings";
import definePlugin, { OptionType } from "@utils/types";
import { Guild, Message, ModalAction, RenderModalProps, User } from "@vencord/discord-types";
import { Alerts, Menu, Modal, openModal, showToast, TextArea, UserStore, useState } from "@webpack/common";

import { ShieldIcon } from "./icons";
import { Power, POWERS, Rank, RANK_NAME, RANKS, reaches, Target } from "./powers";
import { About, cl, menuChips } from "./ui";

const settings = definePluginSettings({
    rank: {
        type: OptionType.SELECT,
        displayName: "Your rank",
        description: "Which moderator you appear as.",
        options: [
            { label: "Trial Moderator", value: "trial", default: true },
            { label: "Moderator", value: "moderator" },
            { label: "Senior Moderator", value: "senior" }
        ]
    },
    showLocked: {
        type: OptionType.BOOLEAN,
        displayName: "Show locked actions",
        description: "Actions above your rank show greyed out, with the rank they need.",
        default: true
    },
    menus: {
        type: OptionType.COMPONENT,
        component: menuChips(() => settings, "Show in menus", "Where the moderation entries appear.", [{ key: "profileMenu", label: "Profiles" }, { key: "userMenu", label: "People" }, { key: "serverMenu", label: "Servers" }, { key: "messageMenu", label: "Messages" }])
    },
    profileMenu: {
        type: OptionType.BOOLEAN,
        hidden: true,
        displayName: "Show on profiles",
        description: "Show the moderation entries in the ... menu on a profile",
        default: true
    },
    userMenu: {
        type: OptionType.BOOLEAN,
        hidden: true,
        displayName: "Show on people",
        description: "Show the moderation entries when you right-click a person",
        default: true
    },
    serverMenu: {
        type: OptionType.BOOLEAN,
        hidden: true,
        displayName: "Show on servers",
        description: "Show the moderation entries when you right-click a server",
        default: true
    },
    messageMenu: {
        type: OptionType.BOOLEAN,
        hidden: true,
        displayName: "Show on messages",
        description: "Show the moderation entries when you right-click a message",
        default: true
    }
});

const rank = (): Rank => (RANKS as readonly string[]).includes(settings.store.rank as string) ? settings.store.rank as Rank : "trial";

/** A case number of the shape a ticket system gives out. Made up on the spot, and kept nowhere */
function caseNumber() {
    const digits = (n: number) => String(Math.floor(Math.random() * 10 ** n)).padStart(n, "0");
    return `#${digits(2)}${digits(4)}-${digits(2)}`;
}

const fill = (text: string, name: string, length = "") =>
    text.replaceAll("%s", name).replaceAll("%l", length.toLowerCase()).replaceAll("%c", caseNumber());

function NoteModal({ rootProps, power, name }: { rootProps: RenderModalProps; power: Power; name: string; }) {
    const [text, setText] = useState("");

    const actions: ModalAction[] = [
        {
            text: power.confirm ?? "Save",
            variant: "primary",
            onClick: () => {
                rootProps.onClose();
                showToast({ text: fill(power.done ?? "Saved", name), variant: "success" });
            }
        },
        { text: "Cancel", variant: "secondary", onClick: rootProps.onClose }
    ];

    return (
        <Modal {...rootProps} size="sm" title={fill(power.title, name)} actions={actions}>
            <section className={cl("section", "section-last")}>
                <TextArea value={text} onChange={(next: string) => setText(next)} placeholder="What other moderators should know" rows={4} />
                <div className={cl("hint")}>{power.body}</div>
            </section>
        </Modal>
    );
}

/**
 * Do what an entry does: tell, take a note, or ask and then say it was done.
 *
 * None of it does anything. Nothing is sent, nobody and nothing is touched, and no case,
 * note or flag exists afterwards - the dialog and the notice are the whole of it.
 */
function run(power: Power, name: string, length?: string) {
    if (power.kind === "note") {
        openModal(rootProps => <NoteModal rootProps={rootProps} power={power} name={name} />);
        return;
    }

    if (power.kind === "info") {
        Alerts.show({ title: fill(power.title, name), body: fill(power.body, name), confirmText: "Close" });
        return;
    }

    Alerts.show({
        title: fill(power.title, name, length),
        body: fill(power.body, name, length),
        confirmText: power.confirm ?? "Confirm",
        cancelText: "Cancel",
        onConfirm: () => showToast({ text: fill(power.done ?? "Done", name, length), variant: "success" })
    });
}

function item(power: Power, name: string) {
    const allowed = reaches(rank(), power.needs);
    if (!allowed && !settings.store.showLocked) return null;

    const common: any = {
        id: "vc-cfmod-" + power.id,
        key: "vc-cfmod-" + power.id,
        label: power.label,
        icon: power.icon,
        leadingAccessory: { type: "icon", icon: power.icon },
        color: power.danger && allowed ? "danger" : undefined
    };

    // Above your rank: there to be seen, and saying whose it is.
    if (!allowed) return <Menu.MenuItem {...common} disabled subtext={`Requires ${RANK_NAME[power.needs]}`} />;

    if (power.lengths) {
        return (
            <Menu.MenuItem {...common}>
                {power.lengths.map(length => (
                    <Menu.MenuItem
                        id={`vc-cfmod-${power.id}-${length}`}
                        key={length}
                        label={length}
                        action={() => run(power, name, length)}
                    />
                ))}
            </Menu.MenuItem>
        );
    }

    return <Menu.MenuItem {...common} action={() => run(power, name)} />;
}

const group = (target: Target, name: string) => {
    const items = POWERS.filter(power => power.target === target).map(power => item(power, name)).filter(Boolean);
    return items.length ? <Menu.MenuGroup key="vc-cfmod-group">{items}</Menu.MenuGroup> : null;
};

/**
 * Put a group straight after one of Discord's own entries.
 *
 * On a person that is Ignore / Block / Report, which is where something like this would sit.
 * Where none of those are there, it goes above the other plugins' groups and Discord's
 * closing one (Copy ID, View Avatar), rather than under everything.
 */
function place(children: any[], entries: any, after: string[]) {
    if (!entries) return;

    const has = (node: any, test: (id: string) => boolean): boolean => {
        if (Array.isArray(node)) return node.some(kid => has(kid, test));
        if (typeof node?.props?.id === "string" && test(node.props.id)) return true;
        const kids = node?.props?.children;
        return typeof kids === "object" && has(kids, test);
    };

    const at = children.findIndex(child => has(child, id => after.includes(id)));
    if (at !== -1) return void children.splice(at + 1, 0, entries);

    const before = children.findIndex(child =>
        String(child?.key ?? "").startsWith("vc-local-plugins") || has(child, id => id.startsWith("devmode-copy-id") || TAIL.includes(id)));
    if (before === -1) children.push(entries);
    else children.splice(before, 0, entries);
}

/** Discord's closing group, which nothing should sit under */
const TAIL = ["view-avatar", "vc-copy-user-url", "view-icon", "view-banner", "copy-server-info"];

const nameOf = (user: User) => (user as any).globalName ?? user.username;

const onUser = (enabled: () => boolean): NavContextMenuPatchCallback => (children, { user }: { user?: User; }) => {
    if (!enabled() || !user || user.id === UserStore.getCurrentUser()?.id) return;
    place(children, group("user", nameOf(user)), ["report-user", "block"]);
};

const serverCtx: NavContextMenuPatchCallback = (children, { guild }: { guild?: Guild; }) => {
    if (!settings.store.serverMenu || !guild) return;
    place(children, group("server", guild.name), ["report-guild", "leave-guild", "privacy"]);
};

const messageCtx: NavContextMenuPatchCallback = (children, { message }: { message?: Message; }) => {
    if (!settings.store.messageMenu || !message?.author || message.author.id === UserStore.getCurrentUser()?.id) return;
    place(children, group("message", nameOf(message.author)), ["report", "delete"]);
};

export default definePlugin({
    name: "FakeMod",
    description: "Fake moderator tools in your menus.",
    authors: [{ name: "reqon", id: 497562304498368513n }],

    settings,

    settingsAboutComponent: () => (
        <About
            menus
            icon={ShieldIcon}
            title="Menus that look like moderator tools"
            note="Only you see this. Every entry asks, says it was done, and does nothing: nothing is sent and nobody's account or server is touched."
            steps={[
                <>Open the <strong>...</strong> menu on a profile, or right-click a person, a server or a message.</>,
                <>Your <strong>Rank</strong> decides which entries work. A <strong>Trial Moderator</strong> can view, note, send for review and escalate; the rest are greyed out with the rank they need.</>
            ]}
        />
    ),

    /** One line for Additional Settings */
    hubSummary() {
        return RANK_NAME[rank()];
    },

    contextMenus: {
        "user-context": onUser(() => settings.store.userMenu),
        "user-profile-actions": onUser(() => settings.store.profileMenu),
        "user-profile-overflow-menu": onUser(() => settings.store.profileMenu),
        "guild-context": serverCtx,
        "message": messageCtx
    }
});
