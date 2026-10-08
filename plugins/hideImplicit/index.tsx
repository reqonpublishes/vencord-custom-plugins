/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./shared.css";

import { Logger } from "@utils/Logger";
import definePlugin from "@utils/types";
import { findStoreLazy } from "@webpack";
import { FluxDispatcher } from "@webpack/common";

import { GroupIcon } from "./icons";
import { About } from "./ui";

const logger = new Logger("HideImplicit");

const FriendsStore: any = findStoreLazy("FriendsStore");

/** What the tab says. Written by Vencord's ImplicitRelationships plugin, in English whatever the language */
const LABEL = "Implicit";

/** Left on a tab this has hidden, so it can be found again to show */
const MARK = "data-vc-hide-implicit";

let observer: MutationObserver | null = null;

const tabs = () => document.querySelectorAll<HTMLElement>('[role="tablist"] > [role="tab"]');

/**
 * Take the Implicit tab out of the Friends header.
 *
 * The tab carries nothing to tell it by except its label, so it is found by that. It is
 * hidden with a style of its own rather than a class: Discord rewrites a tab's classes every
 * time the selection moves, and would take a class of ours off with them, but it leaves alone
 * a style it did not set.
 */
function hide() {
    let onIt = false;

    for (const tab of tabs()) {
        if (tab.textContent?.trim() !== LABEL) continue;

        if (!tab.hasAttribute(MARK)) {
            tab.setAttribute(MARK, "");
            tab.style.setProperty("display", "none", "important");
        }

        if (tab.getAttribute("aria-selected") === "true") onIt = true;
    }

    // Hidden while you were standing on it would leave its list on screen under a header
    // with nothing selected, so the page moves to All.
    try {
        if (onIt || FriendsStore.getState?.()?.section === "IMPLICIT") {
            FluxDispatcher.dispatch({ type: "FRIENDS_SET_SECTION", section: "ALL" } as any);
        }
    } catch (e) {
        logger.error("Could not move off the Implicit tab", e);
    }
}

function show() {
    for (const tab of document.querySelectorAll<HTMLElement>(`[${MARK}]`)) {
        tab.removeAttribute(MARK);
        tab.style.removeProperty("display");
    }
}

/**
 * Whether something just added to the page could be the Friends header.
 *
 * Asked of every change to the page, so it looks only inside what was added and stops at
 * the first tab it finds. Almost every change adds none, and costs nothing more than this.
 */
function addsTabs(records: MutationRecord[]) {
    for (const record of records) {
        for (const node of record.addedNodes) {
            if (!(node instanceof Element)) continue;
            if (node.getAttribute("role") === "tab" || node.querySelector('[role="tab"]')) return true;
        }
    }

    return false;
}

export default definePlugin({
    name: "HideImplicit",
    description: "Hides the Implicit tab that Vencord's ImplicitRelationships plugin adds to your Friends page.",
    tags: ["Friends", "Appearance", "Privacy"],
    authors: [{ name: "reqon", id: 497562304498368513n }],

    settingsAboutComponent: () => (
        <About
            icon={GroupIcon}
            title="Hide the Implicit tab"
            note="Only you see this. The tab is hidden, not removed, and comes back when this is off."
            steps={[
                <>While this is on, the <strong>Implicit</strong> tab is not in your Friends header.</>,
                <>If you are on that tab when it is hidden, the page moves to <strong>All</strong>.</>
            ]}
        />
    ),

    /** One line for Additional Settings */
    hubSummary() {
        return "The Implicit tab is hidden";
    },

    start() {
        hide();

        // Run as the page changes rather than on a timer, and before it is drawn, so the
        // tab is never on screen for a moment when the Friends page opens.
        observer = new MutationObserver(records => {
            if (addsTabs(records)) hide();
        });
        observer.observe(document.body, { childList: true, subtree: true });
    },

    stop() {
        observer?.disconnect();
        observer = null;

        show();
    }
});
