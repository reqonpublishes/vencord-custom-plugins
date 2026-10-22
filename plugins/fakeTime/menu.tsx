/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Menu, React } from "@webpack/common";

/**
 * The one group all of these plugins put their menu entries in.
 *
 * Each plugin adds its own entries without knowing about the others, and left to that they
 * land wherever each happened to put them. So they share a group, found by its key, and each
 * entry carries a number saying where it belongs. The same file is in every plugin, which is
 * what lets them agree without depending on each other.
 *
 * Inspecting comes first and stays as it is, since it is the one used most. Hiding and faking
 * each fold into one entry - Hide Options, Fake Options - that opens to the rest, so the menu
 * stays short. A
 * kind with a single entry is shown as that entry: a folder holding one thing is a wasted
 * click. The group sits above Discord's last one (Copy ID, View Avatar), not under it.
 */
const GROUP = "vc-local-plugins";

const EYE_OFF = "M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.43-4.75-1.73-4.39-6-7.5-11-7.5-1.4 0-2.74.25-3.98.7l2.16 2.16C10.74 7.13 11.35 7 12 7zM2 4.27l2.28 2.28.46.46C3.08 8.3 1.78 10.02 1 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l.42.42L19.73 22 21 20.73 3.27 3 2 4.27zM7.53 9.8l1.55 1.55c-.05.21-.08.43-.08.65 0 1.66 1.34 3 3 3 .22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53-2.76 0-5-2.24-5-5 0-.79.2-1.53.53-2.2zm4.31-.78l3.15 3.15.02-.16c0-1.66-1.34-3-3-3l-.17.01z";
const WAND = "M7.5 5.6L10 7 8.6 4.5 10 2 7.5 3.4 5 2l1.4 2.5L5 7zm12 9.8L17 14l1.4 2.5L17 19l2.5-1.4L22 19l-1.4-2.5L22 14zM22 2l-2.5 1.4L17 2l1.4 2.5L17 7l2.5-1.4L22 7l-1.4-2.5zm-7.63 5.29c-.39-.39-1.02-.39-1.41 0L1.29 18.96c-.39.39-.39 1.02 0 1.41l2.34 2.34c.39.39 1.02.39 1.41 0L16.7 11.05c.39-.39.39-1.02 0-1.41l-2.33-2.35zm-1.03 5.49l-2.12-2.12 2.44-2.44 2.12 2.12-2.44 2.44z";

const icon = (path: string) => ({ height = 24, width = 24, className }: { height?: number | string; width?: number | string; className?: string; }) => (
    <svg className={className} height={height} width={width} viewBox="0 0 24 24" aria-hidden="true">
        <path fill="currentColor" d={path} />
    </svg>
);

/** The kinds, in the order they show, the place numbers each takes, and what each folds into */
const KINDS: { below: number; id?: string; label?: string; icon?: ReturnType<typeof icon>; }[] = [
    { below: 10 },
    { below: 35, id: "hide", label: "Hide Options", icon: icon(EYE_OFF) },
    { below: Infinity, id: "fake", label: "Fake Options", icon: icon(WAND) }
];

const kindOf = (rank: number) => KINDS.findIndex(({ below }) => rank < below);

/**
 * Whether the screen is being shown to somebody, as Plugin Hub's Screen Share Protection
 * sees it. Read off the window because that is the one place every plugin can look without
 * depending on Plugin Hub being there.
 */
export const isShared = () => !!(window as any).vcScreenShared;

/**
 * When these entries show at all, as chosen on Additional Settings: "always", "ctrl" (only
 * while Ctrl is held) or "never". Read off the window like the above; without Additional
 * Settings they always show. "shift" is what the held key was called before it was Ctrl.
 */
const menuMode = (): string => (window as any).vcMenuMode ?? "always";

let ctrl = false;

// Whichever press opened the menu, whether a right click or a click on a "..." button. Read
// in the capture phase so it is known before Discord starts building the menu. A press inside
// a menu that is already open is choosing an entry, not opening one: reading it would take the
// entries away the moment Ctrl is let go, under the pointer that is about to click them.
const noteCtrl = (event: MouseEvent) => {
    if ((event.target as Element | null)?.closest?.('[role="menu"]')) return;
    ctrl = event.ctrlKey;
};
window.addEventListener("contextmenu", noteCtrl, true);
window.addEventListener("mousedown", noteCtrl, true);

/** Whether a menu entry, or any group or list around it, holds an entry with one of these ids */
function holds(node: any, test: (id: string) => boolean): boolean {
    if (!node) return false;
    if (Array.isArray(node)) return node.some(kid => holds(kid, test));

    const id = node.props?.id;
    if (typeof id === "string" && test(id)) return true;

    const kids = node.props?.children;
    return typeof kids === "object" && holds(kids, test);
}

/** Discord's closing group - Copy ID, View Avatar, View Icon, Copy Server Info - which ours sit above */
const TAIL = ["view-avatar", "vc-copy-user-url", "view-icon", "view-banner", "copy-server-info"];
const isTail = (node: any) => holds(node, id => id.startsWith("devmode-copy-id") || TAIL.includes(id));

/**
 * Where an entry of ours belongs, read off its key: `kind|rank:...` for an entry, `fold-kind`
 * for a folder. The key is the one thing every copy of this file can read off an entry
 * another plugin made.
 */
function placeOf(item: any): { kind: number; rank: number; } {
    const key = String(item?.key ?? "");
    if (key.startsWith("fold-")) return { kind: Number(key.slice(5)), rank: -1 };

    const [kind, rest = ""] = key.split("|");
    return { kind: Number(kind) || 0, rank: parseInt(rest, 10) || 0 };
}

const order = (item: any) => {
    const { kind, rank } = placeOf(item);
    return kind * 1e6 + rank;
};

/** Put entries into a list, each before the first one that belongs after it */
function insert(list: any[], items: any[]) {
    for (const item of items) {
        const at = list.findIndex(other => order(other) > order(item));
        if (at === -1) list.push(item);
        else list.splice(at, 0, item);
    }
}

/**
 * Put entries into the shared group, in order.
 *
 * Lower numbers sit higher: inspecting under 10, hiding under 35, faking after. Taking
 * something back sits straight under the thing that added it.
 */
export function place(children: any[], rank: number, ...items: any[]) {
    // On a shared screen a menu full of Hide and Fake entries says what this client is
    // doing as plainly as the lists would have. They are left out unless Ctrl is held,
    // which is a thing a viewer cannot see being done.
    if (isShared() && !ctrl) return;
    const mode = menuMode();
    if (mode === "never" || (mode !== "always" && !ctrl)) return;

    let group = children.find(child => child?.key === GROUP);

    if (!group) {
        group = <Menu.MenuGroup key={GROUP}>{[]}</Menu.MenuGroup>;

        // above Discord's closing group, or else last
        const at = children.findIndex(isTail);
        if (at === -1) children.push(group);
        else children.splice(at, 0, group);
    }

    const list: any[] = group.props.children;
    if (!Array.isArray(list)) return void children.push(...items);

    const kind = kindOf(rank);
    const { id, label, icon: Icon } = KINDS[kind];
    const keyed = items
        .filter(Boolean)
        .map((item, i) => React.cloneElement(item, { key: `${kind}|${rank}:${i}:${item.key ?? item.props?.id ?? ""}` }));

    if (!label || !Icon) return void insert(list, keyed);

    const folder = list.find(item => item?.key === `fold-${kind}`);
    if (folder) return void insert(folder.props.children, keyed);

    const loose = list.filter(item => !String(item?.key ?? "").startsWith("fold-") && placeOf(item).kind === kind);
    if (loose.length + keyed.length < 2) return void insert(list, keyed);

    // A second entry of this kind: the two go into a folder named for it
    const inside: any[] = [];
    insert(inside, [...loose, ...keyed]);
    for (const item of loose) list.splice(list.indexOf(item), 1);

    insert(list, [
        <Menu.MenuItem
            key={`fold-${kind}`}
            id={`vc-local-${id}`}
            label={label}
            icon={Icon}
            leadingAccessory={{ type: "icon", icon: Icon }}
        >
            {inside}
        </Menu.MenuItem>
    ]);
}
