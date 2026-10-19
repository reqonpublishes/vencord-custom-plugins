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
    guildMenu: {
        type: OptionType.BOOLEAN,
        displayName: "Show on servers",
        description: "Show \"Hide Server\" when you right-click a server",
        default: true
    },
    hideNew: {
        type: OptionType.BOOLEAN,
        displayName: "Hide new servers",
        description: "When you turn this back on, servers joined while it was off are hidden too, so your server list stays how you left it.",
        default: false
    },
    persist: {
        type: OptionType.BOOLEAN,
        displayName: "Keep after restart",
        description: "Hidden servers stay hidden when Discord restarts",
        default: true,
        // switching it off should not leave the old list sitting on disk
        onChange: (value: boolean) => void (value || forgetSaved())
    },
    hidden: {
        type: OptionType.COMPONENT,
        component: HiddenList
    }
});
