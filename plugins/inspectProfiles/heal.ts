/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

/**
 * Pictures that come out broken, put right.
 *
 * A changed picture reaches Discord as a stand-in hash, and the place that builds the address
 * answers with the real one. Now and then a picture is drawn a moment too early - a call tile
 * as you join, before a picture kept on this computer is read - and the stand-in goes out as
 * an address that leads nowhere: a broken picture that stays broken until that spot redraws.
 *
 * So any picture whose address carries the stand-in is watched for: an image that fails to
 * load, or a background that names it. Each is given the right address as soon as there is
 * one, without waiting for Discord to draw that spot again.
 */

import { avatarFor, bannerFor } from "./rewrite";

/** The stand-in in an address: .../avatars/<user id>/a_vcip... */
const STAND_IN = /\/(avatars|banners)\/(\d+)\/a_vcip/;

/** The right address for a stand-in one, or nothing yet if the picture is still being read */
function rightFor(src: string): string | undefined {
    const found = STAND_IN.exec(src);
    if (!found) return;
    const [, kind, id] = found;
    return kind === "avatars" ? avatarFor({ id }) : bannerFor({ id });
}

/** Try again a few times: a picture kept on this computer takes a moment to read */
function mend(apply: (url: string) => void, src: string, tries = 10) {
    const url = rightFor(src);
    if (url) return apply(url);
    if (tries > 0) setTimeout(() => mend(apply, src, tries - 1), 300);
}

function onError(event: Event) {
    const img = event.target;
    if (!(img instanceof HTMLImageElement) || !STAND_IN.test(img.src)) return;
    mend(url => { img.src = url; img.srcset = ""; }, img.src);
}

function mendBackground(el: HTMLElement) {
    const bg = el.style?.backgroundImage;
    if (!bg || !STAND_IN.test(bg)) return;
    mend(url => void (el.style.backgroundImage = `url("${url}")`), bg);
}

let observer: MutationObserver | null = null;

export function startHealing() {
    if (observer) return;

    // failed loads do not bubble, so they are caught on the way down
    document.addEventListener("error", onError, true);

    observer = new MutationObserver(changes => {
        for (const change of changes) {
            if (change.type === "attributes") mendBackground(change.target as HTMLElement);
            else change.addedNodes.forEach(node => {
                if (!(node instanceof HTMLElement)) return;
                mendBackground(node);
                node.querySelectorAll?.<HTMLElement>('[style*="a_vcip"]').forEach(mendBackground);
            });
        }
    });
    observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["style"] });
}

export function stopHealing() {
    document.removeEventListener("error", onError, true);
    observer?.disconnect();
    observer = null;
}
