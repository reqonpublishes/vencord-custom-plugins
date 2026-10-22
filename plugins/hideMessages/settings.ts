/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { OptionType } from "@utils/types";

import { HiddenPanel } from "./HiddenPanel";
import { forgetSaved } from "./store";
import { menuChips } from "./ui";

export const settings = definePluginSettings({
    button: {
        type: OptionType.SELECT,
        displayName: "Hide button on hover",
        description: "When the Hide button shows in the bar above a message.",
        options: [
            { label: "Same as right-click buttons", value: "menus", default: true },
            { label: "Always", value: "always" },
            { label: "While holding Ctrl", value: "ctrl" },
            { label: "Never", value: "never" }
        ]
    },
    /** Set once the old Ctrl default has been moved over to "Same as right-click buttons" */
    buttonMoved: {
        type: OptionType.BOOLEAN,
        description: "Moved off the old Ctrl default",
        hidden: true,
        default: false
    },
    menus: {
        type: OptionType.COMPONENT,
        component: menuChips(() => settings, "Show in menus", "Which menus show Hide Message.", [{ key: "messageMenu", label: "Messages" }, { key: "channelMenu", label: "Conversations" }, { key: "userMenu", label: "People" }, { key: "profileMenu", label: "Profiles" }])
    },
    messageMenu: {
        type: OptionType.BOOLEAN,
        hidden: true,
        displayName: "Show on messages",
        description: "Show \"Hide Message\" when you right-click a message",
        default: true
    },
    channelMenu: {
        type: OptionType.BOOLEAN,
        hidden: true,
        displayName: "Show on conversations",
        description: "Show \"Hide Messages\" when you right-click a DM or channel",
        default: true
    },
    userMenu: {
        type: OptionType.BOOLEAN,
        hidden: true,
        displayName: "Show on people",
        description: "Show \"Hide Messages\" when you right-click a person",
        default: true
    },
    profileMenu: {
        type: OptionType.BOOLEAN,
        hidden: true,
        displayName: "Show on profiles",
        description: "Show \"Hide Messages\" in the ... menu on a profile",
        default: true
    },
    persist: {
        type: OptionType.BOOLEAN,
        displayName: "Keep after restart",
        description: "Hidden messages stay hidden after a restart.",
        default: true,
        // switching it off should not leave the old list sitting on disk
        onChange: (value: boolean) => void (value || forgetSaved())
    },
    clearAll: {
        type: OptionType.COMPONENT,
        component: HiddenPanel
    }
});
