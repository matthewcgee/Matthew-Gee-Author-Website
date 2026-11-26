# 6. Accessibility

Target: **WCAG 2.1 Level AA**.

## Automated evaluation (26 November 2026)

Tool: axe-core 4.10 with the WCAG 2.0 / 2.1 A and AA rule sets. It ran on every
screen of the app (all 12 navigation tabs) with the sample region loaded.

| Result | Before this review | After fixes |
|---|---|---|
| Critical | 2 (unlabelled select; tab-list markup) | **0** |
| Serious — images without text alternative | 3 (chart segments) | **0** |
| Serious — color contrast | 322 elements | 252 elements |

Fixed in this review:
- labelled the AcuiPath program selector;
- corrected the AcuiPath view switcher to a labelled button group;
- gave chart segments text alternatives;
- darkened the secondary text color to meet 4.5:1 on every panel background;
- darkened the calibration badge text.

## Remaining: status colors used as text

Almost all remaining contrast findings come from the GREEN, YELLOW and RED
status colors used as **text** on white, for example "63% chance of RED" or a
forecast value in red. Those colors were chosen for badges and bars. As text
they measure about 2.6:1 (green), 2.0:1 (yellow) and 3.7:1 (red) against white,
below the 4.5:1 minimum.

Status is never conveyed by color alone. Every status also appears as the word
GREEN, YELLOW or RED in a badge, so these findings affect readability rather
than meaning.

**Remediation plan:** add a darker "text" shade for each status color, at 4.5:1
or better, used wherever a status color is applied to text. Badge and chart
colors stay as they are. This is a contained change to the shared theme and the
components that color text by status. It is scheduled as a visual-design change
and will be reviewed on screen before release.

## Not yet done

Automated tools find roughly a third of accessibility issues. Still to come
before a formal conformance report (VPAT / ACR):
- keyboard-only walkthrough of every task;
- screen-reader testing (NVDA with Chrome, VoiceOver with Safari);
- 200% zoom and reflow checks.

## Open items

- Status-color text shades (above).
- Manual evaluation, then a VPAT 2.5 (WCAG edition) accessibility conformance
  report.
