/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { React, UserStore, UserUtils } from "@webpack/common";

import { BookmarkIcon, PencilIcon, PersonIcon, TrashIcon, UndoIcon } from "./icons";
import { openInspect } from "./InspectModal";
import { pictureUrl, realUser } from "./rewrite";
import { deletePreset, editedIds, load, lookFor, onChange, presetCalled, presetNames, revert, revertAll, summary } from "./store";
import { Empty, IconButton, Panel, Row } from "./ui";

/** Redraw whenever anything is saved, wherever it was saved from */
function useChanges() {
    const [, redraw] = React.useState(0);
    React.useEffect(() => {
        void load().then(() => redraw(n => n + 1));
        return onChange(() => redraw(n => n + 1));
    }, []);
}

function avatarOf(id: string) {
    const user = realUser(id);
    return user?.avatar ? `https://cdn.discordapp.com/avatars/${id}/${user.avatar}.png?size=64` : null;
}

export function ProfilesPanel() {
    useChanges();
    const me = UserStore.getCurrentUser()?.id;
    const ids = editedIds();
    const presets = presetNames();

    // Somebody Discord has not loaded since it started shows as a number until asked for -
    // the same request showing them anywhere makes.
    const [, redraw] = React.useState(0);
    React.useEffect(() => {
        const missing = ids.filter(id => !realUser(id));
        if (missing.length) void Promise.allSettled(missing.map(id => UserUtils.getUser(id))).then(() => redraw(n => n + 1));
    }, [ids.join()]);

    return (
        <>
            <Panel
                title="Changed profiles"
                count={ids.length}
                actions={
                    <>
                        {me && <IconButton icon={PersonIcon} variant="primary" onClick={() => openInspect(me)}>Inspect My Profile</IconButton>}
                        {!!ids.length && <IconButton icon={UndoIcon} variant="secondary" onClick={() => revertAll()}>Show All Real</IconButton>}
                    </>
                }
            >
                {ids.length ? ids.map(id => {
                    const user = realUser(id);
                    const name = user?.globalName ?? user?.username ?? id;
                    return (
                        <Row key={id} image={avatarOf(id)} icon={PersonIcon} name={id === me ? `${name} (you)` : name} detail={summary(lookFor(id))}>
                            <IconButton icon={PencilIcon} variant="secondary" onClick={() => openInspect(id)}>Edit</IconButton>
                            <IconButton icon={UndoIcon} variant="secondary" onClick={() => revert(id)}>Real</IconButton>
                        </Row>
                    );
                }) : (
                    <Empty icon={PersonIcon} title="Nobody changed yet" text="Right-click anybody and choose Inspect Profile." />
                )}
            </Panel>

            <Panel title="Presets" count={presets.length}>
                {presets.length ? presets.map(called => (
                    <Row key={called} image={pictureUrl(presetCalled(called)?.avatar)} icon={BookmarkIcon} name={called} detail={summary(presetCalled(called))}>
                        <button className="vc-cip-icon-button vc-cip-icon-danger" aria-label={`Delete ${called}`} title="Delete" onClick={() => deletePreset(called)}>
                            <TrashIcon height={16} width={16} />
                        </button>
                    </Row>
                )) : (
                    <Empty icon={BookmarkIcon} title="No presets yet" text="Inspect somebody and use Steal in the Presets tab." />
                )}
            </Panel>
        </>
    );
}
