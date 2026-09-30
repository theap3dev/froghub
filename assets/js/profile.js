(() => {
const profileName = document.querySelector('#profile-name');
const profileAvatar = document.querySelector('#profile-avatar');
const profileAvatarFallback = document.querySelector('#profile-avatar-fallback');
const profileJoined = document.querySelector('#profile-joined');
const profilePostCount = document.querySelector('#profile-post-count');
const profileFeedback = document.querySelector('#profile-feedback');
const profilePostList = document.querySelector('#profile-post-list');
const accountLink = document.querySelector('#account-link');
const config = window.FROGCHAT_SUPABASE_CONFIG;
const supabaseClient = config && window.supabase
    ? window.supabase.createClient(config.url, config.anonKey)
    : null;

function showProfileFeedback(message, isError = false) {
    profileFeedback.textContent = message;
    profileFeedback.classList.toggle('is-error', isError);
}

function isMissingAvatarPath(error) {
    return error?.code === '42703' || error?.code === 'PGRST204';
}

function getRouteUsername() {
    const queryUsername = new URLSearchParams(window.location.search).get('username');
    if (queryUsername) return queryUsername;

    const pathParts = window.location.pathname.split('/').filter(Boolean);
    const usersIndex = pathParts.lastIndexOf('users');
    if (usersIndex === -1 || usersIndex !== pathParts.length - 2) return '';

    try {
        return decodeURIComponent(pathParts[usersIndex + 1]);
    } catch {
        return '';
    }
}

function showAvatarFallback(username) {
    profileAvatar.hidden = true;
    profileAvatar.removeAttribute('src');
    profileAvatarFallback.textContent = username.charAt(0).toUpperCase();
    profileAvatarFallback.hidden = false;
}

function renderProfile(profile) {
    profileName.textContent = profile.username;
    document.title = `${profile.username} | frogchat`;
    profileJoined.textContent = profile.created_at
        ? `Joined ${new Date(profile.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'long' })}`
        : 'Frogchat member';

    if (!profile.avatar_path) {
        showAvatarFallback(profile.username);
        return;
    }

    profileAvatar.addEventListener('error', () => showAvatarFallback(profile.username), { once: true });
    profileAvatar.src = supabaseClient.storage.from('avatars').getPublicUrl(profile.avatar_path).data.publicUrl;
    profileAvatar.hidden = false;
    profileAvatarFallback.hidden = true;
}

function renderPosts(posts) {
    profilePostList.replaceChildren();
    profilePostCount.textContent = `${posts.length} ${posts.length === 1 ? 'post' : 'posts'}`;

    if (posts.length === 0) {
        const emptyState = document.createElement('p');
        emptyState.className = 'post-empty';
        emptyState.textContent = 'No posts yet.';
        profilePostList.append(emptyState);
        return;
    }

    posts.forEach((post) => {
        const article = document.createElement('article');
        article.className = 'post-item';

        const title = document.createElement('h3');
        title.textContent = post.title;

        const meta = document.createElement('p');
        meta.className = 'post-meta';
        meta.textContent = `Posted ${new Date(post.created_at).toLocaleString()}`;

        const body = document.createElement('p');
        body.className = 'post-body';
        body.textContent = post.body;

        article.append(title, meta, body);
        profilePostList.append(article);
    });
}

async function loadProfile() {
    const username = getRouteUsername();
    if (!/^[A-Za-z0-9_]{3,20}$/.test(username)) {
        profileName.textContent = 'Member not found';
        showProfileFeedback('This member profile could not be found.', true);
        return;
    }

    if (!supabaseClient) {
        profileName.textContent = username;
        showProfileFeedback('Could not connect to Supabase. Check the configuration.', true);
        return;
    }

    try {
        let { data: profile, error } = await supabaseClient
            .from('profiles')
            .select('id, username, created_at, avatar_path')
            .eq('username', username)
            .maybeSingle();

        let avatarMigrationNeeded = false;
        if (error && isMissingAvatarPath(error)) {
            avatarMigrationNeeded = true;
            ({ data: profile, error } = await supabaseClient
                .from('profiles')
                .select('id, username, created_at')
                .eq('username', username)
                .maybeSingle());
        }
        if (error) throw error;
        if (!profile) {
            profileName.textContent = 'Member not found';
            showProfileFeedback('This member profile could not be found.', true);
            return;
        }

        renderProfile(profile);
        const { data: posts, error: postsError } = await supabaseClient
            .from('posts')
            .select('id, title, body, created_at')
            .eq('author_id', profile.id)
            .order('created_at', { ascending: false })
            .limit(50);
        if (postsError) throw postsError;

        renderPosts(posts || []);
        showProfileFeedback(avatarMigrationNeeded
            ? 'Run database/schema.sql in Supabase to enable profile photos.'
            : '');
    } catch (error) {
        showProfileFeedback(error.message || 'Could not load this member profile.', true);
    }
}

if (supabaseClient) {
    supabaseClient.auth.onAuthStateChange((_event, session) => {
        accountLink.hidden = !session?.user;
    });
} else {
    accountLink.hidden = true;
}

loadProfile();
})();