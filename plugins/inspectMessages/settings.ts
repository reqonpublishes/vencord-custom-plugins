/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { OptionType } from "@utils/types";

import { EditedPanel } from "./EditedPanel";
import { forgetSaved } from "./edits";
import { hoverChoice, menuChips } from "./ui";

export const settings = definePluginSettings({
    menus: {
        type: OptionType.COMPONENT,
        component: menuChips(() => settings, "Show in menus", "Which menus show Inspect Message.", [{ key: "messageMenu", label: "Messages" }])
    },
    // When the Inspect button shows above a message. Drawn by the choice below, and only used
    // without Additional Settings, whose Hover buttons decides for every plugin.
    button: {
        type: OptionType.SELECT,
        description: "When the Inspect button shows above a message",
        hidden: true,
        options: [
            { label: "Always", value: "always" },
            { label: "Holding Ctrl", value: "ctrl", default: true },
            { label: "Never", value: "never" }
        ]
    },
    buttonChoice: {
        type: OptionType.COMPONENT,
        component: hoverChoice(() => settings, "When the Inspect button shows above a message.")
    },
    messageMenu: {
        type: OptionType.BOOLEAN,
        hidden: true,
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
