/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";

import definePlugin from "@utils/types";

import { settings } from "./settings";

export default definePlugin({
    name: "CustomPluginSync",
    description: "Keep what you have hidden and rewritten the same on your phone and this computer. One link joins them, and nothing moves until you press a button.",
    tags: ["Utility"],
    authors: [{ name: "reqon", id: 0n }],

    settings
});
