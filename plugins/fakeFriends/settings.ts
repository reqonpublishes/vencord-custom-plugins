/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { OptionType } from "@utils/types";

import { FakeList } from "./FakeList";
import { forgetSaved } from "./friends";
import { menuChips } from "./ui";

export const settings = definePluginSettings({
    menus: {
        type: OptionType.COMPONENT,
        component: menuChips(() => settings, "Show in menus", "Which menus show the Fake entries.", [{ key: "userMenu", label: "People" }, { key: "profileMenu", label: "Profiles" }])
    },
    userMenu: {
        type: OptionType.BOOLEAN,
        hidden: true,
        description: "Show when you right-click someone",
        default: true
    },
    profileMenu: {
        type: OptionType.BOOLEAN,
        hidden: true,
        description: "Show in the ... menu on a profile",
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
