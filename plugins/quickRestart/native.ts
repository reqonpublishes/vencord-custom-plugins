/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { BrowserWindow, IpcMainInvokeEvent } from "electron";
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

// ---------------------------------------------------------------- a reload you do not see

let cover: BrowserWindow | null = null;
let coverTimer: ReturnType<typeof setTimeout> | null = null;

/** Take the picture away, revealing the window underneath */
export function uncover() {
    if (coverTimer) clearTimeout(coverTimer);
    coverTimer = null;

    try {
        cover?.destroy();
    } catch { /* already gone */ }
    cover = null;
}

/** What is laid over the window while it reloads: the window as it was, and a small pill */
const coverPage = (picture: string) => `<!doctype html><html><head><meta charset="utf-8"><style>
html,body{margin:0;height:100%;overflow:hidden;background:#000;cursor:progress}
img{display:block;width:100%;height:100%}
.pill{position:fixed;left:50%;bottom:28px;transform:translateX(-50%);display:flex;gap:10px;align-items:center;
padding:10px 16px;border-radius:999px;background:rgba(20,20,24,.86);color:#fff;font:600 14px/1 system-ui,sans-serif;
box-shadow:0 8px 24px rgba(0,0,0,.35)}
.spin{width:14px;height:14px;border-radius:50%;border:2px solid rgba(255,255,255,.3);border-top-color:#fff;animation:s .8s linear infinite}
@keyframes s{to{transform:rotate(360deg)}}
</style></head><body><img src="${picture}"><div class="pill"><div class="spin"></div>Restarting Discord</div></body></html>`;

/**
 * Reload the window without the flash.
 *
 * A reload clears the window and draws Discord's loading screen for a few seconds before
 * anything comes back. Instead, a picture of the window as it is now is laid exactly over it,
 * the window reloads underneath, and the picture is taken away when the new one says it is
 * ready - so what you see is your Discord, a small "Restarting" pill, then your Discord again.
 *
 * Clicks pass straight through the picture, and it takes itself away after fifteen seconds
 * whatever happens, so it can never be left in the way.
 */
export async function reloadCovered(event: IpcMainInvokeEvent) {
    const contents = event.sender;
    const win = BrowserWindow.fromWebContents(contents);

    uncover();

    if (win && !win.isMinimized() && win.isVisible()) {
        try {
            const shot = await contents.capturePage();
            const bounds = win.getContentBounds();

            cover = new BrowserWindow({
                x: bounds.x,
                y: bounds.y,
                width: bounds.width,
                height: bounds.height,
                parent: win,
                frame: false,
                show: false,
                resizable: false,
                movable: false,
                minimizable: false,
                maximizable: false,
                focusable: false,
                skipTaskbar: true,
                hasShadow: false,
                backgroundColor: "#000000",
                webPreferences: { javascript: false, sandbox: true }
            });
            cover.setIgnoreMouseEvents(true);
            await cover.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(coverPage("data:image/jpeg;base64," + shot.toJPEG(88).toString("base64"))));
            cover.showInactive();

            coverTimer = setTimeout(uncover, 15000);
        } catch {
            uncover();
        }
    }

    contents.reload();
}

/** Whether the picture is up right now - for checking a reload behaved, without looking at the screen */
export function isCovered(): boolean {
    return !!cover && !cover.isDestroyed();
}
