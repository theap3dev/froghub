(() => {
const postForm = document.querySelector('#post-form');
const postTitleInput = document.querySelector('#post-title');
const postBodyInput = document.querySelector('#post-body');
const postSubmitButton = document.querySelector('#post-submit');
const postFeedback = document.querySelector('#post-feedback');
const postList = document.querySelector('#post-list');
const refreshPostsButton = document.querySelector('#refresh-posts');
const accountLink = document.querySelector('#account-link');
const config = window.FROGHUB_SUPABASE_CONFIG;
const supabaseClient = config && window.supabase
    ? window.supabase.createClient(config.url, config.anonKey)
    : null;

function showPostFeedback(message, isError = false) {
    postFeedback.textContent = message;
    postFeedback.classList.toggle('is-error', isError);
}

function renderPosts(posts) {
    postList.replaceChildren();

    if (posts.length === 0) {
        const emptyState = document.createElement('p');
        emptyState.className = 'post-empty';
        emptyState.textContent = 'No posts yet. Sign in to share the first one.';
        postList.append(emptyState);
        return;
    }

    posts.forEach((post) => {
        const article = document.createElement('article');
        article.className = 'post-item';

        const title = document.createElement('h3');
        title.textContent = post.title;

        const meta = document.createElement('p');
        meta.className = 'post-meta';
        const username = post.profiles?.username || 'froghub member';
        const date = new Date(post.created_at).toLocaleString();
        if (post.profiles?.id) {
            const profileLink = document.createElement('a');
            profileLink.className = 'post-profile-link';
            profileLink.href = `users.html#user-${encodeURIComponent(post.profiles.id)}`;
            profileLink.textContent = username;
            meta.append('Posted by ', profileLink, ` | ${date}`);
        } else {
            meta.textContent = `Posted by ${username} | ${date}`;
        }

        const body = document.createElement('p');
        body.className = 'post-body';
        body.textContent = post.body;

        article.append(title, meta, body);
        postList.append(article);
    });
}

async function loadPosts() {
    showPostFeedback('Loading posts...');
    postList.replaceChildren();

    const { data, error } = await supabaseClient
        .from('posts')
        .select('id, title, body, created_at, profiles(id, username)')
        .order('created_at', { ascending: false })
        .limit(50);

    if (error) {
        showPostFeedback(error.message, true);
        return;
    }

    showPostFeedback('');
    renderPosts(data || []);
}

if (!supabaseClient) {
    if (postSubmitButton) postSubmitButton.disabled = true;
    refreshPostsButton.disabled = true;
    showPostFeedback('Connect your Supabase project to load posts.', true);
} else {
    supabaseClient.auth.onAuthStateChange((_event, session) => {
        const isSignedIn = Boolean(session?.user);
        accountLink.hidden = !isSignedIn;
        if (postForm) postForm.hidden = !isSignedIn;
    });
    loadPosts().catch((error) => showPostFeedback(error.message, true));
}

if (postForm) postForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!supabaseClient) return;

    postSubmitButton.disabled = true;
    showPostFeedback('Publishing...');

    try {
        const { data: { session }, error: sessionError } = await supabaseClient.auth.getSession();
        if (sessionError) throw sessionError;
        if (!session) throw new Error('Sign in to publish a post.');

        const { error } = await supabaseClient.from('posts').insert({
            author_id: session.user.id,
            title: postTitleInput.value.trim(),
            body: postBodyInput.value.trim()
        });

        if (error) throw error;

        postForm.reset();
        showPostFeedback('Post published.');
        await loadPosts();
    } catch (error) {
        showPostFeedback(error.message || 'Could not publish your post.', true);
    } finally {
        postSubmitButton.disabled = false;
    }
});

refreshPostsButton.addEventListener('click', () => {
    loadPosts().catch((error) => showPostFeedback(error.message, true));
});
})();