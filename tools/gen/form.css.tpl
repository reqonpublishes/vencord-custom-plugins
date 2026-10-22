/* ---------------------------------------------------------------- modal form */

/*
 * One rhythm for the whole form: every block is a section, every section is separated by
 * the same gap, and nothing sets its own ad-hoc margins.
 */
.__PREFIX__-section {
    margin-bottom: 20px;
}

.__PREFIX__-section-last {
    margin-bottom: 0;
}

.__PREFIX__-label {
    margin: 0 0 8px;
    color: var(--text-muted);
    font-size: 12px;
    font-weight: 700;
    font-family: var(--font-display, var(--font-primary));
    line-height: 16px;
    letter-spacing: .02em;
    text-transform: uppercase;
}

.__PREFIX__-field {
    display: flex;
    gap: 8px;
}

.__PREFIX__-input {
    flex: 1 1 150px;
    min-width: 0;
    padding: 8px 8px 8px 11px;
    border: 1px solid rgb(128 128 128 / 22%);
    border-radius: 6px;
    background: rgb(128 128 128 / 18%);
    color: var(--text-default, var(--text-normal));
    font-size: 14px;
    font-family: var(--font-primary);
    font-variant-numeric: tabular-nums;
    color-scheme: dark;
    cursor: text;
    transition: background-color .15s ease, border-color .15s ease;
}

.__PREFIX__-input-time {
    flex: 0 0 auto;
    min-width: 158px;
}

.__PREFIX__-input:hover {
    background: rgb(128 128 128 / 26%);
}

.__PREFIX__-input:focus {
    border-color: var(--border-strong, rgb(128 128 128 / 45%));
    outline: none;
}

/* ships as a black glyph, so it is inverted to a mid grey that shows on any field */
.__PREFIX__-input::-webkit-calendar-picker-indicator {
    margin-left: 4px;
    padding: 0;
    opacity: 1;
    cursor: pointer;
    filter: invert(55%);
}

.__PREFIX__-line {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
    justify-content: space-between;
    margin-top: 8px;
}

.__PREFIX__-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
}

.__PREFIX__-chip {
    display: flex;
    gap: 6px;
    align-items: center;
    padding: 5px 10px;
    border-radius: 6px;
    background: var(--background-mod-subtle, rgb(128 128 128 / 10%));
    color: var(--text-default, var(--text-normal));
    font-size: 12px;
    font-weight: 500;
    font-family: var(--font-primary);
    font-variant-numeric: tabular-nums;
    line-height: 16px;
    cursor: pointer;
    transition: background-color .15s ease, border-color .15s ease;
}

.__PREFIX__-chip:hover {
    background: var(--background-mod-normal, rgb(128 128 128 / 16%));
}

.__PREFIX__-chip-on,
.__PREFIX__-chip-on:hover {
    background: var(--background-mod-strong, rgb(128 128 128 / 24%));
    color: var(--text-strong, var(--header-primary));
}

/* a choice between people or options: bigger than a chip, one of them always picked */
.__PREFIX__-choices {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
}

.__PREFIX__-choice {
    display: flex;
    flex: 1 1 140px;
    gap: 10px;
    align-items: center;
    min-width: 0;
    padding: 8px 10px;
    border-radius: 8px;
    background: var(--background-mod-subtle, rgb(128 128 128 / 10%));
    color: var(--text-default, var(--text-normal));
    font-family: var(--font-primary);
    text-align: start;
    cursor: pointer;
    transition: background-color .15s ease, border-color .15s ease;
}

.__PREFIX__-choice:hover {
    background: var(--background-mod-normal, rgb(128 128 128 / 16%));
}

.__PREFIX__-choice-on,
.__PREFIX__-choice-on:hover {
    background: var(--background-mod-strong, rgb(128 128 128 / 24%));
    color: var(--text-strong, var(--header-primary));
}

.__PREFIX__-choice img,
.__PREFIX__-choice-blank {
    flex: 0 0 auto;
    width: 28px;
    height: 28px;
    border-radius: 50%;
}

.__PREFIX__-choice-blank {
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgb(128 128 128 / 26%);
    color: var(--text-muted);
}

.__PREFIX__-choice-text {
    min-width: 0;
}

.__PREFIX__-choice-name,
.__PREFIX__-choice-detail {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.__PREFIX__-choice-name {
    font-size: 14px;
    font-weight: 500;
    line-height: 18px;
}

.__PREFIX__-choice-detail {
    color: var(--text-muted);
    font-size: 12px;
    line-height: 16px;
}

/* the switches read as one panel, set apart from the plain fields around them */
.__PREFIX__-card {
    padding: 2px 12px;
    border: 1px solid rgb(128 128 128 / 14%);
    border-radius: 8px;
    background: rgb(128 128 128 / 7%);
}

.__PREFIX__-switch {
    margin: 10px 0;
}

.__PREFIX__-divider {
    height: 1px;
    background: rgb(128 128 128 / 14%);
}

.__PREFIX__-hint {
    margin-top: 6px;
    color: var(--text-muted);
    font-size: 12px;
    line-height: 16px;
}

.__PREFIX__-footnote {
    display: flex;
    gap: 6px;
    align-items: center;
    margin-top: 14px;
    color: var(--text-muted);
    font-size: 12px;
    line-height: 16px;
}

.__PREFIX__-footnote svg {
    flex: 0 0 auto;
}

/* ---------------------------------------------------------------- time buttons under a date */

/* the nudges share the width evenly, edge to edge with the date above; Now and Original keep their size */
.__PREFIX__-shifts {
    display: flex;
    gap: 4px;
    margin-top: 8px;
}

.__PREFIX__-shifts > .__PREFIX__-chip {
    flex: 1 1 0;
    justify-content: center;
    height: 28px;
    padding: 0 8px;
}

.__PREFIX__-shifts > .__PREFIX__-chip-wide {
    flex: 0 0 auto;
}

.__PREFIX__-shifts-end {
    justify-content: flex-end;
}

.__PREFIX__-shifts-end > .__PREFIX__-chip {
    flex: 0 0 auto;
}
