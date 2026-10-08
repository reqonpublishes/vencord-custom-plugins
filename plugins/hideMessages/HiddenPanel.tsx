/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { useForceUpdater } from "@utils/react";

import { EyeOffIcon, UndoIcon } from "./icons";
import { clearAll, stats } from "./store";
import { cl, IconButton, Panel, Row } from "./ui";

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** What is hidden right now, and the one button that brings it all back */
export function HiddenPanel() {
    const update = useForceUpdater();
    const { messages, ranges, channels } = stats();
    const any = messages + ranges + channels;

    const parts = [
        messages && plural(messages, "message"),
        ranges && plural(ranges, "range"),
        channels && plural(channels, "whole conversation")
    ].filter(Boolean);

    return (
        <Panel title="Hidden right now">
            <div className={cl("rows")}>
                <Row
                    icon={EyeOffIcon}
                    round={false}
                    name={any ? parts.join(", ") : "Nothing is hidden"}
                    detail={any ? "Unhiding brings every one of them back" : "Hold Shift over a message, or right-click it, to hide it"}
                >
                    <IconButton
                        icon={UndoIcon}
                        variant="dangerSecondary"
                        disabled={!any}
                        onClick={() => {
                            clearAll();
                            update();
                        }}
                    >
                        Unhide All
                    </IconButton>
                </Row>
            </div>
        </Panel>
    );
}
