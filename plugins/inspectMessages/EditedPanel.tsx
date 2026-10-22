/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { useForceUpdater } from "@utils/react";

import { clearAllEdits, listEdits, resetEdit, restoreEdit, snapshotEdit } from "./edits";
import { PencilIcon, UndoIcon } from "./icons";
import { placeOf } from "./places";
import { cl,Empty, IconButton, Panel, Rows } from "./ui";
import { remember } from "./undo";

/** Every changed message: what it says now, what it really says, and a way back for each */
export function EditedPanel() {
    const update = useForceUpdater();
    const list = listEdits();

    return (
        <Panel
            title="Changed messages"
            count={list.length}
            actions={list.length ? (
                <IconButton icon={UndoIcon} variant="secondary" onClick={() => { clearAllEdits(); update(); }}>Revert All</IconButton>
            ) : undefined}
        >
            {!list.length ? (
                <Empty icon={PencilIcon} title="No changed messages" text="Right-click a message and choose Inspect Message to change it." />
            ) : (
                <Rows>
                    {list.map(edit => {
                        const place = placeOf(edit.channelId);
                        return (
                            <div key={edit.id} className={cl("edit")}>
                                <div className={cl("edit-text")}>
                                    <div className={cl("edit-where")}>{[place.name, place.detail].filter(Boolean).join(" · ")}{edit.retimed ? " · time changed" : ""}</div>
                                    <div className={cl("edit-now")}>{edit.now || <em>No text</em>}</div>
                                    {edit.was !== edit.now && <div className={cl("edit-was")}>{edit.was || <em>No text</em>}</div>}
                                </div>
                                <IconButton icon={UndoIcon} variant="secondary" onClick={() => { const before = snapshotEdit(edit.id); resetEdit(edit.id); remember("Revert Message", () => restoreEdit(edit.id, before)); update(); }}>Revert</IconButton>
                            </div>
                        );
                    })}
                </Rows>
            )}
        </Panel>
    );
}
