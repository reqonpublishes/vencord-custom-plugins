/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Settings } from "@api/Settings";
import { Button } from "@components/Button";
import { SettingsTab, wrapTab } from "@components/settings/tabs/BaseTab";
import { openPluginModal } from "@components/settings/tabs/plugins/PluginModal";
import { Switch } from "@components/Switch";
import { Logger } from "@utils/Logger";
import { React, showToast } from "@webpack/common";

import { settings } from ".";
import { applying, Entry, flipAll, installed, isOn, isView, needsRestart, pluginOf, SECTIONS, setOn, summaryOf } from "./hub";
import { CloudDownIcon, CloudUpIcon, EyeIcon, EyeOffIcon, GearIcon, RefreshIcon } from "./icons";
import { cl, IconButton } from "./ui";

const logger = new Logger("PluginHub");

/** Enabled in Vencord but waiting on a restart before it can do anything */
const isWaiting = (plugin: string) => !isOn(plugin) && !!Settings.plugins[plugin]?.enabled && needsRestart(plugin);

function PluginRow({ entry, onChange }: { entry: Entry; onChange(): void; }) {
    const { plugin, label, icon: Icon } = entry;
    const on = isOn(plugin);
    const waiting = isWaiting(plugin);

    return (
        <div className={cl("item", on ? "" : "item-off")}>
            <div className={cl("tile")}>
                <Icon height={20} width={20} />
            </div>
            <div className={cl("item-text")}>
                <div className={cl("item-name")}>{label}</div>
                <div className={cl("item-detail")}>
                    {waiting ? "Turns on when Discord restarts" : on ? summaryOf(entry) : entry.off}
                </div>
            </div>
            <Button
                className={cl("cog")}
                size="iconOnly"
                variant="none"
                aria-label={`${label} settings`}
                title={`${label} settings`}
                onClick={() => openPluginModal(pluginOf(plugin))}
            >
                <GearIcon height={20} width={20} />
            </Button>
            <Switch
                checked={on || waiting}
                onChange={next => {
                    const result = setOn(plugin, next);

                    if (result === "failed") showToast(`Could not turn ${label} ${next ? "on" : "off"}`, "failure");
                    if (result === "restart") showToast(`${label} turns on when Discord restarts`, "message");

                    onChange();
                }}
            />
        </div>
    );
}

/** Sync without going to find its settings: the two buttons, for whoever already has a link */
function SyncRow() {
    const sync = pluginOf("CloudSync");
    const [busy, setBusy] = React.useState<"" | "up" | "down">("");
    const { link } = Settings.plugins.CloudSync ?? {};

    if (!sync?.started) return null;

    const run = async (which: "up" | "down") => {
        setBusy(which);

        try {
            if (which === "up") {
                const { sent } = await sync.sendUp();
                Settings.plugins.CloudSync.lastUp = { at: Date.now(), what: sent };
                showToast("Synced to cloud", "success");
            } else {
                const { applied } = await sync.bringDown();
                Settings.plugins.CloudSync.lastDown = { at: Date.now(), what: applied };
                showToast("Synced from cloud", "success");
            }
        } catch (e) {
            showToast(e instanceof Error ? e.message : String(e), "failure");
            logger.error("Sync failed", e);
        } finally {
            setBusy("");
        }
    };

    return (
        <div className={cl("item")}>
            <div className={cl("item-text", "item-indent")}>
                <div className={cl("item-name")}>Sync now</div>
                <div className={cl("item-detail")}>
                    {link
                        ? "To Cloud uploads what this computer has. From Cloud replaces it."
                        : "Make a sync link in Cloud Sync's settings first"}
                </div>
            </div>
            <div className={cl("actions")}>
                <IconButton icon={CloudUpIcon} variant="secondary" disabled={!link || !!busy} onClick={() => run("up")}>
                    {busy === "up" ? "Syncing..." : "To Cloud"}
                </IconButton>
                <IconButton icon={CloudDownIcon} variant="secondary" disabled={!link || !!busy} onClick={() => run("down")}>
                    {busy === "down" ? "Syncing..." : "From Cloud"}
                </IconButton>
            </div>
        </div>
    );
}

function HubPage() {
    const [, redraw] = React.useState(0);
    const update = () => redraw(n => n + 1);

    const all = installed();
    const views = all.filter(isView);
    const live = applying().length;
    const waiting = views.some(entry => isWaiting(entry.plugin));

    return (
        <SettingsTab>
            <div className={cl("page")}>
                <section className={cl("section")}>
                    <h2 className={cl("heading")}>Overview</h2>

                    <div className={cl("item")}>
                        <div className={cl("item-text")}>
                            <div className={cl("item-name")}>
                                {live ? `${live} of ${views.length} are changing what you see` : "You are seeing the real Discord"}
                            </div>
                            <div className={cl("item-detail")}>
                                {live
                                    ? "Show Real turns them all off so you see your real friends, messages, calls and servers. Nothing is forgotten."
                                    : "Everything you hid or faked is kept, and comes back when you turn it on again."}
                            </div>
                        </div>
                        <IconButton
                            icon={live ? EyeIcon : EyeOffIcon}
                            size="medium"
                            variant={live ? "primary" : "secondary"}
                            onClick={() => {
                                const result = flipAll(settings.store.paused ?? []);
                                settings.store.paused = result.remember;
                                update();

                                showToast(
                                    result.on
                                        ? `${result.changed} turned back on${result.restart ? ", the rest after a restart" : ""}`
                                        : `${result.changed} turned off. You are seeing the real Discord`,
                                    "success"
                                );
                            }}
                        >
                            {live ? "Show Real" : "Turn Back On"}
                        </IconButton>
                    </div>

                    {waiting && (
                        <div className={cl("item")}>
                            <div className={cl("item-text")}>
                                <div className={cl("item-name")}>A restart is needed</div>
                                <div className={cl("item-detail")}>
                                    One plugin was disabled in Vencord when Discord loaded, and can only turn on as it loads.
                                </div>
                            </div>
                            <IconButton icon={RefreshIcon} variant="secondary" onClick={() => location.reload()}>Reload Now</IconButton>
                        </div>
                    )}
                </section>

                {SECTIONS.map(({ id, title }) => {
                    const rows = all.filter(entry => entry.section === id);
                    if (!rows.length) return null;

                    return (
                        <section className={cl("section")} key={id}>
                            <h2 className={cl("heading")}>{title}</h2>
                            {rows.map(entry => <PluginRow key={entry.plugin} entry={entry} onChange={update} />)}
                            {id === "tools" && <SyncRow />}
                        </section>
                    );
                })}
            </div>
        </SettingsTab>
    );
}

export default wrapTab(HubPage, "Additional Settings");
