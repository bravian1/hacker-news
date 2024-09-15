const baseURL = 'https://hacker-news.firebaseio.com/v0';
let itemIds = [], itemList = [], offset = 0, busy = false;
let pageType = 'list', currentSection = 'stories';
let updateInterval;

const loadItems = (endpoint) => {
    fetch(`${baseURL}${endpoint}`)
        .then(response => response.json())
        .then(items => {
            itemIds = items || [];
            offset = 0;
            itemList = [];
            document.getElementById('content').innerHTML = '';
            getMoreItems();
            currentSection === 'newest' ? startUpdates() : stopUpdates();
        })
        .catch(error => {
            console.error('Error fetching items:', error);
            itemIds = [];
            document.getElementById('content').innerHTML = '<p>Error loading items. Please try again later.</p>';
        });
};

const changeSection = (section) => {
    currentSection = section;
    document.querySelectorAll('#navbar a').forEach(a => a.classList.remove('active'));
    document.getElementById(`nav-${section}`).classList.add('active');
    ['content', 'scroll_text'].forEach(id => document.getElementById(id).classList.add('hidden'));

    const endpoints = {
        jobs: '/jobstories.json',
        polls: '/askstories.json',
        newest: '/newstories.json',
        stories: '/topstories.json'
    };

    loadItems(endpoints[section]);
    document.getElementById('update_notification').classList.add('hidden');
};

const getMoreItems = () => {
    if (busy || !Array.isArray(itemIds)) return;
    busy = true;

    const start = offset;
    const end = Math.min(start + 20, itemIds.length);
    
    Promise.all(itemIds.slice(start, end).map(id => 
        fetch(`${baseURL}/item/${id}.json`).then(response => response.json())
    )).then(results => {
        results.forEach(item => {
            if (item) {
                itemList.push(item);
                document.getElementById('content').insertAdjacentHTML('beforeend', entryFormat(item));
            }
        });

        offset = end;
        busy = false;
        ['content', 'scroll_text'].forEach(id => document.getElementById(id).classList.remove('hidden'));
        if (end >= itemIds.length) {
            document.getElementById('scroll_text').textContent = 'No more items to load';
        }
    }).catch(error => {
        console.error('Error fetching items:', error);
        busy = false;
    });
};

const formatDateTime = (unixTimestamp) => new Date(unixTimestamp * 1000).toLocaleString();

const updateNewestStories = () => {
    if (currentSection !== 'newest') return;

    fetch(`${baseURL}/newstories.json`)
        .then(response => response.json())
        .then(newItems => {
            const latestItemId = newItems[0];
            if (latestItemId > itemIds[0]) {
                const newStories = newItems.filter(id => id > itemIds[0]).slice(0, 20);
                Promise.all(newStories.map(item => 
                    fetch(`${baseURL}/item/${item}.json`).then(response => response.json())
                )).then(results => {
                    results.sort((a, b) => b.time - a.time).forEach(result => {
                        if (result) {
                            document.getElementById('content').insertAdjacentHTML('afterbegin', entryFormat(result));
                            itemIds.unshift(result.id);
                            itemList.unshift(result);
                        }
                    });

                    const notification = document.getElementById('update_notification');
                    notification.textContent = `${results.length} new stories added!`;
                    notification.classList.remove('hidden');
                    setTimeout(() => notification.classList.add('hidden'), 3000);
                });
            }
        });
};

const startUpdates = () => updateInterval = setInterval(updateNewestStories, 30000);
const stopUpdates = () => clearInterval(updateInterval);

const entryFormat = (data, full = false) => {
    if (!data) return '';

    const link = data.type === 'poll' || !data.url ?
        `<a class="lead" href="#" onclick="viewItem(${data.id})" data-id="${data.id}">${data.title}</a>` :
        `<a class="lead" target="_blank" href="${data.url}">${data.title}</a>`;

    const comments = data.kids ? data.kids.length : 0;
    const commentLink = full ? '' : `| <b><span class="comment_link" data-id="${data.id}" onclick="viewItem(${data.id})">${comments} comments</span></b>`;
    const dateTime = `<span class="post-date">${formatDateTime(data.time)}</span>`;

    const blurb = `
        <div class="item_entry">
            ${link}
            <p>
                ${data.score} points by ${data.by} | ${dateTime} ${commentLink}
            </p>
        </div>
    `;

    return full ? blurb + `<p>${data.text || ''}</p><h3>${comments} comments</h3>` : blurb;
};

const getPollOptions = (pollId) => {
    return fetch(`${baseURL}/item/${pollId}.json`)
        .then(response => response.json())
        .then(poll => {
            if (!poll || !poll.parts) return '';
            return Promise.all(poll.parts.map(partId => 
                fetch(`${baseURL}/item/${partId}.json`).then(response => response.json())
            )).then(options => {
                return `
                    <div class="poll-options">
                        ${options.map(option => option ? `
                            <div class="poll-option">
                                <p>${option.text}</p>
                                <p>Score: ${option.score}</p>
                            </div>
                        ` : '').join('')}
                    </div>
                `;
            });
        });
};

const viewItem = (id) => {
    const item = itemList.find(item => item.id === id);
    if (!item) return;

    history.pushState({}, "", `item/${id}`);
    document.getElementById('item_meta').innerHTML = entryFormat(item, true);
    ['front_page', 'title', 'navbar'].forEach(id => document.getElementById(id).classList.add('hidden'));
    ['item', 'back_button'].forEach(id => document.getElementById(id).classList.remove('hidden'));
    pageType = 'post';

    if (item.type === 'poll') {
        getPollOptions(id).then(pollOptionsHtml => {
            document.getElementById('item_meta').insertAdjacentHTML('beforeend', pollOptionsHtml);
        });
    }

    getTopComments(item);
};

const getTopComments = (item) => {
    document.getElementById('comment_field').innerHTML = '';
    if (item.kids) getCommentsRecursive(item.kids, document.getElementById('comment_field'));
};

const getCommentsRecursive = (commentIds, parentElement) => {
    if (!commentIds || commentIds.length === 0) return Promise.resolve();

    return Promise.all(commentIds.map(commentId => 
        fetch(`${baseURL}/item/${commentId}.json`).then(response => response.json())
    )).then(results => {
        results.sort((a, b) => (b ? b.time : 0) - (a ? a.time : 0));

        results.forEach(comment => {
            const commentElement = createCommentElement(comment);
            parentElement.appendChild(commentElement);

            if (comment && comment.kids && comment.kids.length > 0) {
                const childrenContainer = document.createElement('div');
                childrenContainer.className = 'comment_children';
                commentElement.appendChild(childrenContainer);
                return getCommentsRecursive(comment.kids, childrenContainer);
            }
        });
    });
};

const createCommentElement = (comment) => {
    const commentElement = document.createElement('div');
    commentElement.className = 'comment_blurb';

    if (!comment || comment.deleted) {
        commentElement.innerHTML = '<p><strong>[Deleted]</strong></p><p>[This comment has been deleted]</p>';
    } else {
        const text = comment.text || '[No content]';
        const by = `<strong>${comment.by}</strong>`;
        const time = `<span class="time_since">${getDateSincePost(comment.time)}</span>`;
        commentElement.innerHTML = `<p>${by} ${time}</p><p class="comment_text">${text}</p>`;
    }

    return commentElement;
};

const backToFrontPage = () => {
    history.back();
    ['item', 'back_button'].forEach(id => document.getElementById(id).classList.add('hidden'));
    ['front_page', 'title', 'navbar'].forEach(id => document.getElementById(id).classList.remove('hidden'));
    pageType = 'list';
};

const getDateSincePost = (postDate) => {
    const timeSince = (Date.now() / 1000) - postDate;
    const days = Math.floor(timeSince / (60 * 60 * 24));
    if (days) return `${days} days ago`;
    const hours = Math.floor(timeSince / (60 * 60));
    if (hours) return `${hours} hours ago`;
    const minutes = Math.floor(timeSince / 60);
    return `${minutes} minutes ago`;
};

window.addEventListener('scroll', () => {
    clearTimeout(window.scrollThrottle);
    window.scrollThrottle = setTimeout(() => {
        if (pageType === 'list' && (window.innerHeight + window.scrollY) >= document.body.offsetHeight - 100) {
            getMoreItems();
        }
    }, 300);
});

changeSection('stories');

['stories', 'jobs', 'polls', 'newest'].forEach(section => {
    document.getElementById(`nav-${section}`).addEventListener('click', () => changeSection(section));
});

document.getElementById('back_button').addEventListener('click', backToFrontPage);