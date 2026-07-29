const ALLOWED_FORMAT_TAGS = new Set(['STRONG', 'EM', 'U', 'BR']);

export function sanitizeQuestionHtml(html) {
    const template = document.createElement('template');
    template.innerHTML = html || '';

    const fragment = document.createDocumentFragment();
    appendSanitizedChildren(template.content, fragment);
    return fragment;
}

function appendSanitizedChildren(source, target) {
    source.childNodes.forEach(node => {
        const sanitized = sanitizeNode(node);
        if (sanitized) {
            target.appendChild(sanitized);
        }
    });
}

function sanitizeNode(node) {
    if (node.nodeType === Node.TEXT_NODE) {
        return document.createTextNode(node.textContent || '');
    }

    if (node.nodeType !== Node.ELEMENT_NODE) {
        return null;
    }

    if (!ALLOWED_FORMAT_TAGS.has(node.tagName)) {
        const fragment = document.createDocumentFragment();
        appendSanitizedChildren(node, fragment);
        return fragment;
    }

    const safeElement = document.createElement(node.tagName.toLowerCase());
    if (node.tagName !== 'BR') {
        appendSanitizedChildren(node, safeElement);
    }
    return safeElement;
}

export function setSanitizedHtml(element, html) {
    element.replaceChildren(sanitizeQuestionHtml(html));
}

export function appendSanitizedHtml(element, html) {
    element.appendChild(sanitizeQuestionHtml(html));
}

export function sanitizeToHtml(html) {
    const container = document.createElement('div');
    container.appendChild(sanitizeQuestionHtml(html));
    return container.innerHTML;
}

export function stripHtml(html) {
    const container = document.createElement('div');
    container.appendChild(sanitizeQuestionHtml(html));
    return container.textContent || '';
}

export function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => {
        switch (char) {
            case '&':
                return '&amp;';
            case '<':
                return '&lt;';
            case '>':
                return '&gt;';
            case '"':
                return '&quot;';
            case "'":
                return '&#39;';
            default:
                return char;
        }
    });
}
