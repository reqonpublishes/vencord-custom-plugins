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
import { About, cl } from "./ui";

const settings = definePluginSettings({
    rank: {
        type: OptionType.SELECT,
        displayName: "Rank",
        description: "Which moderator you appear to be. Lower ranks can use fewer of the actions",
        options: [
            { label: "Trial Moderator", value: "trial", default: true },
            { label: "Moderator", value: "moderator" },
            { label: "Senior Moderator", value: "senior" }
        ]
    },
    showLocked: {
        type: OptionType.BOOLEAN,
        displayName: "Show actions above your rank",
        description: "Lists them greyed out with the rank they need, instead of leaving them out",
        default: true
    },
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
    },
    serverMenu: {
        type: OptionType.BOOLEAN,
        displayName: "Show on servers",
        description: "Adds the moderation entries to the menu when you right-click a server",
        default: true
    },
    messageMenu: {
        type: OptionType.BOOLEAN,
        displayName: "Show on messages",
        description: "Adds the moderation entries to the menu when you right-click a message",
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
                showToast(fill(power.done ?? "Saved", name), "success");
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
        onConfirm: () => showToast(fill(power.done ?? "Done", name, length), "success")
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
 * Put a group straight after one of Discord's own entries, or at the end if it is not there.
 *
 * On a person that is Ignore / Block / Report, which is where something like this would sit.
 */
function place(children: any[], entries: any, after: string[]) {
    if (!entries) return;

    const has = (node: any): boolean => {
        const kids = node?.props?.children;
        const list = Array.isArray(kids) ? kids : kids ? [kids] : [];
        return list.some((kid: any) => after.includes(kid?.props?.id) || has(kid));
    };

    const at = children.findIndex(has);
    if (at === -1) children.push(entries);
    else children.splice(at + 1, 0, entries);
}

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
    description: "Adds moderation entries to people, servers and messages, as if you were a moderator. Pick a rank; a trial moderator can use fewer of them. None of them do anything.",
    tags: ["Fun", "Appearance"],
    authors: [{ name: "reqon", id: 497562304498368513n }],

    settings,

    settingsAboutComponent: () => (
        <About
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
        return `Shown as ${RANK_NAME[rank()]}`;
    },

    contextMenus: {
        "user-context": onUser(() => settings.store.userMenu),
        "user-profile-actions": onUser(() => settings.store.profileMenu),
        "user-profile-overflow-menu": onUser(() => settings.store.profileMenu),
        "guild-context": serverCtx,
        "message": messageCtx
    }
});
