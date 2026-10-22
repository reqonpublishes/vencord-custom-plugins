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
        displayName: "Show in the server menu",
        description: "Hide Server shows when you right-click a server.",
        default: true
    },
    hideNew: {
        type: OptionType.BOOLEAN,
        displayName: "Hide new servers when turned back on",
        description: "Servers joined while it was off are hidden too.",
        default: false
    },
    persist: {
        type: OptionType.BOOLEAN,
        displayName: "Keep after restart",
        description: "Hidden servers stay hidden after a restart.",
        default: true,
        // switching it off should not leave the old list sitting on disk
        onChange: (value: boolean) => void (value || forgetSaved())
    },
    hidden: {
        type: OptionType.COMPONENT,
        component: HiddenList
    }
});
