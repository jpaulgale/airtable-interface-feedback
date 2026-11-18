import React from 'react';
import {initializeBlock, useBase} from '@airtable/blocks/interface/ui';
import {FeedbackLayer} from '../src/feedback';

const THEME = {pinShape: "drop"} as const; // any subset of FeedbackTheme, merged over FEEDBACK_THEME

function App(): React.ReactElement {
    const base = useBase();
    return (
        <>
            <FeedbackLayer base={base} page="Home" theme={THEME} build="2026-11-18" />
            <main style={{padding: 24}}><h1>My interface</h1></main>
        </>
    );
}
initializeBlock({interface: () => <App />});
