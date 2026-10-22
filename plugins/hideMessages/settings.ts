/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { OptionType } from "@utils/types";

import { HiddenPanel } from "./HiddenPanel";
import { forgetSaved } from "./store";
import { hoverChoice, menuChips } from "./ui";

export const settings = definePluginSettings({
    // When the Hide button shows above a message. Drawn by the choice below, and only used
    // without Additional Settings, whose Hover buttons decides for every plugin.
    button: {
        type: OptionType.SELECT,
        description: "When the Hide button shows above a message",
        hidden: true,
        options: [
            { label: "Always", value: "always" },
            { label: "Holding Ctrl", value: "ctrl", default: true },
            { label: "Never", value: "never" }
        ]
    },
    buttonChoice: {
        type: OptionType.COMPONENT,
        component: hoverChoice(() => settings, "When the Hide button shows above a message.")
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
