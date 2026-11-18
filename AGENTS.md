# For coding agents

Goal: add review comments to an Airtable interface extension.

1. Copy `src/feedback.tsx` into the extension's frontend folder (next to the file that calls `initializeBlock`).
2. If the user gave you a theme (from the playground), replace the `FEEDBACK_THEME` object with it. Don't change the CSS.
3. Render `<FeedbackLayer base={base} page="<Page name>" />` once, at the top level of the App, as a sibling of the main content. Use one distinct `page` value per interface page. Pass `build` if the project has a version or commit stamp.
4. Make sure the base has the table: `AIRTABLE_PAT=... uv run scripts/create_table.py <baseId>`. If you have no token, use the Airtable MCP `create_table` with the fields from README.md.
5. Verify: type-check, release, open the page, leave a comment, and confirm a record appears with Page, Context and Technical Detail filled.

Don'ts: don't wrap the layer in a container with `transform` or `filter`, because that breaks `position: fixed`. Don't load other CSS that targets `.fb-*`. Don't remove the "table missing → render nothing" guard.

To act on feedback: read the `Status = Open` records. `Context` tells you where the element is in the UI, and `Technical Detail` gives the component names and markup to search for. After fixing, write `Resolution` and set `Status = Resolved`.
