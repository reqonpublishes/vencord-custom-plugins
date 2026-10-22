/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

/**
 * A toast that replaces whatever toast is showing instead of waiting behind it.
 *
 * Discord shows one toast at a time and queues the rest. Something pressed ten times in a
 * row - Turn Off, Ctrl+Z - then plays ten toasts back one after another, long after anybody
 * cares. Only the newest is worth reading, so the queue and the toast on screen are cleared
 * first.
 */

import { findLazy } from "@webpack";
import { showToast } from "@webpack/common";

const ToastState = findLazy(m => typeof m?.getState === "function" && m.getState?.()?.queuedToastsMap instanceof Map);

export function say(text: string, variant: "success" | "critical" | "default" = "success") {
    try {
        ToastState.setState((state: any) => {
            const queued = new Map(state.queuedToastsMap);
            const current = new Map(state.currentToastMap);
            queued.delete("app");
            current.delete("app");
            return { ...state, queuedToastsMap: queued, currentToastMap: current };
        });
    } catch { /* the toast still shows, only behind the others */ }

    showToast({ text, variant } as any);
}
