/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { OptionType } from "@utils/types";

import { SyncPanel } from "./SyncPanel";

export const settings = definePluginSettings({
    link: {
        type: OptionType.STRING,
        description: "Your sync link. The same link on your phone and this computer is what joins them - treat it like a password",
        default: ""
    },
    hideMessages: {
        type: OptionType.BOOLEAN,
        description: "Share hidden messages and hidden chats",
        default: true
    },
    inspectMessages: {
        type: OptionType.BOOLEAN,
        description: "Share rewritten messages",
        default: true
    },
    fakeMessages: {
        type: OptionType.BOOLEAN,
        description: "Share messages you added",
        default: true
    },
    hideDMs: {
        type: OptionType.BOOLEAN,
        description: "Share which conversations are hidden",
        default: true
    },
    sync: {
        type: OptionType.COMPONENT,
        description: "Send what this computer has, or replace it with what is on the link",
        component: SyncPanel
    }
});
