/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { statSync } from "fs";
import { join } from "path";

/**
 * When the Vencord build on disk was last written.
 *
 * Asked of the main process because the page cannot look at files. Restarting plugins runs the
 * code that was loaded when the window opened, so once a newer build is on disk only a reload
 * brings it in - and this is how the restart shortcut knows which of the two to do.
 */
export function builtAt(): number {
    for (const name of ["renderer.js", "vencordDesktopRenderer.js"]) {
        try {
            return statSync(join(__dirname, name)).mtimeMs;
        } catch { /* not this one */ }
    }

    return 0;
}
