/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { useForceUpdater } from "@utils/react";

import { clearAllEdits, countEdits } from "./edits";
import { PencilIcon, UndoIcon } from "./icons";
import { cl, IconButton, Panel, Row } from "./ui";

/** How many messages are changed, and the one button that puts them all back */
export function EditedPanel() {
    const update = useForceUpdater();
    const n = countEdits();

    return (
        <Panel title="Changed messages">
            <div className={cl("rows")}>
                <Row
                    icon={PencilIcon}
                    round={false}
                    name={n ? `${n} changed message${n === 1 ? "" : "s"}` : "No changed messages"}
                    detail={n ? "Reverting shows each one as it really is" : "Hold Shift over a message, or right-click it, to inspect it"}
                >
                    <IconButton
                        icon={UndoIcon}
                        variant="dangerSecondary"
                        disabled={!n}
                        onClick={() => {
                            clearAllEdits();
                            update();
                        }}
                    >
                        Revert All
                    </IconButton>
                </Row>
            </div>
        </Panel>
    );
}
