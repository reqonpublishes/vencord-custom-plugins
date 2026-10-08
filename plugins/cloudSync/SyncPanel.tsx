/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Logger } from "@utils/Logger";
import { React, showToast } from "@webpack/common";

import { CheckIcon, CloudDownIcon, CloudUpIcon, CopyIcon, IconComponent, LinkIcon, RefreshIcon } from "./icons";
import { Last, settings } from "./settings";
import { looksLikeLink, makeLink } from "./shelf";
import { bringDown, sendUp } from "./sync";
import { cl, IconButton, Panel } from "./ui";

const logger = new Logger("CloudSync");

/** "just now", "5 minutes ago", and after a day the date - how long since a sync */
function ago(at: number) {
    const minutes = Math.floor((Date.now() - at) / 60_000);
    if (minutes < 1) return "just now";
    if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;

    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;

    return new Date(at).toLocaleDateString();
}

const lastLine = (last: Last | null, never: string) =>
    last ? `Last synced ${ago(last.at)}` : never;

/** One of the two directions, as a card you press */
function Way({ icon: Icon, name, detail, disabled, onClick }: {
    icon: IconComponent;
    name: string;
    detail: string;
    disabled: boolean;
    onClick(): void;
}) {
    return (
        <button className={cl("way")} disabled={disabled} onClick={onClick}>
            <div className={cl("tile")}>
                <Icon height={20} width={20} />
            </div>
            <div className={cl("way-text")}>
                <div className={cl("way-name")}>{name}</div>
                <div className={cl("way-detail")}>{detail}</div>
            </div>
        </button>
    );
}

/**
 * The link, the two directions, and the one line that says what happened.
 *
 * Syncing to the cloud and syncing from it are deliberately separate, and neither happens
 * on its own. Syncing in the background means the moment you hide something on one device
 * it is decided for the other, and a mistake spreads before you have noticed it. A button
 * pressed is a decision.
 */
export function SyncPanel() {
    const { link, lastUp, lastDown } = settings.use(["link", "lastUp", "lastDown"]);

    const [busy, setBusy] = React.useState<"" | "up" | "down">("");
    const [said, setSaid] = React.useState<{ text: string; kind: "good" | "bad"; } | null>(null);

    const held = String(link ?? "").trim();
    const ready = !!held && looksLikeLink(held);
    const bad = !!held && !ready;

    const run = async (which: "up" | "down") => {
        setBusy(which);
        setSaid(null);

        try {
            if (which === "up") {
                const { sent } = await sendUp();
                settings.store.lastUp = { at: Date.now(), what: sent };

                const text = sent.length ? "Synced to cloud: " + sent.join(", ") : "Nothing to sync yet";
                setSaid({ text, kind: "good" });
                showToast("Synced to cloud", "success");
            } else {
                const { applied } = await bringDown();
                settings.store.lastDown = { at: Date.now(), what: applied };

                const text = applied.length ? "Synced from cloud: " + applied.join(", ") : "The cloud has nothing on this link yet";
                setSaid({ text, kind: "good" });
                showToast("Synced from cloud", "success");
            }
        } catch (e) {
            const why = e instanceof Error ? e.message : String(e);
            setSaid({ text: why, kind: "bad" });
            showToast(why, "failure");
            logger.error("Sync failed", e);
        } finally {
            setBusy("");
        }
    };

    const copy = async () => {
        try {
            await navigator.clipboard.writeText(held);
            showToast("Link copied", "success");
        } catch {
            showToast("Could not copy. Select the link and copy it yourself.", "failure");
        }
    };

    return (
        <Panel>
            <div className={cl("link")}>
                <div className={cl("link-head")}>
                    <div className={cl("tile")}>
                        <LinkIcon height={20} width={20} />
                    </div>
                    <div className={cl("row-text")}>
                        <div className={cl("row-name")}>Sync link</div>
                        <div className={cl("row-detail")}>
                            The same link on your phone and here is what joins them. Treat it like a password.
                        </div>
                    </div>
                    <div className={cl("state", ready ? "state-on" : "")}>
                        {ready && <CheckIcon height={12} width={12} />}
                        {ready ? "Linked" : bad ? "Not a sync link" : "No link"}
                    </div>
                </div>

                <div className={cl("field")}>
                    <input
                        type="text"
                        spellCheck={false}
                        aria-label="Sync link"
                        className={cl("input", bad ? "input-bad" : "")}
                        value={link ?? ""}
                        placeholder="Paste the link from your phone, or make a new one"
                        onChange={e => {
                            settings.store.link = e.currentTarget.value.trim();
                            setSaid(null);
                        }}
                    />
                    <IconButton icon={CopyIcon} variant="secondary" disabled={!held || !!busy} onClick={copy}>
                        Copy
                    </IconButton>
                    <IconButton
                        icon={RefreshIcon}
                        variant="secondary"
                        disabled={!!busy}
                        onClick={() => {
                            settings.store.link = makeLink();
                            setSaid({ text: "New link made. Paste the same link into Sync on your phone.", kind: "good" });
                        }}
                    >
                        {held ? "New Link" : "Make a Link"}
                    </IconButton>
                </div>
            </div>

            <div className={cl("ways")}>
                <Way
                    icon={CloudUpIcon}
                    name={busy === "up" ? "Syncing..." : "Sync to Cloud"}
                    detail={ready ? lastLine(lastUp, "Uploads what this computer has") : "Needs a link first"}
                    disabled={!ready || !!busy}
                    onClick={() => run("up")}
                />
                <Way
                    icon={CloudDownIcon}
                    name={busy === "down" ? "Syncing..." : "Sync from Cloud"}
                    detail={ready ? lastLine(lastDown, "Replaces what this computer has") : "Needs a link first"}
                    disabled={!ready || !!busy}
                    onClick={() => run("down")}
                />
            </div>

            <div className={cl("said", said ? "said-" + said.kind : "")}>
                {said
                    ? said.text
                    : "Sync to Cloud uploads this computer's copy. Sync from Cloud replaces this computer's copy with the cloud's."}
            </div>

            <div className={cl("group-title")}>What to sync</div>
        </Panel>
    );
}
