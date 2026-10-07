/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { OptionType } from "@utils/types";

import { HiddenList } from "./HiddenList";
import { forgetSaved } from "./store";

export const settings = definePluginSettings({
    guildMenu: {
        type: OptionType.BOOLEAN,
        description: "Add \"Hide Server\" when you right-click a server",
        default: true
    },
    persist: {
        type: OptionType.BOOLEAN,
        description: "Keep servers hidden after Discord restarts",
        default: true,
        // switching it off should not leave the old list sitting on disk
        onChange: (value: boolean) => void (value || forgetSaved())
    },
    hidden: {
        type: OptionType.COMPONENT,
        description: "Servers you have hidden",
        component: HiddenList
    }
});
