/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Button } from "@components/Button";
import { Logger } from "@utils/Logger";
import { React, showToast } from "@webpack/common";

import { settings } from "./settings";
import { looksLikeLink, makeLink } from "./shelf";
import { bringDown, sendUp } from "./sync";

const logger = new Logger("CustomPluginSync");

const when = (at: string | null) => {
    if (!at) return "never";

    try {
        return new Date(at).toLocaleString();
    } catch {
        return at;
    }
};

/**
 * The two buttons, and the one line that says what happened.
 *
 * Sending and fetching are deliberately separate, and neither happens on its own. Syncing in
 * the background means the moment you hide something on one device it is decided for the
 * other, and a mistake spreads before you have noticed it. A button pressed is a decision.
 */
export function SyncPanel() {
    const [busy, setBusy] = React.useState<"" | "send" | "fetch">("");
    const [said, setSaid] = React.useState("");

    const held = String(settings.store.link ?? "").trim();
    const ready = !!held && looksLikeLink(held);

    const run = async (which: "send" | "fetch") => {
        setBusy(which);
        setSaid("");

        try {
            if (which === "send") {
                const { at, sent } = await sendUp();
                setSaid(sent.length
                    ? "Sent " + sent.join(" and ") + " at " + when(at)
                    : "Nothing to send yet");
                showToast("Sent to the cloud", "success");
            } else {
                const { at, applied } = await bringDown();
                setSaid(applied.length
                    ? "Brought " + applied.join(" and ") + ", saved " + when(at)
                    : "That link has nothing on it yet");
                showToast("Fetched from the cloud", "success");
            }
        } catch (e) {
            const why = e instanceof Error ? e.message : String(e);
            setSaid(why);
            showToast(why, "failure");
            logger.error("Sync failed", e);
        } finally {
            setBusy("");
        }
    };

    return (
        <div className="vc-sync-panel">
            <div className="vc-sync-row">
                <Button
                    size="small"
                    disabled={!ready || !!busy}
                    onClick={() => run("send")}
                >
                    {busy === "send" ? "Sending..." : "Send to cloud"}
                </Button>

                <Button
                    size="small"
                    variant="secondary"
                    disabled={!ready || !!busy}
                    onClick={() => run("fetch")}
                >
                    {busy === "fetch" ? "Fetching..." : "Fetch from cloud"}
                </Button>

                <Button
                    size="small"
                    variant="secondary"
                    disabled={!!busy}
                    onClick={() => {
                        settings.store.link = makeLink();
                        setSaid("New link made. Put the same one on your phone.");
                    }}
                >
                    {held ? "New link" : "Make a link"}
                </Button>

                <Button
                    size="small"
                    variant="secondary"
                    disabled={!held || !!busy}
                    onClick={async () => {
                        try {
                            await navigator.clipboard.writeText(held);
                            showToast("Link copied", "success");
                        } catch {
                            showToast("Could not copy - select it from the box above", "failure");
                        }
                    }}
                >
                    Copy link
                </Button>
            </div>

            <div className="vc-sync-said">
                {said || (ready
                    ? "Send puts this computer's copy on the shelf. Fetch replaces this computer's copy with what is there."
                    : "Make a link first, then put the same link on your phone.")}
            </div>
        </div>
    );
}
