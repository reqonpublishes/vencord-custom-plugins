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
    channelMenu: {
        type: OptionType.BOOLEAN,
        displayName: "Show on conversations",
        description: "Adds Hide DM to the menu when you right-click a conversation in your DM list",
        default: true
    },
    userMenu: {
        type: OptionType.BOOLEAN,
        displayName: "Show on people",
        description: "Adds Hide DM to the menu when you right-click a person, including in your friends list",
        default: true
    },
    persist: {
        type: OptionType.BOOLEAN,
        displayName: "Keep after restart",
        description: "Hidden DMs stay hidden when Discord restarts",
        default: true,
        // switching it off should not leave the old list sitting on disk
        onChange: (value: boolean) => void (value || forgetSaved())
    },
    hidden: {
        type: OptionType.COMPONENT,
        component: HiddenList
    }
});
