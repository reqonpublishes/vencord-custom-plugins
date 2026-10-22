/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { OptionType } from "@utils/types";

import { forgetSavedChannels } from "./channels";
import { HiddenList } from "./HiddenList";
import { forgetSaved } from "./store";
import { menuChips } from "./ui";

export const settings = definePluginSettings({
    menus: {
        type: OptionType.COMPONENT,
        component: menuChips(() => settings, "Show in menus", "Which menus show Hide Server and Hide Channel.", [{ key: "guildMenu", label: "Servers" }, { key: "channelMenu", label: "Channels" }])
    },
    guildMenu: {
        type: OptionType.BOOLEAN,
        hidden: true,
        description: "Hide Server shows when you right-click a server.",
        default: true
    },
    channelMenu: {
        type: OptionType.BOOLEAN,
        hidden: true,
        description: "Hide Channel shows when you right-click a channel in a server.",
        default: true
    },
    hideNew: {
        type: OptionType.BOOLEAN,
        displayName: "Hide new servers when turned back on",
        description: "Servers joined while it was off are hidden too.",
        default: false
    },
    persist: {
        type: OptionType.BOOLEAN,
        displayName: "Keep after restart",
        description: "Hidden servers and channels stay hidden after a restart.",
        default: true,
        // switching it off should not leave the old list sitting on disk
        onChange: (value: boolean) => {
            if (value) return;
            forgetSaved();
            forgetSavedChannels();
        }
    },
    hidden: {
        type: OptionType.COMPONENT,
        component: HiddenList
    }
});
