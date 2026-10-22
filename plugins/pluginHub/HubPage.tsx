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
import { Alerts, React, showToast } from "@webpack/common";

import { settings } from ".";
import { deleteAllData } from "./data";
import { applying, Entry, flipAll, installed, isEnabled, isOn, isView, needsRestart, pluginOf, SECTIONS, setOn, summaryOf, usable } from "./hub";
import { CloudDownIcon, CloudUpIcon, EyeIcon, EyeOffIcon, GearIcon, RefreshIcon, TrashIcon } from "./icons";
import { isProtecting, onProtectionChange, raisedForShare } from "./protect";
import { cl, IconButton } from "./ui";

const logger = new Logger("PluginHub");

/** Enabled in Vencord but waiting on a restart before it can do anything */
const isWaiting = (plugin: string) => !isOn(plugin) && isEnabled(plugin) && needsRestart(plugin);

function PluginRow({ entry, onChange }: { entry: Entry; onChange(): void; }) {
    const { plugin, label, icon: Icon } = entry;
    const enabled = isEnabled(plugin);
    const on = enabled && isOn(plugin);
    const waiting = isWaiting(plugin);
    const tag = on ? summaryOf(entry) : "";

    return (
        <div className={cl("item", on ? "" : "item-off", enabled ? "" : "item-disabled")}>
            <div className={cl("tile")}>
                <Icon height={20} width={20} />
            </div>
            <div className={cl("item-text")}>
                <div className={cl("item-name")}>{label}</div>
                <div className={cl("item-detail")}>
                    {!enabled
                        ? "Enable it in Vencord's Plugins page to use it here"
                        : waiting ? "Turns on when Discord restarts" : entry.about}
                </div>
            </div>
            {tag && <span className={cl("tag")}>{tag}</span>}
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
                disabled={!enabled}
                onChange={next => {
                    const result = setOn(plugin, next);

                    if (result === "failed") showToast({ text: `Could not turn ${label} ${next ? "on" : "off"}`, variant: "critical" });
                    if (result === "restart") showToast({ text: `${label} turns on when Discord restarts`, variant: "default" });

                    onChange();
                }}
            />
        </div>
    );
}

/** Cloud Sync leaves out plugins whose "Keep after restart" is off, and says which */
const skippedNote = (skipped?: string[]) =>
    skipped?.length ? `. Skipped ${skipped.join(", ")}: "Keep after restart" is off` : "";

/** Sync without going to find its settings: the two buttons, for whoever already has a link */
function SyncRow() {
    const sync = pluginOf("CloudSync");
    const [busy, setBusy] = React.useState<"" | "up" | "down">("");
    const { link } = Settings.plugins.CloudSync ?? {};

    if (!sync?.started || !isEnabled("CloudSync")) return null;

    const run = async (which: "up" | "down") => {
        setBusy(which);

        try {
            if (which === "up") {
                const { sent, skipped } = await sync.sendUp();
                Settings.plugins.CloudSync.lastUp = { at: Date.now(), what: sent };
                showToast({ text: "Synced to cloud" + skippedNote(skipped), variant: "success" });
            } else {
                const { applied, skipped } = await sync.bringDown();
                Settings.plugins.CloudSync.lastDown = { at: Date.now(), what: applied };
                showToast({ text: "Synced from cloud" + skippedNote(skipped), variant: "success" });
            }
        } catch (e) {
            showToast({ text: e instanceof Error ? e.message : String(e), variant: "critical" });
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
                        : "Make a sync code in Cloud Sync's settings first"}
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

/** One switch of Screen Share Protection's, as a quieter row under it */
/** When the plugins' buttons show in right-click menus - one choice for all of them */
const MENU_CHOICES: { value: "always" | "shift" | "never"; label: string; }[] = [
    { value: "always", label: "Always" },
    { value: "shift", label: "Holding Shift" },
    { value: "never", label: "Never" },
];

function MenuButtons() {
    const { menuButtons } = settings.use(["menuButtons"]);
    const current = menuButtons ?? "shift";

    return (
        <div className={cl("item")}>
            <div className={cl("item-text")}>
                <div className={cl("item-name")}>Right-click buttons</div>
                <div className={cl("item-detail")}>
                    When entries like Hide DM show in right-click menus. Holding Shift keeps menus looking like normal Discord.
                </div>
            </div>
            <div className={cl("choice")} role="radiogroup" aria-label="Right-click buttons">
                {MENU_CHOICES.map(choice => (
                    <button
                        key={choice.value}
                        type="button"
                        role="radio"
                        aria-checked={current === choice.value}
                        className={cl("choice-option", current === choice.value ? "choice-on" : "")}
                        onClick={() => void (settings.store.menuButtons = choice.value)}
                    >
                        {choice.label}
                    </button>
                ))}
            </div>
        </div>
    );
}

/** Everything saved on this computer, gone - asked about first */
function DeleteData() {
    return (
        <div className={cl("item")}>
            <div className={cl("item-text")}>
                <div className={cl("item-name")}>Delete all data</div>
                <div className={cl("item-detail")}>
                    Everything these plugins saved on this computer, and their settings. Cloud Sync's code is kept.
                </div>
            </div>
            <IconButton
                icon={TrashIcon}
                variant="dangerSecondary"
                onClick={() => Alerts.show({
                    title: "Delete all data?",
                    body: "Everything hidden, faked, edited and bookmarked is gone for good, and every setting goes back to how it came. Discord reloads after.",
                    confirmText: "Delete Everything",
                    cancelText: "Cancel",
                    onConfirm: () => void deleteAllData()
                })}
            >
                Delete
            </IconButton>
        </div>
    );
}

function ShareSwitch({ name, label, detail }: { name: "streamerMode" | "shareHideNew" | "shareHideMenus" | "shareHidePage" | "sharePlain" | "shareRestore"; label: string; detail: string; }) {
    const value = settings.use([name])[name];

    return (
        <div className={cl("sub-row")}>
            <div className={cl("item-text")}>
                <div className={cl("sub-name")}>{label}</div>
                <div className={cl("item-detail")}>{detail}</div>
            </div>
            <Switch checked={value !== false} onChange={next => void (settings.store[name] = next)} />
        </div>
    );
}

/** What Screen Share Protection does, each part of it a choice */
function ShareOptions() {
    const { shareSkip } = settings.use(["shareSkip"]);
    const skip: string[] = shareSkip ?? [];
    const views = installed().filter(isView);

    const toggle = (plugin: string) => {
        settings.store.shareSkip = skip.includes(plugin) ? skip.filter(name => name !== plugin) : [...skip, plugin];
    };

    return (
        <div className={cl("sub")}>
            <div className={cl("sub-row", "sub-row-stack")}>
                <div className={cl("item-text")}>
                    <div className={cl("sub-name")}>Turn on while sharing</div>
                    <div className={cl("item-detail")}>Turned on for the share, even if you have them off.</div>
                </div>
                <div className={cl("menu-chips")} role="group" aria-label="Turn on while sharing">
                    {views.map(({ plugin, label, icon: Icon }) => {
                        const picked = !skip.includes(plugin);

                        return (
                            <button
                                key={plugin}
                                type="button"
                                className={cl("menu-chip", picked ? "menu-chip-on" : "")}
                                aria-pressed={picked}
                                onClick={() => toggle(plugin)}
                            >
                                <Icon height={16} width={16} />
                                <span>{label}</span>
                            </button>
                        );
                    })}
                </div>
            </div>

            <ShareSwitch name="streamerMode" label="Also when Streamer Mode is on" detail="Discord can turn Streamer Mode on by itself when it sees OBS or another recorder." />
            <ShareSwitch name="shareHideNew" label="Hide anything new" detail="New friends, DMs and servers stay hidden until the share ends." />
            <ShareSwitch name="shareHideMenus" label="Hide right-click buttons" detail="No plugin buttons in menus, or the Bookmarked tab. Shift still shows them." />
            <ShareSwitch name="shareHidePage" label="Hide this page" detail="Takes Additional Settings out of the sidebar." />
            <ShareSwitch name="sharePlain" label="Look like plain Discord" detail="Hides Vencord and turns off your other plugins. The hide and fake plugins stay on." />
            <ShareSwitch name="shareRestore" label="Turn plugins back off after" detail="Plugins turned on for the share go back off when it ends." />
        </div>
    );
}

function HubPage() {
    const [, redraw] = React.useState(0);
    const update = () => redraw(n => n + 1);

    const { shareProtection } = settings.use(["shareProtection"]);
    const protecting = isProtecting();

    // A share starting or ending switches plugins behind this page's back.
    React.useEffect(() => onProtectionChange(update), []);

    const all = installed();
    const views = usable().filter(isView);
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
                                {!views.length
                                    ? "None of these plugins are enabled"
                                    : live ? `${live} of ${views.length} plugins on` : "You are seeing the real Discord"}
                            </div>
                            <div className={cl("item-detail")}>
                                {!views.length
                                    ? "Enable the ones you want in Vencord's Plugins page, then switch them here."
                                    : live
                                        ? "Show Real turns them all off. Nothing you hid or faked is lost."
                                        : "Everything you hid or faked comes back when you turn them on."}
                            </div>
                        </div>
                        <IconButton
                            icon={live ? EyeIcon : EyeOffIcon}
                            size="medium"
                            variant={live ? "primary" : "secondary"}
                            disabled={!views.length}
                            onClick={() => {
                                const result = flipAll(settings.store.paused ?? []);

                                // Not the ones a share switched on. You had those off, and Turn
                                // Back On should not be what turns them on for good.
                                const lent = raisedForShare();
                                settings.store.paused = result.remember.filter(name => !lent.includes(name));
                                update();

                                showToast({ text: result.on
                                        ? `${result.changed} turned back on${result.restart ? ", the rest after a restart" : ""}`
                                        : `${result.changed} turned off. You are seeing the real Discord`, variant: "success" });
                            }}
                        >
                            {live ? "Show Real" : "Turn Back On"}
                        </IconButton>
                    </div>

                    <MenuButtons />

                    <div className={cl("item", shareProtection !== false ? "item-open" : "")}>
                        <div className={cl("item-text")}>
                            <div className={cl("item-name")}>Screen Share Protection</div>
                            <div className={cl("item-detail")}>
                                {protecting
                                    ? "On now. Your screen is being shared."
                                    : "Keeps everything hidden while you share your screen. Everything goes back when you stop."}
                            </div>
                        </div>
                        <Switch checked={shareProtection !== false} onChange={next => void (settings.store.shareProtection = next)} />
                    </div>

                    {shareProtection !== false && <ShareOptions />}

                    {waiting && (
                        <div className={cl("item")}>
                            <div className={cl("item-text")}>
                                <div className={cl("item-name")}>A restart is needed</div>
                                <div className={cl("item-detail")}>
                                    A plugin enabled since Discord loaded can only turn on after a reload.
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

                <section className={cl("section")}>
                    <h2 className={cl("heading")}>Your data</h2>
                    <DeleteData />
                </section>
            </div>
        </SettingsTab>
    );
}

export default wrapTab(HubPage, "Additional Settings");
