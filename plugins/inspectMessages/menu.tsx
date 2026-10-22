/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Menu, React } from "@webpack/common";

/**
 * The groups all of these plugins put their menu entries in.
 *
 * Each plugin adds its own entries without knowing about the others, and left to that they
 * land wherever each happened to put them. So they share groups, found by their keys, and
 * each entry carries a number saying where it belongs. The same file is in every plugin,
 * which is what lets them agree without depending on each other.
 *
 * There is one group for each kind - hiding, inspecting, faking - so a line divides them, and
 * all of them sit above Discord's last group (Copy ID, View Avatar) instead of under it.
 */
const GROUP = "vc-local-plugins";

/** The kinds, in the order they show, and the place numbers each one takes */
const KINDS = [
    { kind: "hide", below: 32 },
    { kind: "inspect", below: 35 },
    { kind: "fake", below: Infinity }
];

const kindOf = (rank: number) => KINDS.findIndex(({ below }) => rank < below);

export const isShared = () => !!(window as any).vcScreenShared;

/**
 * When these entries show at all, as chosen on Additional Settings: "always", "shift" (only
 * while Shift is held) or "never". Read off the window like the above; without Additional
 * Settings they always show.
 */
const menuMode = (): string => (window as any).vcMenuMode ?? "always";

let shift = false;

// Whichever press opened the menu, whether a right click or a click on a "..." button. Read
// in the capture phase so it is known before Discord starts building the menu.
const noteShift = (event: MouseEvent) => void (shift = event.shiftKey);
window.addEventListener("contextmenu", noteShift, true);
window.addEventListener("mousedown", noteShift, true);

const rankOf = (item: any) => parseInt(String(item?.key ?? "").split(":")[0], 10) || 0;

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

const ours = (node: any) => typeof node?.key === "string" && node.key.startsWith(GROUP + "-") ? Number(node.key.slice(GROUP.length + 1)) : -1;

/**
 * Put entries into the shared groups, in order.
 *
 * Lower numbers sit higher. Hiding comes first, then inspecting, then faking, and taking
 * something back sits straight under the thing that added it.
 */
export function place(children: any[], rank: number, ...items: any[]) {
    // On a shared screen a menu full of Hide and Fake entries says what this client is
    // doing as plainly as the lists would have. They are left out unless Shift is held,
    // which is a thing a viewer cannot see being done.
    if (isShared() && !shift) return;
    const mode = menuMode();
    if (mode === "never" || (mode === "shift" && !shift)) return;

    const kind = kindOf(rank);
    let group = children.find(child => ours(child) === kind);

    if (!group) {
        const list: any[] = [];
        group = <Menu.MenuGroup key={`${GROUP}-${kind}`}>{list}</Menu.MenuGroup>;

        // above a later kind of ours, or else above Discord's closing group, or else last
        const at = children.findIndex(child => ours(child) > kind || isTail(child));
        if (at === -1) children.push(group);
        else children.splice(at, 0, group);
    }

    const list: any[] = group.props.children;
    if (!Array.isArray(list)) return void children.push(...items);

    items.forEach((item, i) => {
        if (!item) return;

        // The place is carried in the key, since that is the one thing every copy of this
        // file can read off an entry another plugin made.
        const keyed = React.cloneElement(item, { key: `${rank}:${i}:${item.key ?? item.props?.id ?? ""}` });
        const at = list.findIndex(other => rankOf(other) > rank);

        if (at === -1) list.push(keyed);
        else list.splice(at, 0, keyed);
    });
}
