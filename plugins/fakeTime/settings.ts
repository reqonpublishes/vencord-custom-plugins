/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { OptionType } from "@utils/types";

import { ShiftedList } from "./ShiftedList";
import { forgetSaved } from "./store";
import { menuChips } from "./ui";

export const settings = definePluginSettings({
    menus: {
        type: OptionType.COMPONENT,
        component: menuChips(() => settings, "Show in menus", "Which menus show Fake Time.", [{ key: "channelMenu", label: "Conversations" }, { key: "userMenu", label: "People" }])
    },
    channelMenu: {
        type: OptionType.BOOLEAN,
        hidden: true,
        description: "Fake Time on DMs and channels",
        default: true
    },
    userMenu: {
        type: OptionType.BOOLEAN,
        hidden: true,
        description: "Fake Time on people, for your DM with them",
        default: true
    },
    persist: {
        type: OptionType.BOOLEAN,
        displayName: "Keep after restart",
        description: "Moved conversations stay moved after a restart.",
        default: true,
        // switching it off should not leave the old list sitting on disk
        onChange: (value: boolean) => void (value || forgetSaved())
    },
    list: {
        type: OptionType.COMPONENT,
        component: ShiftedList
    }
});
