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
        displayName: "Inspect button on hover",
        description: "When the Inspect button shows in the bar above a message.",
        options: [
            { label: "While holding Shift", value: "shift", default: true },
            { label: "Always", value: "always" },
            { label: "Never", value: "never" }
        ]
    },
    messageMenu: {
        type: OptionType.BOOLEAN,
        displayName: "Show in the message menu",
        description: "Inspect Message shows when you right-click a message.",
        default: true
    },
    persist: {
        type: OptionType.BOOLEAN,
        displayName: "Keep after restart",
        description: "Changed messages stay changed after a restart.",
        default: true,
        // switching it off should not leave the old list sitting on disk
        onChange: (value: boolean) => void (value || forgetSaved())
    },
    clearAll: {
        type: OptionType.COMPONENT,
        component: EditedPanel
    }
});
