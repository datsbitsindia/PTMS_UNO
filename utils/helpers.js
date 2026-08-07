function parseISTDate(value) {
    if (!value) return null;
    if (value instanceof Date) return value;
    let str = String(value).trim();
    if (!str) return null;
    if (!str.includes('Z') && !str.includes('+') && !str.includes('GMT')) {
        str = str.replace(' ', 'T') + '+05:30';
    }
    const d = new Date(str);
    return isNaN(d.getTime()) ? null : d;
}

function formatDate(value) {
    if (!value) return '—';
    try {
        const d = parseISTDate(value);
        if (!d) return '—';
        return new Intl.DateTimeFormat('en-IN', {
            dateStyle: 'medium',
            timeZone: 'Asia/Kolkata'
        }).format(d);
    } catch (e) {
        return '—';
    }
}

function formatDateTime(value) {
    if (!value) return '—';
    try {
        const d = parseISTDate(value);
        if (!d) return '—';
        return new Intl.DateTimeFormat('en-IN', {
            dateStyle: 'medium',
            timeStyle: 'short',
            hour12: true,
            timeZone: 'Asia/Kolkata'
        }).format(d);
    } catch (e) {
        return '—';
    }
}

function safeReturn(value, fallback = '/dashboard') {
    return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') ? value : fallback;
}

module.exports = { formatDate, formatDateTime, safeReturn };
