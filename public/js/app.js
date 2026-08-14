
document.addEventListener('click', (e) => {
    const openBtn = e.target.closest('[data-open]');
    if (openBtn) {
        const id = openBtn.dataset.open;
        const m = document.getElementById(id);
        if (m) {
            if (id === 'task-modal') {
                const f = document.getElementById('single-task-form');
                if (f) {
                    f.reset();
                    const inp = document.getElementById('task-id-input');
                    if (inp) inp.value = '';
                    const h = document.getElementById('task-form-heading');
                    if (h) h.textContent = 'Assign employee task';
                }
            }
            if (id === 'employee-modal') {
                const f = document.getElementById('employee-form');
                if (f) {
                    f.reset();
                    const inp = f.elements['id'];
                    if (inp) inp.value = '';
                    const h = document.getElementById('employee-title');
                    if (h) h.textContent = 'Add Team Member';
                    const n = document.getElementById('pwd-note');
                    if (n) n.textContent = 'Required for new members';
                }
            }
            m.classList.add('open');
            m.classList.add('active');
            if (window.initAllCKEditors) setTimeout(window.initAllCKEditors, 100);
        }
    }

    const closeBtn = e.target.closest('[data-close]');
    if (closeBtn) {
        const modal = closeBtn.closest('.modal');
        if (modal) {
            modal.classList.remove('open');
            modal.classList.remove('active');
        }
    }
});

function initMasterAutocomplete() {

    document.querySelectorAll('.autocomplete-master').forEach(input => {
        if (input.dataset.autocompleteInited) return;
        input.dataset.autocompleteInited = 'true';
        const type = input.dataset.type;
        const container = input.parentElement;
        let suggestionsBox = container.querySelector('.autocomplete-suggestions');
        if (!suggestionsBox) {
            suggestionsBox = document.createElement('div');
            suggestionsBox.className = 'autocomplete-suggestions';
            suggestionsBox.style.cssText = 'display:none; position:absolute; top:100%; left:0; right:0; background:#fff; border:1px solid #cbd5e1; border-radius:8px; max-height:180px; overflow-y:auto; z-index:1000; box-shadow:0 10px 15px -3px rgba(0,0,0,0.1);';
            container.appendChild(suggestionsBox);
        }

        const fetchAndShow = async () => {
            const val = input.value.trim();
            const endpoint = type === 'department' ? '/api/departments' : '/api/designations';
            try {
                const res = await fetch(`${endpoint}?q=${encodeURIComponent(val)}`);
                const items = await res.json();
                suggestionsBox.innerHTML = '';

                if (items && items.length) {
                    items.forEach(item => {
                        const div = document.createElement('div');
                        div.className = 'suggestion-item';
                        div.style.cssText = 'padding:8px 12px; cursor:pointer; font-size:13px; color:#1e293b; border-bottom:1px solid #f1f5f9; display:flex; justify-content:space-between; align-items:center;';
                        div.innerHTML = `<span><i class="fa-solid ${type==='department'?'fa-building':'fa-user-tag'}" style="color:#6366f1; margin-right:6px;"></i> <b>${item.name}</b></span> <small style="color:#94a3b8; font-size:11px;">Select</small>`;
                        div.onmousedown = (e) => {
                            e.preventDefault();
                            input.value = item.name;
                            suggestionsBox.style.display = 'none';
                        };
                        suggestionsBox.appendChild(div);
                    });
                } else if (val) {
                    const div = document.createElement('div');
                    div.className = 'suggestion-item new';
                    div.style.cssText = 'padding:8px 12px; cursor:pointer; font-size:13px; color:#4338ca; background:#f5f3ff; font-weight:600;';
                    div.innerHTML = `<i class="fa-solid fa-plus-circle"></i> Add "${val}" as new ${type}`;
                    div.onmousedown = (e) => {
                        e.preventDefault();
                        suggestionsBox.style.display = 'none';
                    };
                    suggestionsBox.appendChild(div);
                } else {
                    suggestionsBox.style.display = 'none';
                    return;
                }
                suggestionsBox.style.display = 'block';
            } catch(e) {}
        };

        input.addEventListener('focus', fetchAndShow);
        input.addEventListener('input', fetchAndShow);
        input.addEventListener('blur', () => {
            setTimeout(() => { suggestionsBox.style.display = 'none'; }, 200);
        });
    });
}
window.addAssigneeChip = function(selectEl, containerId, inputName) {
    const val = selectEl.value;
    if (!val) return;
    const opt = selectEl.options[selectEl.selectedIndex];
    const name = opt.getAttribute('data-name') || opt.dataset.name || opt.text;
    const role = opt.getAttribute('data-role') || opt.dataset.role || '';
    const fieldName = inputName || 'assigned_to';

    const container = document.getElementById(containerId);
    if (!container) return;

    if (container.querySelector(`[data-assignee-id="${val}"], input[value="${val}"]`)) {
        selectEl.value = '';
        return;
    }

    let chipClass = 'assignee-chip';
    if (role === 'Manager') chipClass += ' chip-manager';
    if (role === 'Self') chipClass += ' chip-self';

    const chip = document.createElement('span');
    chip.className = chipClass;
    chip.setAttribute('data-assignee-id', val);
    chip.innerHTML = `
        <i class="fa-solid ${role === 'Manager' ? 'fa-user-tie' : 'fa-user'}"></i>
        <span>${name}</span>
        <input type="hidden" name="${fieldName}" value="${val}">
        <span class="chip-remove-btn" onclick="removeAssigneeChip(this)">&times;</span>
    `;

    container.appendChild(chip);
    selectEl.value = '';
};



window.removeAssigneeChip = function(btnEl) {
    const chip = btnEl.closest('.assignee-chip');
    if (chip) chip.remove();
};

document.addEventListener('DOMContentLoaded', initMasterAutocomplete);



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

        const activeTabBtn = document.querySelector('.task-tab-btn.active');
        const activeTab = activeTabBtn ? activeTabBtn.getAttribute('data-task-tab') : 'all';
        const cardFilterGroup = card.getAttribute('data-filter-group') || '';

        let matchTab = true;
        if (activeTab === 'assigned-to-me') {
            matchTab = (cardFilterGroup === 'assigned-to-me' || cardFilterGroup === 'self');
        } else if (activeTab === 'assigned-by-me') {
            matchTab = (cardFilterGroup === 'assigned-by-me');
        }

        const isMatch = matchQuery && matchStatus && matchProject && matchTab;
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

document.querySelectorAll('.edit-employee').forEach(b=>b.onclick=()=>{const d=JSON.parse(b.dataset.employee),f=document.getElementById('employee-form');if(f){Object.keys(d).forEach(k=>{if(f.elements[k])f.elements[k].value=d[k]||''});const t=document.getElementById('employee-title');if(t)t.textContent='Edit Team Member';const n=document.getElementById('pwd-note');if(n)n.textContent='Leave empty to keep existing password';document.getElementById('employee-modal').classList.add('open')}});
document.querySelectorAll('.edit-manager').forEach(b=>b.onclick=()=>{const d=JSON.parse(b.dataset.manager),f=document.getElementById('manager-form');if(f){Object.keys(d).forEach(k=>{if(f.elements[k])f.elements[k].value=d[k]||''});const t=document.getElementById('manager-title');if(t)t.textContent='Edit Manager';const n=document.getElementById('pwd-note');if(n)n.textContent='Leave empty to keep existing password';document.getElementById('manager-modal').classList.add('open')}});


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
        const defaultCard = document.querySelector('.metric-card[onclick*="all"], .metric-card[title*="all"]');
        if (defaultCard && document.querySelector('.compact-filter')) {
            defaultCard.classList.add('active-kpi-filter');
        }
    }
});

// Multi-Assignee Chip Selection Helpers
window.removeAssigneeChip = function(btnEl) {
    const chip = btnEl.closest('.assignee-chip');
    if (chip) chip.remove();
};

// Global Custom Confirmation Modal Helper
window.showConfirmDialog = function(options = {}) {
    return new Promise((resolve) => {
        const modal = document.getElementById('global-confirm-modal');
        if (!modal) {
            resolve(window.confirm ? window.confirm(options.message || 'Are you sure?') : true);
            return;
        }

        const titleEl = document.getElementById('confirm-modal-title');
        const msgEl = document.getElementById('confirm-modal-message');
        const okBtn = document.getElementById('confirm-modal-ok-btn');
        const cancelBtn = document.getElementById('confirm-modal-cancel-btn');
        const iconDiv = document.getElementById('confirm-modal-icon');
        const iconI = document.getElementById('confirm-modal-icon-i');

        if (titleEl) titleEl.textContent = options.title || 'Confirm Action';
        if (msgEl) msgEl.textContent = options.message || 'Are you sure you want to proceed?';

        if (okBtn) {
            okBtn.textContent = options.confirmText || (options.danger !== false ? 'Yes, Delete' : 'Confirm');
            if (options.danger !== false) {
                okBtn.className = 'btn btn-confirm-danger';
            } else {
                okBtn.className = 'btn primary';
            }
        }

        if (cancelBtn) {
            cancelBtn.textContent = options.cancelText || 'Cancel';
        }

        if (iconDiv && iconI) {
            if (options.danger !== false) {
                iconDiv.className = 'confirm-modal-icon danger';
                iconI.className = 'fa-solid fa-trash-can';
            } else {
                iconDiv.className = 'confirm-modal-icon warning';
                iconI.className = 'fa-solid fa-triangle-exclamation';
            }
        }

        modal.classList.add('open');
        modal.classList.add('active');

        function cleanup(result) {
            modal.classList.remove('open');
            modal.classList.remove('active');
            if (okBtn) okBtn.removeEventListener('click', onOk);
            if (cancelBtn) cancelBtn.removeEventListener('click', onCancel);
            const closeBtn = modal.querySelector('.modal-close');
            if (closeBtn) closeBtn.removeEventListener('click', onCancel);
            document.removeEventListener('keydown', onKey);
            resolve(result);
        }

        function onOk(e) {
            e.preventDefault();
            cleanup(true);
        }

        function onCancel(e) {
            e.preventDefault();
            cleanup(false);
        }

        function onKey(e) {
            if (e.key === 'Escape') {
                cleanup(false);
            }
        }

        if (okBtn) okBtn.addEventListener('click', onOk);
        if (cancelBtn) cancelBtn.addEventListener('click', onCancel);
        const closeBtn = modal.querySelector('.modal-close');
        if (closeBtn) closeBtn.addEventListener('click', onCancel);
        document.addEventListener('keydown', onKey);
    });
};

// Global Form Submit Interceptor to show custom in-app confirmation modal instead of browser alert/confirm
document.addEventListener('submit', async function(e) {
    const form = e.target;
    if (form.dataset.confirmed === 'true') return;

    let confirmMsg = form.dataset.confirm;
    if (!confirmMsg && form.getAttribute('onsubmit')) {
        const match = form.getAttribute('onsubmit').match(/confirm\(['"](.*?)['"]\)/);
        if (match && match[1]) {
            confirmMsg = match[1];
        }
    }

    if (confirmMsg) {
        e.preventDefault();
        e.stopPropagation();

        const isDelete = form.action.includes('delete') || form.classList.contains('delete-form') || confirmMsg.toLowerCase().includes('delete');

        const confirmed = await window.showConfirmDialog({
            title: isDelete ? 'Confirm Action' : 'Please Confirm',
            message: confirmMsg,
            confirmText: isDelete ? 'Yes, Delete' : 'Confirm',
            danger: isDelete
        });

        if (confirmed) {
            form.dataset.confirmed = 'true';
            if (form.requestSubmit) {
                form.requestSubmit();
            } else {
                form.submit();
            }
        }
    }
}, true);


