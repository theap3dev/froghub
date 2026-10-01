(() => {
    const feedback = document.querySelector('#admin-feedback');
    const content = document.querySelector('#admin-content');
    const accountLink = document.querySelector('#account-link');
    const refreshButton = document.querySelector('#refresh-admin');
    const searchInput = document.querySelector('#admin-search');
    const memberSelect = document.querySelector('#admin-user-select');
    const selectedStatus = document.querySelector('#admin-selected-status');
    const actionForm = document.querySelector('#admin-action-form');
    const actionSelect = document.querySelector('#admin-action-select');
    const warningField = document.querySelector('#admin-warning-field');
    const warningInput = document.querySelector('#admin-warning-message');
    const timeoutField = document.querySelector('#admin-timeout-field');
    const timeoutSelect = document.querySelector('#admin-timeout-duration');
    const deleteNote = document.querySelector('#admin-delete-note');
    const applyButton = document.querySelector('#admin-apply-action');
    const postList = document.querySelector('#admin-post-list');
    const warningList = document.querySelector('#admin-warning-list');
    const config = window.FROGCHAT_SUPABASE_CONFIG;
    const supabaseClient = config && window.supabase
        ? window.supabase.createClient(config.url, config.anonKey)
        : null;
    let members = [];
    let restrictions = new Map();
    let warnings = [];
    let posts = [];
    let currentUserId = null;

    function showFeedback(message, isError = false) {
        feedback.textContent = message;
        feedback.classList.toggle('is-error', isError);
    }

    function textElement(tag, className, text) {
        const element = document.createElement(tag);
        element.className = className;
        element.textContent = text;
        return element;
    }

    function statusFor(userId) {
        const restriction = restrictions.get(userId);
        if (restriction?.is_banned) return 'Banned from posting';
        if (restriction?.timeout_until && new Date(restriction.timeout_until) > new Date()) {
            return `Timed out until ${new Date(restriction.timeout_until).toLocaleString()}`;
        }
        return 'No active restriction';
    }

    function renderMembers() {
        const term = searchInput.value.trim().toLowerCase();
        const visible = members.filter((member) => member.username.toLowerCase().includes(term));
        const previousSelection = memberSelect.value;
        memberSelect.replaceChildren();
        if (!visible.length) {
            const option = document.createElement('option');
            option.value = '';
            option.textContent = term ? 'No matching members' : 'No members available';
            memberSelect.append(option);
        } else {
            visible.forEach((member) => {
                const option = document.createElement('option');
                option.value = member.id;
                option.textContent = `${member.username} - ${statusFor(member.id)}`;
                memberSelect.append(option);
            });
            memberSelect.value = visible.some((member) => member.id === previousSelection)
                ? previousSelection
                : visible[0].id;
        }
        memberSelect.disabled = visible.length === 0;
        updateSelectedMember();
    }

    function updateSelectedMember() {
        const selectedMember = members.find((member) => member.id === memberSelect.value);
        if (!selectedMember) {
            selectedStatus.textContent = 'Select a member to view their status.';
            updateActionFields();
            return;
        }
        selectedStatus.textContent = `${selectedMember.username} - ${statusFor(selectedMember.id)}`;
        updateActionFields();
    }

    function updateActionFields() {
        const action = actionSelect.value;
        const selectedMember = members.find((member) => member.id === memberSelect.value);
        const showWarning = action === 'warn';
        const showTimeout = action === 'timeout';
        const showDeleteNote = action === 'delete-account';
        warningField.hidden = !showWarning;
        warningInput.required = showWarning;
        timeoutField.hidden = !showTimeout;
        deleteNote.hidden = !showDeleteNote;
        applyButton.textContent = ({
            warn: 'Issue warning',
            ban: 'Ban member',
            timeout: 'Apply timeout',
            clear: 'Clear restriction',
            'delete-account': 'Delete account'
        })[action] || 'Apply action';
        applyButton.classList.toggle('admin-action-danger', action === 'ban' || showDeleteNote);
        applyButton.disabled = !selectedMember || !action || (showDeleteNote && selectedMember.id === currentUserId);
        if (showDeleteNote && selectedMember?.id === currentUserId) {
            selectedStatus.textContent = 'You cannot delete your own account from the moderation panel.';
        } else if (selectedMember) {
            selectedStatus.textContent = `${selectedMember.username} - ${statusFor(selectedMember.id)}`;
        }
    }

    function renderPosts() {
        postList.replaceChildren();
        if (!posts.length) {
            postList.append(textElement('p', 'admin-empty', 'No posts found.'));
            return;
        }
        posts.forEach((post) => {
            const item = document.createElement('article');
            item.className = 'admin-post';
            const details = document.createElement('div');
            details.append(
                textElement('strong', 'admin-post-title', post.title),
                textElement('span', 'admin-post-meta', `${post.profiles?.username || 'frogchat member'} | ${new Date(post.created_at).toLocaleString()}`),
                textElement('p', 'admin-post-body', post.body)
            );
            const button = document.createElement('button');
            button.className = 'admin-action admin-action-danger';
            button.type = 'button';
            button.textContent = 'Delete post';
            button.dataset.postId = post.id;
            item.append(details, button);
            postList.append(item);
        });
    }

    function renderWarnings() {
        warningList.replaceChildren();
        if (!warnings.length) {
            warningList.append(textElement('li', 'admin-empty', 'No warnings have been issued.'));
            return;
        }
        const usernames = new Map(members.map((member) => [member.id, member.username]));
        warnings.forEach((warning) => {
            const item = document.createElement('li');
            item.className = 'admin-warning-item';
            item.append(
                textElement('strong', 'admin-warning-name', usernames.get(warning.user_id) || 'Deleted member'),
                textElement('span', 'admin-warning-date', new Date(warning.created_at).toLocaleString()),
                textElement('p', 'admin-warning-message', warning.message)
            );
            warningList.append(item);
        });
    }

    async function loadData() {
        refreshButton.disabled = true;
        showFeedback('Loading moderation data...');
        try {
            const [memberResult, restrictionResult, warningResult, postResult] = await Promise.all([
                supabaseClient.from('profiles').select('id, username, created_at').order('username'),
                supabaseClient.from('user_moderation').select('user_id, is_banned, timeout_until'),
                supabaseClient.from('moderation_warnings').select('id, user_id, message, created_at').order('created_at', { ascending: false }).limit(100),
                supabaseClient.from('posts').select('id, title, body, created_at, profiles(username)').order('created_at', { ascending: false }).limit(50)
            ]);
            const error = memberResult.error || restrictionResult.error || warningResult.error || postResult.error;
            if (error) throw error;
            members = memberResult.data || [];
            restrictions = new Map((restrictionResult.data || []).map((row) => [row.user_id, row]));
            warnings = warningResult.data || [];
            posts = postResult.data || [];
            renderMembers();
            renderPosts();
            renderWarnings();
            showFeedback('Moderation data is up to date.');
        } catch (error) {
            showFeedback(error.message || 'Could not load moderation data.', true);
        } finally {
            refreshButton.disabled = false;
        }
    }

    async function checkAccess(session) {
        currentUserId = session?.user?.id || null;
        accountLink.hidden = !session?.user;
        content.hidden = true;
        if (!session?.user) {
            refreshButton.disabled = true;
            showFeedback('Sign in with a moderator account to continue.', true);
            return;
        }
        const { data, error } = await supabaseClient.rpc('is_moderator');
        if (error) {
            refreshButton.disabled = true;
            showFeedback('Run database/schema.sql in Supabase, then add your account to moderation_admins.', true);
            return;
        }
        if (!data) {
            refreshButton.disabled = true;
            showFeedback('This account does not have moderator access.', true);
            return;
        }
        content.hidden = false;
        await loadData();
    }

    async function setRestriction(userId, action, duration) {
        const member = members.find((item) => item.id === userId);
        if (action === 'ban' && !window.confirm(`Ban ${member?.username || 'this member'} from posting and replying?`)) return;
        const until = action === 'timeout' ? new Date(Date.now() + duration).toISOString() : null;
        const { error } = await supabaseClient.rpc('admin_set_user_restriction', {
            p_user_id: userId,
            p_restriction: action,
            p_timeout_until: until
        });
        if (error) throw error;
    }

    if (!supabaseClient) {
        showFeedback('Connect your Supabase project to use moderation.', true);
    } else {
        supabaseClient.auth.onAuthStateChange((_event, session) => {
            queueMicrotask(() => {
                checkAccess(session).catch((error) => showFeedback(error.message, true));
            });
        });
    }

    searchInput.addEventListener('input', renderMembers);
    memberSelect.addEventListener('change', updateSelectedMember);
    actionSelect.addEventListener('change', updateActionFields);
    refreshButton.addEventListener('click', loadData);
    actionForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const userId = memberSelect.value;
        const action = actionSelect.value;
        const selectedMember = members.find((member) => member.id === userId);
        if (!selectedMember || !action) return;

        applyButton.disabled = true;
        try {
            if (action === 'warn') {
                const { error } = await supabaseClient.rpc('admin_warn_user', {
                    p_user_id: userId,
                    p_message: warningInput.value.trim()
                });
                if (error) throw error;
            } else if (action === 'delete-account') {
                const confirmed = window.confirm(
                    `Permanently delete ${selectedMember.username}, including their posts, replies, and moderation history? This cannot be undone.`
                );
                if (!confirmed) return;
                const { error } = await supabaseClient.rpc('admin_delete_user', {
                    p_user_id: userId
                });
                if (error) throw error;
            } else {
                const duration = Number(timeoutSelect.value);
                await setRestriction(userId, action, duration);
            }

            actionSelect.value = '';
            warningInput.value = '';
            updateActionFields();
            await loadData();
        } catch (error) {
            showFeedback(error.message || 'Could not apply moderation action.', true);
        } finally {
            updateActionFields();
        }
    });
    postList.addEventListener('click', async (event) => {
        const button = event.target.closest('button[data-post-id]');
        if (!button || !window.confirm('Permanently delete this post and its replies?')) return;
        button.disabled = true;
        const { error } = await supabaseClient.from('posts').delete().eq('id', button.dataset.postId);
        if (error) {
            showFeedback(error.message || 'Could not delete post.', true);
            button.disabled = false;
            return;
        }
        await loadData();
    });
})();