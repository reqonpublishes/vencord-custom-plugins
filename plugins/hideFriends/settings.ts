/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { OptionType } from "@utils/types";

import { HiddenList } from "./HiddenList";
import { forgetSaved } from "./store";

export const settings = definePluginSettings({
    userMenu: {
        type: OptionType.BOOLEAN,
        description: "Add \"Hide Friend\" and the other entries when you right-click a person",
        default: true
    },
    persist: {
        type: OptionType.BOOLEAN,
        description: "Keep people hidden and faked after Discord restarts",
        default: true,
        // switching it off should not leave the old list sitting on disk
        onChange: (value: boolean) => void (value || forgetSaved())
    },
    people: {
        type: OptionType.COMPONENT,
        description: "Everybody hidden or faked, and the way back",
        component: HiddenList
    }
});
