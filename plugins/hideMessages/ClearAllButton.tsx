/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Button } from "@components/Button";

import { clearAll } from "./store";

export function ClearAllButton() {
    return (
        <Button variant="dangerSecondary" size="small" onClick={() => clearAll()}>
            Clear all hidden messages
        </Button>
    );
}
