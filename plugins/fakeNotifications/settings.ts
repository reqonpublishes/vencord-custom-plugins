/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { OptionType } from "@utils/types";

import { CountsPanel } from "./CountsPanel";

export const settings = definePluginSettings({
    // How far each badge is moved from the truth. Absent means left alone, which is not the
    // same as nought: nought is a difference of none, and showing the real count is a thing
    // you can ask for.
    friends: {
        type: OptionType.CUSTOM,
        default: null as number | null
    },
    requests: {
        type: OptionType.CUSTOM,
        default: null as number | null
    },
    counts: {
        type: OptionType.COMPONENT,
        component: CountsPanel
    }
});
