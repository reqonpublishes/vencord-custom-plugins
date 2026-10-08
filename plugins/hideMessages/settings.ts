/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { OptionType } from "@utils/types";

import { HiddenPanel } from "./HiddenPanel";
import { forgetSaved } from "./store";

export const settings = definePluginSettings({
    button: {
        type: OptionType.SELECT,
        displayName: "Hover button",
        description: "When the Hide button appears in the bar over a message",
        options: [
            { label: "Only while Shift is held", value: "shift", default: true },
            { label: "Always", value: "always" },
            { label: "Never", value: "never" }
        ]
    },
    messageMenu: {
        type: OptionType.BOOLEAN,
        displayName: "Show on messages",
        description: "Adds Hide Message to the menu when you right-click a message",
        default: true
    },
    channelMenu: {
        type: OptionType.BOOLEAN,
        displayName: "Show on conversations",
        description: "Adds Hide Messages to the menu when you right-click a DM or channel",
        default: true
    },
    userMenu: {
        type: OptionType.BOOLEAN,
        displayName: "Show on people",
        description: "Adds Hide Messages to the menu when you right-click a person, including in your friends list",
        default: true
    },
    profileMenu: {
        type: OptionType.BOOLEAN,
        displayName: "Show on profiles",
        description: "Adds Hide Messages to the ... menu on a profile",
        default: true
    },
    persist: {
        type: OptionType.BOOLEAN,
        displayName: "Keep after restart",
        description: "Hidden messages stay hidden when Discord restarts",
        default: true,
        // switching it off should not leave the old list sitting on disk
        onChange: (value: boolean) => void (value || forgetSaved())
    },
    clearAll: {
        type: OptionType.COMPONENT,
        component: HiddenPanel
    }
});
