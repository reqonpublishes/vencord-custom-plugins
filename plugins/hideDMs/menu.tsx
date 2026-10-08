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

const rankOf = (item: any) => parseInt(String(item?.key ?? "").split(":")[0], 10) || 0;

/**
 * Put entries into the shared group, in order.
 *
 * Lower numbers sit higher. Hiding comes first, then faking, and taking something back sits
 * straight under the thing that added it.
 */
export function place(children: any[], rank: number, ...items: any[]) {
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
