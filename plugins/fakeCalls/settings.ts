/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { OptionType } from "@utils/types";

import { AddedPanel } from "./AddedPanel";
import { forgetSaved } from "./store";

export const settings = definePluginSettings({
    messageMenu: {
        type: OptionType.BOOLEAN,
        displayName: "Show on messages",
        description: "Adds Add Fake Call Here to the menu when you right-click a message in a DM",
        default: true
    },
    channelMenu: {
        type: OptionType.BOOLEAN,
        displayName: "Show on conversations",
        description: "Adds Add Fake Call to the menu when you right-click a DM or a person",
        default: true
    },
    persist: {
        type: OptionType.BOOLEAN,
        displayName: "Keep after restart",
        description: "Fake calls are still there when Discord restarts",
        default: true,
        // switching it off should not leave the old list sitting on disk
        onChange: (value: boolean) => void (value || forgetSaved())
    },
    clearAll: {
        type: OptionType.COMPONENT,
        component: AddedPanel
    }
});
