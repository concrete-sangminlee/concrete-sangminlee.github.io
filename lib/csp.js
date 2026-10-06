// Content-Security-Policy for every generated page, as a <meta> tag (GitHub Pages
// cannot set headers). Inline scripts are allowed by hash, so script-src has no
// 'unsafe-inline'. Run on the final (minified) HTML: the hashes must match the
// bytes the browser sees. frame-ancestors cannot be set from a <meta> tag.
import crypto from 'crypto';

const JS_TYPES = /^(|text\/javascript|application\/javascript|module)$/i;

export function withCsp(html) {
    if (/http-equiv="?Content-Security-Policy/i.test(html)) throw new Error('page already has a CSP meta tag');
    const hashes = [];
    for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
        const attrs = m[1];
        if (/\bsrc\s*=/i.test(attrs)) continue;
        const type = (attrs.match(/\btype\s*=\s*["']?([^"'\s>]+)/i) || [])[1] || '';
        if (!JS_TYPES.test(type)) continue; // JSON / JSON-LD data blocks are not executed
        hashes.push(`'sha256-${crypto.createHash('sha256').update(m[2], 'utf8').digest('base64')}'`);
    }
    const policy = [
        "default-src 'self'",
        `script-src 'self'${hashes.length ? ` ${[...new Set(hashes)].join(' ')}` : ''}`,
        "style-src 'self' 'unsafe-inline'",
        "font-src 'self'",
        "img-src 'self' data: https:",
        "connect-src 'self'",
        "worker-src 'self'",
        "manifest-src 'self'",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
    ].join('; ');
    let tags = `<meta http-equiv="Content-Security-Policy" content="${policy}">`;
    if (!/<meta\s+name="?referrer/i.test(html)) tags += '<meta name="referrer" content="strict-origin-when-cross-origin">';
    const charset = html.match(/<meta\s+charset=["']?utf-8["']?\s*\/?>/i);
    if (!charset) throw new Error('page has no <meta charset> to put the CSP after');
    return html.replace(charset[0], () => charset[0] + tags);
}
