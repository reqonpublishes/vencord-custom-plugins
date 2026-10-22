/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { OptionType } from "@utils/types";

import { FakeList } from "./FakeList";
import { forgetSaved } from "./friends";

export const settings = definePluginSettings({
    userMenu: {
        type: OptionType.BOOLEAN,
        displayName: "Show in the people menu",
        description: "Fake Friend, Fake Request and Fake Block show when you right-click someone.",
        default: true
    },
    persist: {
        type: OptionType.BOOLEAN,
        displayName: "Keep after restart",
        description: "Fake friends, requests and blocks stay after a restart.",
        default: true,
        // switching it off should not leave the old list sitting on disk
        onChange: (value: boolean) => void (value || forgetSaved("fake"))
    },
    people: {
        type: OptionType.COMPONENT,
        component: FakeList
    }
});
