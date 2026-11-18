# airtable-interface-feedback

**Figma-style pinned comments for Airtable custom interfaces.** Testers click anything, leave a note, and reply in threads. Every note is saved as a record in your base, with the technical detail a developer or agent needs to fix it. Think BugHerd or Marker.io, but the feedback lives in Airtable.

- **One file:** `src/feedback.tsx`. It uses only React and `@airtable/blocks/interface`, has no other dependencies, and injects its own CSS.
- **Themeable:** design a theme in the [playground](https://jpaulgale.github.io/airtable-interface-feedback/playground/) and paste it in.

## Quick start

1. **Create the table** in your base. You need a personal access token with the `schema.bases:write` scope:
   ```bash
   AIRTABLE_PAT=pat... uv run scripts/create_table.py appXXXXXXXXXXXXXX
   ```
   You can re-run it safely: it only adds fields that are missing. You can also create the table by hand from the field list below.
2. **Copy `src/feedback.tsx`** into your extension, next to `index.tsx`.
3. **Render it once** in your App:
   ```tsx
   import {FeedbackLayer} from './feedback';

   function App() {
       const base = useBase();
       return <>
           <FeedbackLayer base={base} page="Dashboard" />
           <Dashboard />
       </>;
   }
   ```
4. **Theme it** (optional): open the [playground](https://jpaulgale.github.io/airtable-interface-feedback/playground/) (or `playground/index.html` locally), choose colours, radius, font, pin shape, button corner and any of the text. Then copy the **Theme (TS)** output over `FEEDBACK_THEME` in `feedback.tsx`, or pass it as the `theme` prop.

Releasing to Airtable works the same as for any other change (`block release`, or your usual AI-element flow).

### Handing it to an agent

Open the playground, set the theme, switch to **Agent prompt** and copy it. The prompt holds the theme and the four steps above, so an agent like Claude Code can wire the component in by itself. Also point the agent at [`AGENTS.md`](AGENTS.md).

## Props

| Prop | Default | |
|---|---|---|
| `base` | required | From `useBase()` |
| `page` | required | Page name stored on each note. Pins only show on their own page. |
| `theme` | `FEEDBACK_THEME` | `Partial<FeedbackTheme>`, merged over the default |
| `labels` | `FB_LABELS` | `Partial<FeedbackLabels>`: every string the layer shows (button, banner, menu, composer, reply, buttons). The playground writes this for you. |
| `tableName` | `"Interface Feedback"` | |
| `build` | `"dev"` | Stamped on every note, for example a git SHA or release date, so you know which build was reviewed |

## The table

| Field | Type | Written by the layer |
|---|---|---|
| **Comment** (primary) | Long text | The note |
| Status | Single select: Open, In Progress, Resolved, Won't Fix | `Open`; **Mark resolved** sets `Resolved`. Resolved notes disappear from the page. |
| Page | Single line | `page` prop |
| Context | Long text | `Dashboard › section "Summary" › table › row "X" › column "Deadline" › "Jan 30"` |
| Element | Single line | Tag, role and label of the element |
| Element Text | Long text | The element's text, or the text the user selected |
| Left By / Left By Email | Single line / Email | Current Airtable user |
| Replies | Long text | Thread. Each reply starts with a `— Name · date` line. |
| Resolution | Long text | For the developer: what changed |
| Build | Single line | `build` prop |
| Anchor / Position | Single line | CSS path and the point within the element, used to re-pin the note |
| Technical Detail | Long text | HTML snippet, React components, ancestors, computed styles, viewport/dialogs/tabs/filter state, URL, browser |
| Created | Created time | |

Only **Comment, Page, Anchor, Position and Status** are required. Any other field that's missing is skipped. Field names are in `FB_F` at the top of the file if you need to rename them.

**Permissions:** anyone who can see the table sees all open notes. Anyone who can create records can leave notes. Anyone who can update records can reply and resolve.

## Triage workflow

Filter the table to `Status = Open` and group it by Page. To fix notes with an agent, export the records, or give it read access through the Airtable MCP. Tell it to work through each note using its `Context` and `Technical Detail`, fill in `Resolution`, and set `Status = Resolved`.

## Developing

- `uv run scripts/sync_playground.py` copies the CSS from `src/feedback.tsx` into the playground. Run it after you change any styles.
- `example/App.tsx` shows a minimal extension entry.

**Acknowledgements:** recording React component names and computed styles in the technical detail was borrowed from [Agentation](https://agentation.dev).
