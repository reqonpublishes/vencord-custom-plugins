/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { OptionType } from "@utils/types";

import { ClearAllButton } from "./ClearAllButton";
import { forgetSaved } from "./edits";

export const settings = definePluginSettings({
    button: {
        type: OptionType.SELECT,
        description: "Hover button on messages",
        options: [
            { label: "Show only while Shift is held", value: "shift", default: true },
            { label: "Always show", value: "always" },
            { label: "Never show", value: "never" }
        ]
    },
    messageMenu: {
        type: OptionType.BOOLEAN,
        description: "Add \"Inspect Message\" to the right-click menu on a message",
        default: true
    },
    persist: {
        type: OptionType.BOOLEAN,
        description: "Remember edits after Discord restarts",
        default: true,
        // switching it off shouldn't leave the old list sitting on disk
        onChange: (value: boolean) => void (value || forgetSaved())
    },
    clearAll: {
        type: OptionType.COMPONENT,
        description: "Undo every edit and start fresh",
        component: ClearAllButton
    }
});
