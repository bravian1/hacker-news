var itemIds = [];
        var itemList = [];
        var itemLimit = 20;
        var offset = 0;
        var busy = false;
        var scrollThrottle = null;
        var lastUpdateTime = Date.now();
        var checkInterval = 60000; // Check for updates every minute

        var pageType = 'list';
        var currentSection = 'stories';

        var baseURL = 'https://hacker-news.firebaseio.com/v0';
        
        function changeSection(section) {
            currentSection = section;
            itemIds = [];
            itemList = [];
            offset = 0;
            document.getElementById('content').innerHTML = '';
            document.getElementById('content').classList.add('hidden');
            document.getElementById('scroll_text').classList.add('hidden');

            document.querySelectorAll('#navbar a').forEach(a => a.classList.remove('active'));
            document.getElementById('nav-' + section).classList.add('active');

            var endpoint;
            switch(section) {
                case 'jobs':
                    endpoint = '/jobstories.json';
                    break;
                case 'polls':
                    endpoint = '/pollstories.json';
                    break;
                case 'newest':
                    endpoint = '/newstories.json';
                    break;
                default:
                    endpoint = '/topstories.json';
            }

            fetch(baseURL + endpoint)
                .then(response => response.json())
                .then(topItems => {
                    itemIds = topItems;
                    offset = 0;
                    itemList = [];
                    document.getElementById('content').innerHTML = '';
                    getMoreItems();
                    if (section === 'newest') {
                        startUpdates();
                    } else {
                        stopUpdates();
                    }
                });
            lastUpdateTime = Date.now();
            document.getElementById('update_notification').classList.add('hidden');
        }

        function getMoreItems() {
            if (busy) return;
            busy = true;

            var start = offset;
            var end = Math.min(start + itemLimit, itemIds.length);
            var itemsToLoad = itemIds.slice(start, end);

            Promise.all(itemsToLoad.map(id => 
                fetch(baseURL + '/item/' + id + '.json').then(response => response.json())
            )).then(results => {
                results.forEach(item => {
                    if (item) {
                        itemList.push(item);
                        document.getElementById('content').insertAdjacentHTML('beforeend', entryFormat(item));
                    }
                });

                offset = end;
                busy = false;
                document.getElementById('content').classList.remove('hidden');
                document.getElementById('scroll_text').classList.remove('hidden');

                if (end >= itemIds.length) {
                    document.getElementById('scroll_text').textContent = 'No more items to load';
                }
            });
        }

        function formatDateTime(unixTimestamp) {
            var date = new Date(unixTimestamp * 1000);
            return date.toLocaleString();
        }

        function updateNewestStories() {
            if (currentSection === 'newest') {
                fetch(baseURL + '/newstories.json')
                    .then(response => response.json())
                    .then(newItems => {
                        var latestItemId = newItems[0];
                        if (latestItemId > itemIds[0]) {
                            var newStories = newItems.filter(id => id > itemIds[0]).slice(0, 20);
                            Promise.all(newStories.map(item => 
                                fetch(baseURL + '/item/' + item + '.json').then(response => response.json())
                            )).then(results => {
                                results.sort((a, b) => b.time - a.time);

                                results.forEach(result => {
                                    if (result) {
                                        document.getElementById('content').insertAdjacentHTML('afterbegin', entryFormat(result));
                                        itemIds.unshift(result.id);
                                        itemList.unshift(result);
                                    }
                                });

                                document.getElementById('update_notification').textContent = results.length + ' new stories added!';
                                document.getElementById('update_notification').classList.remove('hidden');
                                setTimeout(() => {
                                    document.getElementById('update_notification').classList.add('hidden');
                                }, 3000);
                            });
                        }
                    });
            }
        }

        var updateInterval;

        function startUpdates() {
            updateInterval = setInterval(updateNewestStories, 30000); // Check every 30 seconds
        }

        function stopUpdates() {
            clearInterval(updateInterval);
        }

        function entryFormat(data, full) {
            if (!data) return '';

            var link;
            if (data.type === 'poll') {
                link = `<a class="lead" href="#" onclick="viewItem(${data.id})" data-id="${data.id}">${data.title}</a>`;
            } else {
                link = data.url ? 
                `<a class="lead" target="_blank" href="${data.url}">${data.title}</a>` :
                `<a class="lead" href="#" onclick="viewItem(${data.id})" data-id="${data.id}">${data.title}</a>`;
            }
            var comments = data.kids ? data.kids.length : 0;
            var commentLink =  full ? ''
                : `| <b><span class="comment_link" data-id="${data.id}" onclick="viewItem(${data.id})">${comments} comments</span></b>`,
                dateTime = `<span class="post-date">${formatDateTime(data.time)}</span>`,
                entryArgs = [
                '<div class="item_entry">',
                link,
                '<p>',
                data.score,
                'points',
                ` by ${data.by}`,
                ` | ${dateTime}`,
                commentLink,
                '</p>',
                '</div>',
            ];

            var blurb = entryArgs.join(' ');
            var extra = `<p>${data.text || ''}</p><h3>${comments} comments</h3>`;

            if (full)
                return blurb + extra;
            return blurb;
        }

        function getPollOptions(pollId) {
            return fetch(baseURL + '/item/' + pollId + '.json')
                .then(response => response.json())
                .then(poll => {
                    if (!poll || !poll.parts) return '';
                    return Promise.all(poll.parts.map(partId => 
                        fetch(baseURL + '/item/' + partId + '.json').then(response => response.json())
                    )).then(options => {
                        var optionsHtml = '<div class="poll-options">';
                        options.forEach(option => {
                            if (option) {
                                optionsHtml += '<div class="poll-option">';
                                optionsHtml += `<p>${option.text}</p>`;
                                optionsHtml += `<p>Score: ${option.score}</p>`;
                                optionsHtml += '</div>';
                            }
                        });
                        optionsHtml += '</div>';
                        return optionsHtml;
                    });
                });
        }

        function viewItem(id) {
            var item = itemList.find(item => item.id === id);
            if (!item) return;

            var numComments = item.kids ? item.kids.length : 0;

            history.pushState({}, "", "item/" + id);
            document.getElementById('item_meta').innerHTML = entryFormat(item, true);
            document.getElementById('front_page').classList.add('hidden');
            document.getElementById('title').classList.add('hidden');
            document.getElementById('navbar').classList.add('hidden');
            document.getElementById('item').classList.remove('hidden');
            document.getElementById('back_button').classList.remove('hidden');
            pageType = 'post';

            if (item.type === 'poll') {
                getPollOptions(id).then(pollOptionsHtml => {
                    document.getElementById('item_meta').insertAdjacentHTML('beforeend', pollOptionsHtml);
                });
            }

            getTopComments(item);
        }

        function getTopComments(item) {
            var commentIds = item.kids;

            document.getElementById('comment_field').innerHTML = '';

            if (!commentIds) return;

            getCommentsRecursive(commentIds, document.getElementById('comment_field'));
        }

        function getCommentsRecursive(commentIds, parentElement) {
            if (!commentIds || commentIds.length === 0) {
                return Promise.resolve();
            }

            return Promise.all(commentIds.map(commentId => 
                fetch(baseURL + '/item/' + commentId + '.json').then(response => response.json())
            )).then(results => {
                results.sort((a, b) => (b ? b.time : 0) - (a ? a.time : 0));

                results.forEach(comment => {
                    var commentElement = createCommentElement(comment);
                    parentElement.appendChild(commentElement);

                    if (comment && comment.kids && comment.kids.length > 0) {
                        var childrenContainer = document.createElement('div');
                        childrenContainer.className = 'comment_children';
                        commentElement.appendChild(childrenContainer);
                        return getCommentsRecursive(comment.kids, childrenContainer);
                    }
                });
            });
        }

        function createCommentElement(comment) {
            var commentElement = document.createElement('div');
            commentElement.className = 'comment_blurb';

            if (!comment || comment.deleted) {
                commentElement.innerHTML = '<p><strong>[Deleted]</strong></p><p>[This comment has been deleted]</p>';
            } else {
                var text = comment.text || '[No content]';
                var by = `<strong>${comment.by}</strong>`;
                var time = `<span class="time_since">${getDateSincePost(comment.time)}</span>`;
                commentElement.innerHTML = `<p>${by} ${time}</p><p class="comment_text">${text}</p>`;
            }

            return commentElement;
        }

        function backToFrontPage() {
            history.back();
            document.getElementById('item').classList.add('hidden');
            document.getElementById('back_button').classList.add('hidden');
            document.getElementById('front_page').classList.remove('hidden');
            document.getElementById('title').classList.remove('hidden');
            document.getElementById('navbar').classList.remove('hidden');
            pageType = 'list';
        }

        function getDateSincePost(postDate) {
            var timeSince = (Date.now() / 1000) - postDate;
            var days = Math.floor(timeSince / (60 * 60 * 24));

            if (days)
                return days + " days ago";

            var hours = Math.floor(timeSince / (60 * 60));

            if (hours)
                return hours + " hours ago";

            var minutes = Math.floor(timeSince / 60);

            return minutes + " minutes ago";
        }

        window.addEventListener('scroll', () => {
            clearTimeout(scrollThrottle);
            scrollThrottle = setTimeout(() => {
                if (pageType === 'list') {
                    if ((window.innerHeight + window.scrollY) >= document.body.offsetHeight - 100) {
                        getMoreItems();
                    }
                }
            }, 300);
        });

        changeSection('stories');

        document.getElementById('nav-stories').addEventListener('click', () => changeSection('stories'));
        document.getElementById('nav-jobs').addEventListener('click', () => changeSection('jobs'));
        document.getElementById('nav-polls').addEventListener('click', () => changeSection('polls'));
        document.getElementById('nav-newest').addEventListener('click', () => changeSection('newest'));
        document.getElementById('back_button').addEventListener('click', backToFrontPage);