(() => {
const postForm = document.querySelector('#post-form');
const postTitleInput = document.querySelector('#post-title');
const postBodyInput = document.querySelector('#post-body');
const postSubmitButton = document.querySelector('#post-submit');
const postFeedback = document.querySelector('#post-feedback');
const postList = document.querySelector('#post-list');
const refreshPostsButton = document.querySelector('#refresh-posts');
const accountLink = document.querySelector('#account-link');
const config = window.FROGCHAT_SUPABASE_CONFIG;
const supabaseClient = config && window.supabase
    ? window.supabase.createClient(config.url, config.anonKey)
    : null;
let loadedPosts = [];
let isSignedIn = false;

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
        const username = post.profiles?.username || 'frogchat member';
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

        const repliesSection = document.createElement('section');
        repliesSection.className = 'post-replies';

        const repliesHeading = document.createElement('h4');
        repliesHeading.className = 'replies-heading';
        repliesHeading.textContent = `Replies (${post.replies.length})`;
        repliesSection.append(repliesHeading);

        if (post.replies.length > 0) {
            const replyList = document.createElement('div');
            replyList.className = 'reply-list';

            post.replies.forEach((reply) => {
                const replyItem = document.createElement('article');
                replyItem.className = 'reply-item';

                const replyMeta = document.createElement('p');
                replyMeta.className = 'reply-meta';
                const replyUsername = reply.profiles?.username || 'frogchat member';
                if (reply.profiles?.id) {
                    const profileLink = document.createElement('a');
                    profileLink.className = 'post-profile-link';
                    profileLink.href = `users.html#user-${encodeURIComponent(reply.profiles.id)}`;
                    profileLink.textContent = replyUsername;
                    replyMeta.append(profileLink, ` | ${new Date(reply.created_at).toLocaleString()}`);
                } else {
                    replyMeta.textContent = `${replyUsername} | ${new Date(reply.created_at).toLocaleString()}`;
                }

                const replyBody = document.createElement('p');
                replyBody.className = 'reply-body';
                replyBody.textContent = reply.body;
                replyItem.append(replyMeta, replyBody);
                replyList.append(replyItem);
            });

            repliesSection.append(replyList);
        }

        const replyFeedback = document.createElement('p');
        replyFeedback.className = 'reply-feedback';
        replyFeedback.setAttribute('role', 'status');

        if (isSignedIn) {
            const replyForm = document.createElement('form');
            replyForm.className = 'reply-form';
            replyForm.dataset.postId = post.id;

            const replyInput = document.createElement('textarea');
            replyInput.name = 'body';
            replyInput.rows = 2;
            replyInput.maxLength = 2000;
            replyInput.placeholder = 'Write a reply...';
            replyInput.setAttribute('aria-label', `Reply to ${post.title}`);
            replyInput.required = true;

            const replySubmit = document.createElement('button');
            replySubmit.className = 'reply-submit-button';
            replySubmit.type = 'submit';
            replySubmit.textContent = 'Reply';

            replyForm.append(replyInput, replySubmit);
            repliesSection.append(replyForm, replyFeedback);
        } else {
            const signInLink = document.createElement('a');
            signInLink.className = 'reply-signin-link';
            signInLink.href = 'index.html';
            signInLink.textContent = 'Sign in to reply';
            repliesSection.append(signInLink);
        }

        article.append(title, meta, body, repliesSection);
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

    const posts = data || [];
    let replies = [];
    let migrationNeeded = false;
    if (posts.length > 0) {
        const { data: replyData, error: replyError } = await supabaseClient
            .from('replies')
            .select('id, post_id, body, created_at, profiles(id, username)')
            .in('post_id', posts.map((post) => post.id))
            .order('created_at', { ascending: true });

        if (replyError) {
            if (replyError.code === 'PGRST205' || replyError.code === '42P01') {
                migrationNeeded = true;
            } else {
                showPostFeedback(replyError.message, true);
                return;
            }
        } else {
            replies = replyData || [];
        }
    }

    const repliesByPost = new Map();
    replies.forEach((reply) => {
        const postReplies = repliesByPost.get(reply.post_id) || [];
        postReplies.push(reply);
        repliesByPost.set(reply.post_id, postReplies);
    });

    loadedPosts = posts.map((post) => ({
        ...post,
        replies: repliesByPost.get(post.id) || []
    }));
    renderPosts(loadedPosts);
    showPostFeedback(migrationNeeded ? 'Run database/schema.sql in Supabase to enable replies.' : '');
}

if (!supabaseClient) {
    if (postSubmitButton) postSubmitButton.disabled = true;
    refreshPostsButton.disabled = true;
    showPostFeedback('Connect your Supabase project to load posts.', true);
} else {
    supabaseClient.auth.onAuthStateChange((_event, session) => {
        isSignedIn = Boolean(session?.user);
        accountLink.hidden = !isSignedIn;
        if (postForm) postForm.hidden = !isSignedIn;
        if (loadedPosts.length > 0) renderPosts(loadedPosts);
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

postList.addEventListener('submit', async (event) => {
    const replyForm = event.target.closest('.reply-form');
    if (!replyForm) return;
    event.preventDefault();
    if (!supabaseClient) return;

    const submitButton = replyForm.querySelector('button[type="submit"]');
    const replyInput = replyForm.querySelector('textarea');
    const replyFeedback = replyForm.nextElementSibling;
    submitButton.disabled = true;
    replyFeedback.textContent = 'Sending reply...';
    replyFeedback.classList.remove('is-error');

    try {
        const { data: { session }, error: sessionError } = await supabaseClient.auth.getSession();
        if (sessionError) throw sessionError;
        if (!session) throw new Error('Sign in to reply.');

        const { error } = await supabaseClient.from('replies').insert({
            post_id: replyForm.dataset.postId,
            author_id: session.user.id,
            body: replyInput.value.trim()
        });
        if (error) throw error;

        await loadPosts();
    } catch (error) {
        replyFeedback.textContent = error.code === 'PGRST205' || error.code === '42P01'
            ? 'Run database/schema.sql in Supabase to enable replies.'
            : error.message || 'Could not send your reply.';
        replyFeedback.classList.add('is-error');
    } finally {
        submitButton.disabled = false;
    }
});

refreshPostsButton.addEventListener('click', () => {
    loadPosts().catch((error) => showPostFeedback(error.message, true));
});
})();