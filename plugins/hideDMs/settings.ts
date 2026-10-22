/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { OptionType } from "@utils/types";

import { HiddenList } from "./HiddenList";
import { forgetSaved } from "./store";
import { menuChips } from "./ui";

export const settings = definePluginSettings({
    menus: {
        type: OptionType.COMPONENT,
        component: menuChips(() => settings, "Show in menus", "Which menus show Hide DM.", [{ key: "channelMenu", label: "Conversations" }, { key: "userMenu", label: "People" }])
    },
    channelMenu: {
        type: OptionType.BOOLEAN,
        hidden: true,
        displayName: "Show on conversations",
        description: "Show \"Hide DM\" when you right-click a conversation",
        default: true
    },
    userMenu: {
        type: OptionType.BOOLEAN,
        hidden: true,
        displayName: "Show on people",
        description: "Show \"Hide DM\" when you right-click a person",
        default: true
    },
    hideNew: {
        type: OptionType.BOOLEAN,
        displayName: "Hide new DMs when turned back on",
        description: "DMs that showed up while it was off are hidden too.",
        default: false
    },
    persist: {
        type: OptionType.BOOLEAN,
        displayName: "Keep after restart",
        description: "Hidden DMs stay hidden after a restart.",
        default: true,
        // switching it off should not leave the old list sitting on disk
        onChange: (value: boolean) => void (value || forgetSaved())
    },
    hidden: {
        type: OptionType.COMPONENT,
        component: HiddenList
    }
});
