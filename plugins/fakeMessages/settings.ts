/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { OptionType } from "@utils/types";

import { ClearAllButton } from "./ClearAllButton";
import { forgetSaved } from "./store";

export const settings = definePluginSettings({
    messageMenu: {
        type: OptionType.BOOLEAN,
        description: "Add \"Add Message Here\" to the right-click menu on a message",
        default: true
    },
    channelMenu: {
        type: OptionType.BOOLEAN,
        description: "Add \"Add Message\" when you right-click a DM or channel in the sidebar",
        default: true
    },
    persist: {
        type: OptionType.BOOLEAN,
        description: "Remember added messages after Discord restarts",
        default: true,
        // switching it off should not leave the old list sitting on disk
        onChange: (value: boolean) => void (value || forgetSaved())
    },
    clearAll: {
        type: OptionType.COMPONENT,
        description: "Take every added message away",
        component: ClearAllButton
    }
});
