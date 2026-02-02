import { openBlank, copyToClipboard, reloadPage } from 'react-declarative';

import { CC_FORCE_BROWSER_HISTORY } from './params';

function fallbackCopyTextToClipboard(text) {
    const textArea = document.createElement("textarea");
    textArea.value = text;

    textArea.style.top = "0";
    textArea.style.left = "0";
    textArea.style.position = "fixed";

    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();

    try {
        const successful = document.execCommand("copy");
        const msg = successful ? "successful" : "unsuccessful";
        console.log(`Fallback: Copying text command was ${msg}`);
    } catch (err) {
        console.error("Fallback: Oops, unable to copy", err);
    }

    document.body.removeChild(textArea);
}

openBlank.override((url) => {
    const a = document.createElement("a");
    a.href = url;
    a.target = "_blank";
    a.click();
});

copyToClipboard.override(async (text) => {
    try {
        if ("copyToClipboard" in navigator) {
            await navigator.copyToClipboard(text);
            return;
        }
        await navigator.clipboard.writeText(text);
    } catch {
        fallbackCopyTextToClipboard(text);
    }
});

reloadPage.override(async () => {
    if ("caches" in window) {
        for (const cache of await window.caches.keys()) {
          await caches.delete(cache);
        }
    }

    if (CC_FORCE_BROWSER_HISTORY) {
        window.location.href = "/";
    } else {
        window.location.reload(true);
    }
});

export {};
