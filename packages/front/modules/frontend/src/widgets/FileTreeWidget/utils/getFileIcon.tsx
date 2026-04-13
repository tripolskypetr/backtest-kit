import React from 'react';
import {
    Article,
    Code,
    DataObject,
    Image,
    InsertDriveFile,
    TextSnippet,
} from '@mui/icons-material';

export function getFileIcon(ext?: string): React.ReactElement {
    switch (ext) {
        case 'tsx':
        case 'ts':
        case 'js':
        case 'jsx':
            return <Code fontSize="small" color="primary" />;
        case 'json':
            return <DataObject fontSize="small" color="secondary" />;
        case 'md':
            return <Article fontSize="small" color="action" />;
        case 'css':
        case 'scss':
        case 'html':
            return <TextSnippet fontSize="small" color="action" />;
        case 'png':
        case 'jpg':
        case 'jpeg':
        case 'svg':
        case 'gif':
        case 'ico':
            return <Image fontSize="small" color="action" />;
        default:
            return <InsertDriveFile fontSize="small" color="action" />;
    }
}
