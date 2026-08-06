function formatDate(value) { if (!value) return '—'; return new Intl.DateTimeFormat('en-IN',{dateStyle:'medium'}).format(new Date(value)); }
function formatDateTime(value) { if (!value) return '—'; return new Intl.DateTimeFormat('en-IN',{dateStyle:'medium',timeStyle:'short'}).format(new Date(value)); }
function safeReturn(value, fallback='/dashboard') { return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') ? value : fallback; }
module.exports = { formatDate, formatDateTime, safeReturn };
