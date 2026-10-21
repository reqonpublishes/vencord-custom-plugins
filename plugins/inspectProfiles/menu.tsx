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
 * land wherever each happened to put them - one beside View Avatar, three at the bottom,
 * another in between. So they share a group, found by its key, and each entry carries a
 * number saying where in it it belongs. The same file is in every plugin, which is what lets
 * them agree without depending on each other.
 */
const GROUP = "vc-local-plugins";

/**
 * Whether the screen is being shown to somebody, as Plugin Hub's Screen Share Protection
 * sees it. Read off the window because that is the one place every plugin can look without
 * depending on Plugin Hub being there.
 */
export const isShared = () => !!(window as any).vcScreenShared;

let shift = false;

// Whichever press opened the menu, whether a right click or a click on a "..." button. Read
// in the capture phase so it is known before Discord starts building the menu.
const noteShift = (event: MouseEvent) => void (shift = event.shiftKey);
window.addEventListener("contextmenu", noteShift, true);
window.addEventListener("mousedown", noteShift, true);

const rankOf = (item: any) => parseInt(String(item?.key ?? "").split(":")[0], 10) || 0;

/**
 * Put entries into the shared group, in order.
 *
 * Lower numbers sit higher. Hiding comes first, then faking, and taking something back sits
 * straight under the thing that added it.
 */
export function place(children: any[], rank: number, ...items: any[]) {
    // On a shared screen a menu full of Hide and Fake entries says what this client is
    // doing as plainly as the lists would have. They are left out unless Shift is held,
    // which is a thing a viewer cannot see being done.
    if (isShared() && !shift) return;

    let group = children.find(child => child?.key === GROUP);

    if (!group) {
        const list: any[] = [];
        group = <Menu.MenuGroup key={GROUP}>{list}</Menu.MenuGroup>;
        children.push(group);
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
