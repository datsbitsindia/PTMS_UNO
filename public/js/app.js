document.addEventListener('click',event=>{const target=event.target.closest('a,button');if(!target)return;const payload=JSON.stringify({action:target.dataset.audit||target.getAttribute('aria-label')||target.textContent.trim()||target.tagName,text:target.textContent.trim(),href:target.getAttribute('href')||'',page:location.pathname});navigator.sendBeacon('/audit/click',new Blob([payload],{type:'application/json'}));});document.querySelector('.menu-btn')?.addEventListener('click',()=>document.querySelector('.sidebar').classList.toggle('open'));document.querySelectorAll('[data-open]').forEach(b=>b.onclick=()=>{const id=b.dataset.open,m=document.getElementById(id);if(!m)return;if(id==='task-modal'){const f=document.getElementById('single-task-form');if(f){f.reset();const inp=document.getElementById('task-id-input');if(inp)inp.value='';const h=document.getElementById('task-form-heading');if(h)h.textContent='Assign employee task'}}if(id==='manager-modal'){const f=document.getElementById('manager-form');if(f){f.reset();const inp=document.getElementById('manager-id-input');if(inp)inp.value='';const h=document.getElementById('manager-title');if(h)h.textContent='Add manager';const n=document.getElementById('pwd-note');if(n)n.textContent='Required for new managers'}}m.classList.add('open');if(window.initAllCKEditors)setTimeout(window.initAllCKEditors,100);});document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>b.closest('.modal').classList.remove('open'));document.querySelectorAll('.edit-employee').forEach(b=>b.onclick=()=>{const d=JSON.parse(b.dataset.employee),f=document.getElementById('employee-form');Object.keys(d).forEach(k=>{if(f.elements[k])f.elements[k].value=d[k]||''});document.getElementById('employee-title').textContent='Edit employee';document.getElementById('employee-modal').classList.add('open')});document.querySelectorAll('.edit-manager').forEach(b=>b.onclick=()=>{const d=JSON.parse(b.dataset.manager),f=document.getElementById('manager-form');Object.keys(d).forEach(k=>{if(f.elements[k])f.elements[k].value=d[k]||''});const t=document.getElementById('manager-title');if(t)t.textContent='Edit manager';const n=document.getElementById('pwd-note');if(n)n.textContent='Leave empty to keep existing password';document.getElementById('manager-modal').classList.add('open')});const chart=document.getElementById('statusChart');if(chart){const data=JSON.parse(chart.dataset.values);new Chart(chart,{type:'doughnut',data:{labels:data.map(x=>x.label),datasets:[{data:data.map(x=>x.value),backgroundColor:['#f59e0b','#16a34a','#22c55e','#94a3b8']}]},options:{responsive:true,plugins:{legend:{position:'bottom'}}}})}

function applyCompactFilter(bar){window.applyCompactFilter(bar);}
window.applyCompactFilter = function(bar) {
    if (!bar) bar = document.querySelector('.compact-filter');

    const queryInput = bar ? bar.querySelector('input[type="search"]') : null;
    let query = (queryInput?.value || '').trim().toLowerCase();
    const selects = bar ? [...bar.querySelectorAll('select')] : [];
    const activeKpi = (bar?.dataset?.activeKpi || window.currentKpiFilter || '').toLowerCase().trim();
    
    let projectFilter = '';
    let statusFilter = '';

    if (query === 'active' || query === 'inactive') {
        statusFilter = query;
        query = '';
    }

    selects.forEach(s => {
        const val = s.value.trim().toLowerCase();
        if (!val || val.startsWith('all ')) return;
        const firstOpt = (s.options[0]?.text || '').toLowerCase();
        if (firstOpt.includes('project') || firstOpt.includes('department')) {
            projectFilter = val;
        } else {
            statusFilter = val;
        }
    });

    let panel = bar ? bar.closest('.ui-panel, .content') || document : document;
    const cards = [...(panel.querySelectorAll('.entity-card, .activity-row') || [])];
    let visible = 0;

    cards.forEach(card => {
        const text = card.textContent.toLowerCase();
        const cardStatus = (card.dataset.status || '').toLowerCase();
        const isOverdue = card.dataset.overdue === 'true';
        const isForwarded = card.dataset.forwarded === 'true';
        const cardProject = (card.dataset.project || '').toLowerCase();
        const cardRole = (card.dataset.role || '').toLowerCase();
        const cardAction = (card.dataset.action || '').toLowerCase();

        const matchQuery = !query || text.includes(query);
        let matchStatus = true;

        const checkStatusMatch = (target) => {
            if (!target) return true;
            const cleanTarget = target.replaceAll(' ', '-').toLowerCase();
            if (cleanTarget === 'overdue') {
                return isOverdue || cardStatus === 'overdue';
            }
            if (cleanTarget.includes('forwarded')) {
                return isForwarded;
            }
            if (cleanTarget === 'pending') {
                return cardStatus === 'pending' || cardStatus === 'planned';
            }
            if (cardStatus) {
                return cardStatus === cleanTarget || cardStatus.includes(cleanTarget) || text.includes(cleanTarget);
            }
            return cardRole === cleanTarget || cardAction === cleanTarget || text.includes(cleanTarget);
        };

        if (activeKpi && activeKpi !== 'all') {
            matchStatus = checkStatusMatch(activeKpi);
        } else if (statusFilter) {
            matchStatus = checkStatusMatch(statusFilter);
        }

        let matchProject = true;
        if (projectFilter) {
            if (cardProject) {
                matchProject = cardProject === projectFilter || cardProject.includes(projectFilter);
            } else if (cardAction || cardRole) {
                matchProject = cardAction === projectFilter || cardRole === projectFilter || text.includes(projectFilter);
            } else {
                matchProject = text.includes(projectFilter);
            }
        }

        const isMatch = matchQuery && matchStatus && matchProject;
        if (isMatch) {
            card.style.setProperty('display', '', '');
            card.removeAttribute('hidden');
            card.hidden = false;
            visible++;
        } else {
            card.style.setProperty('display', 'none', 'important');
            card.setAttribute('hidden', 'true');
            card.hidden = true;
        }
    });

    let empty = panel.querySelector('.filter-empty');
    if (!empty) {
        empty = document.createElement('p');
        empty.className = 'empty filter-empty';
        empty.textContent = 'No matching records found.';
        (panel.querySelector('.entity-list, .activity-timeline') || panel).appendChild(empty);
    }
    empty.style.display = (visible === 0) ? 'block' : 'none';
    empty.hidden = (visible !== 0);
};

document.addEventListener('click',event=>{const btn=event.target.closest('.filter-confirm');if(btn){const bar=btn.closest('.compact-filter');if(bar)window.applyCompactFilter(bar)}});document.addEventListener('keydown',event=>{if(event.key==='Enter'&&event.target.matches('.compact-filter input')){event.preventDefault();const bar=event.target.closest('.compact-filter');if(bar)window.applyCompactFilter(bar)}});

document.querySelectorAll('.entity-card').forEach(card=>{const link=card.querySelector('.entity-title a[href^="/tasks/"]');if(!link)return;card.dataset.cardLink=link.href;card.addEventListener('click',event=>{if(event.target.closest('a,button,input,select,form'))return;location.href=link.href})});

// PWA Service Worker Registration & Persistent Session Handling
let deferredInstallPrompt = null;
if ('serviceWorker' in navigator) {
    const registerSW = () => {
        navigator.serviceWorker.register('/sw.js', { scope: '/' })
            .then(reg => console.log('PWA Service Worker registered:', reg.scope))
            .catch(err => console.error('PWA Service Worker registration failed:', err));
    };
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        registerSW();
    } else {
        window.addEventListener('load', registerSW);
    }
}

// Session keep-alive heartbeat every 4 minutes while app is running
setInterval(() => {
    fetch('/notifications', { method: 'HEAD' }).catch(() => {});
}, 4 * 60 * 1000);

// Capture PWA install prompt
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
});

// Install App button - show guide modal
document.addEventListener('click', (e) => {
    const trigger = e.target.closest('#pwa-install-btn, .pwa-install-trigger');
    if (!trigger) return;
    const modal = document.getElementById('pwa-guide-modal');
    if (modal) modal.classList.add('open');
});

window.closeMobilePwaBanner = function() {
    const banner = document.getElementById('mobile-pwa-banner');
    if (banner) banner.style.display = 'none';
};

// CKEditor Helper Initializer (Bold, Numbered List, Bulleted List only)
window.initCKEditor = function(elementOrSelector) {
    const el = typeof elementOrSelector === 'string' ? document.querySelector(elementOrSelector) : elementOrSelector;
    if (!el || el.dataset.ckeditorInitialized) return Promise.resolve(null);
    el.dataset.ckeditorInitialized = "true";

    if (typeof ClassicEditor === 'undefined') return Promise.resolve(null);

    return ClassicEditor
        .create(el, {
            toolbar: [ 'bold', 'numberedList', 'bulletedList' ]
        })
        .then(editor => {
            editor.model.document.on('change:data', () => {
                el.value = editor.getData();
                el.dispatchEvent(new Event('input', { bubbles: true }));
                el.dispatchEvent(new Event('change', { bubbles: true }));
            });
            el._ckeditor = editor;
            return editor;
        })
        .catch(err => {
            console.error('CKEditor initialization error:', err);
            return null;
        });
};

window.initAllCKEditors = function() {
    document.querySelectorAll('textarea.ck-editor-target').forEach(el => {
        window.initCKEditor(el);
    });
};

document.addEventListener('DOMContentLoaded', () => {
    window.initAllCKEditors();
});

document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.tagName === 'TEXTAREA') {
        const textarea = e.target;
        const start = textarea.selectionStart;
        const text = textarea.value;
        const lineStart = text.lastIndexOf('\n', start - 1) + 1;
        const line = text.substring(lineStart, start);
        
        const match = line.match(/^(\s*[-•]\s*)/);
        if (match) {
            if (line.trim() === '-' || line.trim() === '•') {
                e.preventDefault();
                textarea.value = text.substring(0, lineStart) + text.substring(start);
                textarea.selectionStart = textarea.selectionEnd = lineStart;
                return;
            }
            e.preventDefault();
            const prefix = '\n' + match[1];
            const before = text.substring(0, start);
            const after = text.substring(start);
            textarea.value = before + prefix + after;
            textarea.selectionStart = textarea.selectionEnd = start + prefix.length;
        }
    }
});

// Universal KPI Card Click Filter & Active Highlight
window.filterByKpi = function(filterVal, event) {
    const bar = document.querySelector('.compact-filter');
    const searchInput = bar ? bar.querySelector('input[type="search"]') : null;
    const selects = bar ? bar.querySelectorAll('select') : [];
    
    // Clear existing highlight
    document.querySelectorAll('.metric-card').forEach(card => {
        card.classList.remove('active-kpi-filter');
    });

    let targetCard = null;
    if (event && event.currentTarget) {
        targetCard = event.currentTarget.closest('.metric-card');
    }

    const valStr = String(filterVal || '').toLowerCase().trim();
    window.currentKpiFilter = valStr;
    if (bar) bar.dataset.activeKpi = valStr;

    if (!valStr || valStr === 'all') {
        if (searchInput) searchInput.value = '';
        selects.forEach(s => s.selectedIndex = 0);
        if (!targetCard) {
            targetCard = document.querySelector('.metric-card[onclick*="all"], .metric-card[title*="all"]');
        }
    } else {
        let matched = false;
        selects.forEach(s => {
            [...s.options].forEach((opt, idx) => {
                const optText = opt.text.toLowerCase().trim();
                const optVal = opt.value.toLowerCase().trim();
                if (optText === valStr || optVal === valStr || optText.includes(valStr) || valStr.includes(optText)) {
                    s.selectedIndex = idx;
                    matched = true;
                }
            });
        });
        if (!matched && searchInput) {
            searchInput.value = filterVal;
        }

        if (!targetCard) {
            document.querySelectorAll('.metric-card').forEach(card => {
                const onclickAttr = (card.getAttribute('onclick') || '').toLowerCase();
                const hrefAttr = (card.getAttribute('href') || '').toLowerCase();
                const textContent = card.textContent.toLowerCase();
                if (onclickAttr.includes(valStr) || hrefAttr.includes(valStr) || textContent.includes(valStr)) {
                    targetCard = card;
                }
            });
        }
    }

    if (targetCard) {
        targetCard.classList.add('active-kpi-filter');
    }

    if (bar) {
        applyCompactFilter(bar);
    } else {
        const cards = document.querySelectorAll('.entity-card, .activity-row');
        cards.forEach(card => {
            if (!valStr || valStr === 'all') {
                card.style.setProperty('display', '', '');
                card.removeAttribute('hidden');
                card.hidden = false;
            } else {
                const cardStatus = (card.dataset.status || '').toLowerCase();
                const cardText = card.textContent.toLowerCase();
                const cleanVal = valStr.replaceAll(' ', '-');
                const isMatch = cardStatus === valStr || cardStatus === cleanVal || cardStatus.includes(cleanVal) || cardStatus.includes(valStr) || cardText.includes(valStr);
                if (isMatch) {
                    card.style.setProperty('display', '', '');
                    card.removeAttribute('hidden');
                    card.hidden = false;
                } else {
                    card.style.setProperty('display', 'none', 'important');
                    card.setAttribute('hidden', 'true');
                    card.hidden = true;
                }
            }
        });
    }
};

// Delegate KPI card click events globally
document.addEventListener('click', event => {
    const card = event.target.closest('.metric-card');
    if (!card) return;
    
    // If card has onclick with filterByKpi, pass event
    const onclickAttr = card.getAttribute('onclick') || '';
    if (onclickAttr.includes('filterByKpi')) return; // already handled inline
    
    // Highlight clicked card
    document.querySelectorAll('.metric-card').forEach(c => c.classList.remove('active-kpi-filter'));
    card.classList.add('active-kpi-filter');
});

document.addEventListener('DOMContentLoaded', () => {
    const params = new URLSearchParams(window.location.search);
    const statusParam = params.get('status');
    if (statusParam) {
        window.filterByKpi(statusParam);
    } else {
        // Highlight default total/all card if on a filterable page
        const defaultCard = document.querySelector('.metric-card[onclick*="all"], .metric-card[title*="all"]');
        if (defaultCard && document.querySelector('.compact-filter')) {
            defaultCard.classList.add('active-kpi-filter');
        }
    }
});
