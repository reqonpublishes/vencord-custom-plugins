/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { OptionType } from "@utils/types";

import { AddedPanel } from "./AddedPanel";
import { forgetSaved } from "./store";
import { menuChips } from "./ui";

export const settings = definePluginSettings({
    menus: {
        type: OptionType.COMPONENT,
        component: menuChips(() => settings, "Show in menus", "Which menus show Add Fake Message.", [{ key: "messageMenu", label: "Messages" }, { key: "channelMenu", label: "Conversations" }])
    },
    messageMenu: {
        type: OptionType.BOOLEAN,
        hidden: true,
        displayName: "Show on messages",
        description: "Show \"Add Fake Message Here\" when you right-click a message",
        default: true
    },
    channelMenu: {
        type: OptionType.BOOLEAN,
        hidden: true,
        displayName: "Show on conversations",
        description: "Show \"Add Fake Message\" when you right-click a DM or channel",
        default: true
    },
    persist: {
        type: OptionType.BOOLEAN,
        displayName: "Keep after restart",
        description: "Fake messages stay after a restart.",
        default: true,
        // switching it off should not leave the old list sitting on disk
        onChange: (value: boolean) => void (value || forgetSaved())
    },
    clearAll: {
        type: OptionType.COMPONENT,
        component: AddedPanel
    }
});
