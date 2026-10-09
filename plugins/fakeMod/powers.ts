/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { BlockIcon, ClockIcon, EyeIcon, FlagIcon, GavelIcon, IconComponent, PencilIcon, ServerIcon, ShieldIcon, TrashIcon, UndoIcon } from "./icons";

/** How far up the ladder you are pretending to be. Each rank can do everything the one below can */
export const RANKS = ["trial", "moderator", "senior"] as const;
export type Rank = typeof RANKS[number];

export const RANK_NAME: Record<Rank, string> = {
    trial: "Trial Moderator",
    moderator: "Moderator",
    senior: "Senior Moderator"
};

/** What a thing is done to */
export type Target = "user" | "server" | "message";

/**
 * What pressing an entry looks like.
 *
 * - `info` opens a dialog that only tells you something
 * - `note` opens a box to write in
 * - `confirm` asks first, then says it was done
 */
export type Kind = "info" | "note" | "confirm";

export interface Power {
    id: string;
    target: Target;
    label: string;
    icon: IconComponent;
    /** the lowest rank that can use it */
    needs: Rank;
    kind: Kind;
    danger?: boolean;
    /** offered as a choice of lengths rather than one action */
    lengths?: string[];
    /** `%s` is the name of whoever or whatever it is about */
    title: string;
    body: string;
    confirm?: string;
    /** what the notice says afterwards; `%s` as above, `%c` a case number, `%l` the length chosen */
    done?: string;
}

/**
 * Everything a moderator could be shown, and the rank it takes.
 *
 * A trial moderator looks and passes things up: they can see standing and history, leave a
 * note, send something for review, and escalate. Acting on an account - suspending it,
 * resetting a name - starts at moderator, and closing an account or a server outright is
 * senior only. That split is what makes a trial rank read as one: most of the list is there
 * to be seen and not to be pressed.
 */
export const POWERS: Power[] = [
    // ---------------------------------------------------------------- people
    {
        id: "standing", target: "user", label: "View Account Standing", icon: EyeIcon, needs: "trial", kind: "info",
        title: "%s's account standing",
        body: "All good. No active violations, no open reports, and nothing awaiting review."
    },
    {
        id: "history", target: "user", label: "View Report History", icon: UndoIcon, needs: "trial", kind: "info",
        title: "Reports against %s",
        body: "No reports in the last 90 days. Older reports are archived and need Moderator access to open."
    },
    {
        id: "note", target: "user", label: "Add Staff Note", icon: PencilIcon, needs: "trial", kind: "note",
        title: "Staff note on %s",
        body: "Visible to moderators only. The account owner never sees it.",
        confirm: "Save Note",
        done: "Note saved on %s"
    },
    {
        id: "review", target: "user", label: "Force Profile Review", icon: ShieldIcon, needs: "trial", kind: "confirm",
        title: "Send %s's profile for review?",
        body: "Their avatar, banner, bio and display name go to the review queue. A moderator resets anything that breaks the guidelines.",
        confirm: "Send for Review",
        done: "Profile sent for review · Case %c"
    },
    {
        id: "escalate", target: "user", label: "Escalate Account", icon: FlagIcon, needs: "trial", kind: "confirm",
        title: "Escalate %s?",
        body: "This opens a case for a moderator to pick up. As a trial moderator you can raise it, but not act on it.",
        confirm: "Escalate",
        done: "Escalated · Case %c"
    },
    {
        id: "suspend", target: "user", label: "Suspend Account", icon: ClockIcon, needs: "moderator", kind: "confirm",
        lengths: ["24 Hours", "7 Days", "30 Days"],
        title: "Suspend %s for %l?",
        body: "They are logged out of every device and cannot sign in until the suspension ends. They are told why by email.",
        confirm: "Suspend",
        done: "%s suspended for %l · Case %c"
    },
    {
        id: "rename", target: "user", label: "Reset Username", icon: GavelIcon, needs: "moderator", kind: "confirm",
        title: "Reset %s's username?",
        body: "Their username and display name are replaced with generated ones, and they pick new ones the next time they sign in.",
        confirm: "Reset Username",
        done: "Username reset · Case %c"
    },
    {
        id: "disable", target: "user", label: "Disable Account", icon: BlockIcon, needs: "senior", kind: "confirm", danger: true,
        title: "Disable %s's account?",
        body: "The account is closed and its owner is told by email. It can only be undone by an appeal.",
        confirm: "Disable Account",
        done: "Account disabled · Case %c"
    },

    // ---------------------------------------------------------------- servers
    {
        id: "server-standing", target: "server", label: "View Server Standing", icon: EyeIcon, needs: "trial", kind: "info",
        title: "%s's standing",
        body: "All good. No active violations, and no open reports against the server or its owner."
    },
    {
        id: "server-review", target: "server", label: "Force Server Review", icon: ShieldIcon, needs: "trial", kind: "confirm",
        title: "Send %s for review?",
        body: "The server's name, icon, banner, channels and recent reports go to the review queue. Its members are not told.",
        confirm: "Send for Review",
        done: "Server sent for review · Case %c"
    },
    {
        id: "server-escalate", target: "server", label: "Escalate Server", icon: FlagIcon, needs: "trial", kind: "confirm",
        title: "Escalate %s?",
        body: "This opens a case for a moderator to pick up. As a trial moderator you can raise it, but not act on it.",
        confirm: "Escalate",
        done: "Escalated · Case %c"
    },
    {
        id: "server-quarantine", target: "server", label: "Quarantine Server", icon: ServerIcon, needs: "moderator", kind: "confirm",
        title: "Quarantine %s?",
        body: "Nobody new can join and the server is taken out of Discovery until a review is finished. Members can still talk.",
        confirm: "Quarantine",
        done: "Server quarantined · Case %c"
    },
    {
        id: "server-disable", target: "server", label: "Disable Server", icon: BlockIcon, needs: "senior", kind: "confirm", danger: true,
        title: "Disable %s?",
        body: "The server is closed for everybody in it and its owner is told by email. It can only be undone by an appeal.",
        confirm: "Disable Server",
        done: "Server disabled · Case %c"
    },

    // ---------------------------------------------------------------- messages
    {
        id: "message-review", target: "message", label: "Send Message for Review", icon: ShieldIcon, needs: "trial", kind: "confirm",
        title: "Send this message for review?",
        body: "The message and the ones around it go to the review queue. %s is not told.",
        confirm: "Send for Review",
        done: "Message sent for review · Case %c"
    },
    {
        id: "message-remove", target: "message", label: "Remove Message", icon: TrashIcon, needs: "moderator", kind: "confirm", danger: true,
        title: "Remove this message?",
        body: "It is deleted for everybody and a strike is recorded against %s.",
        confirm: "Remove Message",
        done: "Message removed · Case %c"
    }
];

/** Whether a rank is high enough */
export const reaches = (rank: Rank, needs: Rank) => RANKS.indexOf(rank) >= RANKS.indexOf(needs);
