const userList = document.querySelector('#user-list');
const userSearch = document.querySelector('#user-search');
const userCount = document.querySelector('#user-count');
const directoryFeedback = document.querySelector('#directory-feedback');
const refreshUsersButton = document.querySelector('#refresh-users');
const accountLink = document.querySelector('#account-link');
const config = window.FROGCHAT_SUPABASE_CONFIG;
const supabaseClient = config && window.supabase
    ? window.supabase.createClient(config.url, config.anonKey)
    : null;
const pageSize = 500;
let allUsers = [];
let verifiedUsernames = new Set();

function showDirectoryFeedback(message, isError = false) {
    directoryFeedback.textContent = message;
    directoryFeedback.classList.toggle('is-error', isError);
}

function isMissingAvatarPath(error) {
    return error?.code === '42703' || error?.code === 'PGRST204';
}

function renderUsers() {
    const searchTerm = userSearch.value.trim().toLowerCase();
    const matchingUsers = allUsers.filter((user) => user.username.toLowerCase().includes(searchTerm));
    userList.replaceChildren();
    userCount.textContent = searchTerm
        ? `${matchingUsers.length} of ${allUsers.length} members`
        : `${allUsers.length} ${allUsers.length === 1 ? 'member' : 'members'}`;

    if (matchingUsers.length === 0) {
        const emptyState = document.createElement('li');
        emptyState.className = 'user-empty';
        emptyState.textContent = searchTerm ? 'No members match that username.' : 'No members yet.';
        userList.append(emptyState);
        return;
    }

    matchingUsers.forEach((user) => {
        const item = document.createElement('li');
        item.className = 'user-item';
        item.id = `user-${user.id}`;

        const link = document.createElement('a');
        link.className = 'user-profile-link';
        link.href = `#user-${encodeURIComponent(user.id)}`;
        link.setAttribute('aria-label', `View ${user.username}'s profile`);

        const avatar = user.avatar_path ? document.createElement('img') : document.createElement('span');
        avatar.className = 'user-avatar';
        avatar.setAttribute('aria-hidden', 'true');
        if (user.avatar_path) {
            avatar.src = supabaseClient.storage.from('avatars').getPublicUrl(user.avatar_path).data.publicUrl;
            avatar.alt = '';
        } else {
            avatar.textContent = user.username.charAt(0).toUpperCase();
        }

        const username = document.createElement('span');
        username.className = 'user-name';
        username.textContent = user.username;

        if (verifiedUsernames.has(user.username.toLowerCase())) {
            const badge = document.createElement('span');
            badge.className = 'verified-badge';
            badge.setAttribute('role', 'img');
            badge.setAttribute('aria-label', 'Verified member');
            badge.title = 'Verified member';
            badge.textContent = '🐸';
            username.append(badge);
        }

        const joined = document.createElement('span');
        joined.className = 'user-joined';
        joined.textContent = user.created_at
            ? `Joined ${new Date(user.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short' })}`
            : 'Frogchat member';

        link.append(avatar, username, joined);
        item.append(link);
        userList.append(item);
    });

    if (window.location.hash.startsWith('#user-')) {
        document.getElementById(decodeURIComponent(window.location.hash.slice(1)))?.scrollIntoView();
    }
}

async function loadUsers() {
    if (!supabaseClient) {
        showDirectoryFeedback('Could not connect to Supabase. Check the configuration.', true);
        return;
    }

    refreshUsersButton.disabled = true;
    userCount.textContent = 'Loading members...';
    showDirectoryFeedback('');

    try {
        const verificationResponse = await fetch('assets/data/verified-users.json');
        if (!verificationResponse.ok) throw new Error('Could not load the verification list.');
        const verificationData = await verificationResponse.json();
        const names = Array.isArray(verificationData.verifiedUsers)
            ? verificationData.verifiedUsers
            : [];
        verifiedUsernames = new Set(names
            .filter((username) => typeof username === 'string')
            .map((username) => username.trim().toLowerCase()));

        const users = [];
        let includeAvatarPath = true;
        let offset = 0;
        while (true) {
            const columns = includeAvatarPath
                ? 'id, username, created_at, avatar_path'
                : 'id, username, created_at';
            const { data, error } = await supabaseClient
                .from('profiles')
                .select(columns)
                .order('username', { ascending: true })
                .range(offset, offset + pageSize - 1);

            if (error && includeAvatarPath && isMissingAvatarPath(error)) {
                includeAvatarPath = false;
                offset = 0;
                users.length = 0;
                showDirectoryFeedback('Run schema.sql in Supabase to enable profile photos.');
                continue;
            }
            if (error) throw error;
            const page = data || [];
            users.push(...page);
            if (page.length < pageSize) break;
            offset += pageSize;
        }

        allUsers = users;
        renderUsers();
    } catch (error) {
        userCount.textContent = '';
        showDirectoryFeedback(error.message || 'Could not load members.', true);
    } finally {
        refreshUsersButton.disabled = false;
    }
}

if (supabaseClient) {
    supabaseClient.auth.onAuthStateChange((_event, session) => {
        accountLink.hidden = !session?.user;
    });
} else {
    refreshUsersButton.disabled = true;
}

userSearch.addEventListener('input', renderUsers);
refreshUsersButton.addEventListener('click', loadUsers);
loadUsers();
