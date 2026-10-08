/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { OptionType } from "@utils/types";

import { EditedPanel } from "./EditedPanel";
import { forgetSaved } from "./edits";

export const settings = definePluginSettings({
    button: {
        type: OptionType.SELECT,
        displayName: "Hover button",
        description: "When the Inspect button appears in the bar over a message",
        options: [
            { label: "Only while Shift is held", value: "shift", default: true },
            { label: "Always", value: "always" },
            { label: "Never", value: "never" }
        ]
    },
    messageMenu: {
        type: OptionType.BOOLEAN,
        displayName: "Show on messages",
        description: "Adds Inspect Message to the menu when you right-click a message",
        default: true
    },
    persist: {
        type: OptionType.BOOLEAN,
        displayName: "Keep after restart",
        description: "Changed messages stay changed when Discord restarts",
        default: true,
        // switching it off should not leave the old list sitting on disk
        onChange: (value: boolean) => void (value || forgetSaved())
    },
    clearAll: {
        type: OptionType.COMPONENT,
        component: EditedPanel
    }
});
