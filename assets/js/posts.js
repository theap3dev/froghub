(() => {
const postForm = document.querySelector('#post-form');
const postTitleInput = document.querySelector('#post-title');
const postBodyInput = document.querySelector('#post-body');
const postImageInput = document.querySelector('#post-image');
const postImagePreview = document.querySelector('#post-image-preview');
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
let postImagePreviewUrl = null;
const imageExtensions = new Map([
    ['image/jpeg', 'jpg'],
    ['image/png', 'png'],
    ['image/webp', 'webp'],
    ['image/gif', 'gif']
]);
const maxPostImageSize = 8 * 1024 * 1024;

function showPostFeedback(message, isError = false) {
    postFeedback.textContent = message;
    postFeedback.classList.toggle('is-error', isError);
}

function isMissingColumn(error, column) {
    const description = `${error?.message || ''} ${error?.details || ''}`.toLowerCase();
    return (error?.code === '42703' || error?.code === 'PGRST204')
        && description.includes(column);
}

function updatePostImagePreview() {
    if (postImagePreviewUrl) URL.revokeObjectURL(postImagePreviewUrl);
    postImagePreviewUrl = null;
    postImagePreview.hidden = true;
    postImagePreview.removeAttribute('src');

    const image = postImageInput.files[0];
    if (!image) return;
    if (!imageExtensions.has(image.type)) {
        postImageInput.value = '';
        showPostFeedback('Choose a JPEG, PNG, WebP, or GIF image.', true);
        return;
    }
    if (image.size > maxPostImageSize) {
        postImageInput.value = '';
        showPostFeedback('The photo must be 8 MB or smaller.', true);
        return;
    }

    postImagePreviewUrl = URL.createObjectURL(image);
    postImagePreview.src = postImagePreviewUrl;
    postImagePreview.hidden = false;
    showPostFeedback(`${image.name} is ready to upload.`);
}

function createPostAvatar(profile, username) {
    const avatar = profile?.avatar_path ? document.createElement('img') : document.createElement('span');
    avatar.className = 'post-author-avatar';
    avatar.setAttribute('aria-hidden', 'true');

    if (profile?.avatar_path) {
        avatar.alt = '';
        avatar.src = supabaseClient.storage.from('avatars').getPublicUrl(profile.avatar_path).data.publicUrl;
        avatar.addEventListener('error', () => {
            const fallback = document.createElement('span');
            fallback.className = 'post-author-avatar post-author-avatar-fallback';
            fallback.textContent = username.charAt(0).toUpperCase();
            avatar.replaceWith(fallback);
        }, { once: true });
    } else {
        avatar.classList.add('post-author-avatar-fallback');
        avatar.textContent = username.charAt(0).toUpperCase();
    }

    return avatar;
}

function getProfileUrl(profile) {
    if (!profile.username) return `users.html#user-${encodeURIComponent(profile.id)}`;

    const usernamePath = encodeURIComponent(profile.username);
    const profilePath = window.location.hostname === 'theap3dev.github.io'
        ? `users/${usernamePath}`
        : `404.html?username=${usernamePath}`;
    return new URL(profilePath, window.location.href).href;
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
            profileLink.className = 'post-profile-link post-author-link';
            profileLink.href = getProfileUrl(post.profiles);
            const usernameLabel = document.createElement('span');
            usernameLabel.textContent = username;
            profileLink.append(createPostAvatar(post.profiles, username), usernameLabel);
            meta.append('Posted by ', profileLink, ` | ${date}`);
        } else {
            meta.textContent = `Posted by ${username} | ${date}`;
        }

        const body = document.createElement('p');
        body.className = 'post-body';
        body.textContent = post.body;

        const postImage = post.image_path ? document.createElement('img') : null;
        if (postImage) {
            postImage.className = 'post-image';
            postImage.alt = `Photo attached to ${post.title}`;
            postImage.loading = 'lazy';
            postImage.src = supabaseClient.storage.from('post-images').getPublicUrl(post.image_path).data.publicUrl;
            postImage.addEventListener('error', () => { postImage.hidden = true; }, { once: true });
        }

        const repliesSection = document.createElement('details');
        repliesSection.className = 'post-replies';

        const repliesHeading = document.createElement('summary');
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
                    profileLink.href = getProfileUrl(reply.profiles);
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

        article.append(title, meta, body);
        if (postImage) article.append(postImage);
        article.append(repliesSection);
        postList.append(article);
    });
}

async function loadPosts() {
    showPostFeedback('Loading posts...');
    postList.replaceChildren();

    let data;
    let error;
    let avatarMigrationNeeded = false;
    let imageMigrationNeeded = false;
    let includeAvatarPath = true;
    let includeImagePath = true;
    while (true) {
        const postColumns = ['id', 'title', 'body', 'created_at'];
        if (includeImagePath) postColumns.push('image_path');
        const profileColumns = includeAvatarPath ? 'id, username, avatar_path' : 'id, username';
        ({ data, error } = await supabaseClient
            .from('posts')
            .select(`${postColumns.join(', ')}, profiles(${profileColumns})`)
            .order('created_at', { ascending: false })
            .limit(50));
        if (!error) break;
        if (includeImagePath && isMissingColumn(error, 'image_path')) {
            includeImagePath = false;
            imageMigrationNeeded = true;
            continue;
        }
        if (includeAvatarPath && isMissingColumn(error, 'avatar_path')) {
            includeAvatarPath = false;
            avatarMigrationNeeded = true;
            continue;
        }
        break;
    }

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
    const notices = [];
    if (avatarMigrationNeeded) notices.push('Run database/schema.sql in Supabase to enable profile photos.');
    if (imageMigrationNeeded) notices.push('Run database/schema.sql in Supabase to enable post photos.');
    if (migrationNeeded) notices.push('Run database/schema.sql in Supabase to enable replies.');
    showPostFeedback(notices.join(' '));
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

        const image = postImageInput.files[0];
        let imagePath = null;
        if (image) {
            const extension = imageExtensions.get(image.type);
            imagePath = `${session.user.id}/${crypto.randomUUID()}.${extension}`;
            const { error: uploadError } = await supabaseClient.storage
                .from('post-images')
                .upload(imagePath, image, { contentType: image.type, upsert: false });
            if (uploadError) throw uploadError;
        }

        const { error } = await supabaseClient.from('posts').insert({
            author_id: session.user.id,
            title: postTitleInput.value.trim(),
            body: postBodyInput.value.trim(),
            image_path: imagePath
        });

        if (error) {
            if (imagePath) await supabaseClient.storage.from('post-images').remove([imagePath]);
            if (isMissingColumn(error, 'image_path')) {
                throw new Error('Run database/schema.sql in Supabase to enable post photos.');
            }
            throw error;
        }

        postForm.reset();
        updatePostImagePreview();
        showPostFeedback('Post published.');
        await loadPosts();
    } catch (error) {
        showPostFeedback(error.message || 'Could not publish your post.', true);
    } finally {
        postSubmitButton.disabled = false;
    }
});

if (postImageInput) postImageInput.addEventListener('change', updatePostImagePreview);

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